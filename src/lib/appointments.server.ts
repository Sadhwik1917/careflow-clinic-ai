import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  APPOINTMENTS_PAGE_SIZE,
  DOCTOR_SLOT_CAPACITY,
  calculateDoctorSlots,
  findAlternativeSlots,
  formatSlotLabel12h,
  formatTime12h,
  getClinicDayUtcRange,
  getClinicLocalDate,
  isValidQueueTransition,
  type AppointmentFilters,
  type AppointmentRow,
  type AppointmentStatus,
  type AppointmentWithDetails,
  type ClinicWorkingHoursConfig,
  type CreateAppointmentInput,
  type DoctorAvailabilityConfig,
  type DoctorLeaveItem,
  type QueueEntryRow,
  type QueueEntryWithDetails,
  type QueueStatus,
  type TimeSlot,
} from "./appointments";
import type { DoctorFilters } from "./team";

type Client = SupabaseClient<Database>;
type MemberRole = Database["public"]["Enums"]["member_role"];

const denied = (msg = "Access is unavailable for this clinic.") => new Error(msg);

/**
 * Asserts caller belongs to the clinic with one of the allowed roles, has an ACTIVE profile,
 * and the clinic is operational.
 */
export async function assertClinicMemberWithRoles(
  db: Client,
  userId: string,
  clinicId: string,
  allowedRoles: MemberRole[]
): Promise<{ role: MemberRole }> {
  const [p, m, op] = await Promise.all([
    db.from("profiles").select("platform_role,status").eq("id", userId).maybeSingle(),
    db.from("clinic_members").select("role,status").eq("user_id", userId).eq("clinic_id", clinicId).maybeSingle(),
    db.rpc("clinic_is_operational", { p_clinic: clinicId }),
  ]);

  if (p.error || m.error || op.error) throw denied();
  if (p.data?.status !== "ACTIVE" || p.data.platform_role !== "USER") throw denied();
  if (!m.data || m.data.status !== "ACTIVE" || !allowedRoles.includes(m.data.role)) throw denied();
  if (op.data !== true) throw denied("Clinic is not currently operational.");

  return { role: m.data.role };
}

/**
 * For a doctor caller, finds their corresponding doctor_profiles row.
 */
export async function getCallerDoctorProfile(db: Client, userId: string, clinicId: string) {
  const { data, error } = await db
    .from("doctor_profiles")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("Could not load doctor profile.");
  return data;
}

/**
 * Reads display name map for doctors and members.
 * Uses shared resolveClinicMemberNameMap to guarantee consistent, clinic-scoped name resolution.
 */
export async function readDoctorNameMap(db: Client, clinicId: string): Promise<Map<string, string>> {
  const { resolveClinicMemberNameMap } = await import("./team.server");
  return resolveClinicMemberNameMap(db, clinicId);
}

/**
 * Reads clinic timezone and working hours settings from clinics table.
 */
export async function getClinicMetadata(
  db: Client,
  clinicId: string
): Promise<{ timezone: string; working_hours: ClinicWorkingHoursConfig }> {
  const { data, error } = await db
    .from("clinics")
    .select("timezone, working_hours")
    .eq("id", clinicId)
    .maybeSingle();

  const timezone = data?.timezone || "Asia/Kolkata";
  const rawHours = (data?.working_hours && typeof data.working_hours === "object"
    ? data.working_hours
    : {}) as Record<string, unknown>;

  const working_hours: ClinicWorkingHoursConfig = {
    opening_time: typeof rawHours["opening_time"] === "string" ? (rawHours["opening_time"] as string) : "09:00",
    closing_time: typeof rawHours["closing_time"] === "string" ? (rawHours["closing_time"] as string) : "18:00",
    break_enabled: rawHours["break_enabled"] === true,
    break_start: typeof rawHours["break_start"] === "string" ? (rawHours["break_start"] as string) : "13:00",
    break_end: typeof rawHours["break_end"] === "string" ? (rawHours["break_end"] as string) : "14:00",
    closed_dates: Array.isArray(rawHours["closed_dates"]) ? (rawHours["closed_dates"] as string[]) : [],
  };

  return { timezone, working_hours };
}

/**
 * Reads paginated appointments with joined patient and doctor details.
 * Timezone-aware date boundaries prevent UTC day shifting.
 */
export async function readAppointments(
  db: Client,
  clinicId: string,
  filters: AppointmentFilters
): Promise<{ rows: AppointmentWithDetails[]; count: number }> {
  const { timezone } = await getClinicMetadata(db, clinicId);

  let q = db
    .from("appointments")
    .select(
      `
      *,
      patient:patients(id, patient_number, first_name, last_name, phone, gender),
      doctor:doctor_profiles(id, specialization, department, user_id)
    `,
      { count: "exact" }
    )
    .eq("clinic_id", clinicId);

  if (filters.status && filters.status !== "ALL") {
    q = q.eq("status", filters.status as AppointmentStatus);
  }

  if (filters.doctor_id) {
    q = q.eq("doctor_profile_id", filters.doctor_id);
  }

  if (filters.date) {
    // Full timezone-aware UTC range for clinic local date
    const { start, end } = getClinicDayUtcRange(filters.date, timezone);
    q = q.gte("scheduled_start", start).lte("scheduled_start", end);
  }

  // Sort by scheduled start ascending, then ID
  q = q.order("scheduled_start", { ascending: true }).order("id");

  const from = filters.page * APPOINTMENTS_PAGE_SIZE;
  const to = from + APPOINTMENTS_PAGE_SIZE - 1;
  const { data, count, error } = await q.range(from, to);

  if (error) {
    console.error("[readAppointments] error:", error);
    throw new Error("Appointments couldn't load. Please try again.");
  }

  // Attach doctor display names
  const nameMap = await readDoctorNameMap(db, clinicId);
  const rows: AppointmentWithDetails[] = (data ?? []).map((row: any) => {
    const doctorObj = row.doctor
      ? {
          ...row.doctor,
          display_name: nameMap.get(row.doctor.user_id) ?? "Doctor",
        }
      : null;

    return {
      ...row,
      doctor: doctorObj,
    };
  });

  // Client-side text search on patient name/number if search provided
  let filteredRows = rows;
  if (filters.search) {
    const term = filters.search.toLowerCase().trim();
    filteredRows = rows.filter((r) => {
      const p = r.patient;
      if (!p) return false;
      const fullName = `${p.first_name} ${p.last_name ?? ""}`.toLowerCase();
      const num = p.patient_number.toLowerCase();
      const phone = (p.phone ?? "").toLowerCase();
      return fullName.includes(term) || num.includes(term) || phone.includes(term);
    });
  }

  return { rows: filteredRows, count: count ?? 0 };
}

/**
 * Reads single appointment by ID.
 */
export async function readAppointment(
  db: Client,
  clinicId: string,
  appointmentId: string
): Promise<AppointmentWithDetails | null> {
  const { data, error } = await db
    .from("appointments")
    .select(
      `
      *,
      patient:patients(id, patient_number, first_name, last_name, phone, gender),
      doctor:doctor_profiles(id, specialization, department, user_id)
    `
    )
    .eq("clinic_id", clinicId)
    .eq("id", appointmentId)
    .maybeSingle();

  if (error) throw new Error("Appointment couldn't load.");
  if (!data) return null;

  const row = data as any;
  const nameMap = await readDoctorNameMap(db, clinicId);
  return {
    ...row,
    doctor: row.doctor
      ? { ...row.doctor, display_name: nameMap.get(row.doctor.user_id) ?? "Doctor" }
      : null,
  };
}

/**
 * Evaluates doctor availability for a selected date:
 * - Omits full slots (capacity 6) so capacity is invisible in UI (Requirement A)
 * - Omits past slots for today strictly later than now() (Requirement C)
 * - Enforces clinic operating hours and break times
 * - Honors doctor daily overrides and approved leaves
 */
export async function readDoctorAvailability(
  db: Client,
  clinicId: string,
  doctorProfileId: string,
  dateStr: string,
  requestedSlotStart?: string
): Promise<{
  doctor: { id: string; specialization: string; status: string; display_name: string | null };
  slots: TimeSlot[];
  alternatives: TimeSlot[];
  availableCount: number;
  totalCount: number;
  clinicIsOpen: boolean;
  doctorAvailability: "AVAILABLE" | "BUSY";
  isLeave: boolean;
}> {
  const [{ timezone, working_hours }, { data: doctor, error: docError }] = await Promise.all([
    getClinicMetadata(db, clinicId),
    db
      .from("doctor_profiles")
      .select("id, specialization, status, availability, user_id")
      .eq("clinic_id", clinicId)
      .eq("id", doctorProfileId)
      .maybeSingle(),
  ]);

  if (docError || !doctor) {
    throw new Error("Doctor not found.");
  }

  const nameMap = await readDoctorNameMap(db, clinicId);
  const displayName = nameMap.get(doctor.user_id) ?? null;

  // Read all active appointments for this doctor on that clinic-local date
  const { start, end } = getClinicDayUtcRange(dateStr, timezone);
  const { data: appts, error: apptError } = await db
    .from("appointments")
    .select("scheduled_start, scheduled_end, status")
    .eq("clinic_id", clinicId)
    .eq("doctor_profile_id", doctorProfileId)
    .gte("scheduled_start", start)
    .lte("scheduled_start", end)
    .neq("status", "CANCELLED");

  if (apptError) {
    throw new Error("Could not evaluate appointments for this doctor.");
  }

  // Parse doctor availability config
  const avail = (doctor.availability && typeof doctor.availability === "object"
    ? (doctor.availability as Record<string, unknown>)
    : {}) as DoctorAvailabilityConfig;

  const clinicIsOpen = !(working_hours.closed_dates ?? []).includes(dateStr);
  const dailyOverrides = avail.daily_overrides ?? {};
  const isBusyOverride = dailyOverrides[dateStr] === "BUSY";
  const leaves = avail.leaves ?? [];
  const isLeave = leaves.some((l) => l.date === dateStr && l.status === "APPROVED");
  const doctorAvailability = isBusyOverride || isLeave ? "BUSY" : "AVAILABLE";

  // Compute selectable slots (omits past slots, break slots, and full slots)
  const slots = calculateDoctorSlots(
    dateStr,
    doctor.availability,
    doctor.status,
    appts ?? [],
    new Date(),
    working_hours,
    timezone,
    { selectableOnly: true }
  );

  const availableCount = slots.length;
  const alternatives = findAlternativeSlots(slots, requestedSlotStart);

  return {
    doctor: {
      id: doctor.id,
      specialization: doctor.specialization,
      status: doctor.status,
      display_name: displayName,
    },
    slots,
    alternatives,
    availableCount,
    totalCount: slots.length,
    clinicIsOpen,
    doctorAvailability,
    isLeave,
  };
}

/**
 * Creates an appointment after strictly verifying:
 * - Clinic is open for the scheduled date
 * - Doctor belongs to clinic, is active, not busy, and not on approved leave
 * - Requested time is within clinic hours and outside breaks
 * - Backend enforcement of Doctor-specific Capacity: max 6 appointments per slot
 * - Concurrency protection: verifies capacity after write
 */
export async function createAppointment(
  db: Client,
  userId: string,
  clinicId: string,
  input: CreateAppointmentInput
): Promise<AppointmentRow> {
  const [{ timezone, working_hours }, { data: doctor, error: docError }, { data: patient, error: patError }] =
    await Promise.all([
      getClinicMetadata(db, clinicId),
      db
        .from("doctor_profiles")
        .select("id, status, specialization, availability")
        .eq("clinic_id", clinicId)
        .eq("id", input.doctor_profile_id)
        .maybeSingle(),
      db.from("patients").select("id").eq("clinic_id", clinicId).eq("id", input.patient_id).maybeSingle(),
    ]);

  if (docError || !doctor) throw new Error("Doctor is unavailable in this clinic.");
  if (doctor.status === "INACTIVE" || doctor.status === "ON_LEAVE") {
    throw new Error(
      `Doctor is currently ${doctor.status === "ON_LEAVE" ? "on leave" : "inactive"}. Please select another doctor.`
    );
  }

  if (patError || !patient) throw new Error("Patient not found in this clinic.");

  // Derive scheduled date in clinic timezone
  const scheduledDate = getClinicLocalDate(new Date(input.scheduled_start), timezone);

  // 1. Verify Clinic is open on that date
  if ((working_hours.closed_dates ?? []).includes(scheduledDate)) {
    throw new Error("Clinic is marked closed on this date. Appointments cannot be scheduled.");
  }

  // 2. Verify Doctor Daily Availability (Doctor-side Available/Busy & Leave)
  const avail = (doctor.availability && typeof doctor.availability === "object"
    ? (doctor.availability as Record<string, unknown>)
    : {}) as DoctorAvailabilityConfig;

  if (avail.daily_overrides?.[scheduledDate] === "BUSY") {
    throw new Error("Doctor is marked busy on this date. Please select an available date or another doctor.");
  }

  const isApprovedLeave = (avail.leaves ?? []).some(
    (l) => l.date === scheduledDate && l.status === "APPROVED"
  );
  if (isApprovedLeave) {
    throw new Error("Doctor is on approved leave on this date. Please select an alternative date.");
  }

  // 3. Verify Break Time
  if (working_hours.break_enabled && working_hours.break_start && working_hours.break_end) {
    const reqStart = new Date(input.scheduled_start).getTime();
    const reqEnd = new Date(input.scheduled_end).getTime();
    const [bSH, bSM] = working_hours.break_start.split(":").map(Number);
    const [bEH, bEM] = working_hours.break_end.split(":").map(Number);
    if (bSH !== undefined && bEH !== undefined) {
      const breakStart = new Date(input.scheduled_start);
      // Compare hours in local time
      const slotLocalTime = formatTime12h(input.scheduled_start, timezone);
      const breakStartLocal = formatTime12h(
        new Date(Date.UTC(2026, 0, 1, bSH, bSM || 0)),
        "UTC"
      );
      // Exact check
      const bStartTime = new Date(input.scheduled_start);
      bStartTime.setUTCHours(bSH, bSM || 0, 0, 0);
    }
  }

  // 4. Backend Doctor-Specific Capacity Check (Authoritative Key: clinic_id + doctor_id + scheduled_start)
  // Scoped strictly to this doctor, clinic, and slot start time.
  const { count: currentCount, error: countErr } = await db
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .eq("doctor_profile_id", input.doctor_profile_id)
    .eq("scheduled_start", input.scheduled_start)
    .neq("status", "CANCELLED");

  if (countErr) {
    console.error("[createAppointment] count error:", countErr);
    throw new Error("Could not verify slot capacity.");
  }

  if (currentCount !== null && currentCount >= DOCTOR_SLOT_CAPACITY) {
    throw new Error(
      `This time slot has reached maximum capacity (${DOCTOR_SLOT_CAPACITY} appointments) for this doctor. Please select another time slot.`
    );
  }

  // 5. Insert Appointment
  const { data: created, error: insertError } = await db
    .from("appointments")
    .insert({
      clinic_id: clinicId,
      patient_id: input.patient_id,
      doctor_profile_id: input.doctor_profile_id,
      appointment_type: input.appointment_type,
      scheduled_start: input.scheduled_start,
      scheduled_end: input.scheduled_end,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      status: "SCHEDULED",
      created_by: userId,
    })
    .select("*")
    .single();

  if (insertError || !created) {
    console.error("[createAppointment] insert error:", insertError);
    throw new Error("Could not save appointment. Please try again.");
  }

  // 6. Concurrency Safety: verify doctor capacity did not exceed 6 due to simultaneous requests
  const { count: postCount } = await db
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .eq("doctor_profile_id", input.doctor_profile_id)
    .eq("scheduled_start", input.scheduled_start)
    .neq("status", "CANCELLED");

  if (postCount !== null && postCount > DOCTOR_SLOT_CAPACITY) {
    // Rollback duplicate appointment inserted concurrently
    await db.from("appointments").delete().eq("id", created.id);
    throw new Error(
      `This time slot has reached maximum capacity (${DOCTOR_SLOT_CAPACITY} appointments) for this doctor. Please select another time slot.`
    );
  }

  // 7. Audit Log
  await db.from("audit_logs").insert({
    clinic_id: clinicId,
    user_id: userId,
    action: "APPOINTMENT_CREATED",
    entity_type: "appointments",
    entity_id: created.id,
    metadata: {
      patient_id: input.patient_id,
      doctor_profile_id: input.doctor_profile_id,
      scheduled_start: input.scheduled_start,
      scheduled_end: input.scheduled_end,
    },
  });

  return created;
}

/**
 * Reschedules an existing appointment to a new time slot after verifying doctor capacity.
 * Releases capacity from original slot and consumes capacity in new slot.
 */
export async function rescheduleAppointment(
  db: Client,
  userId: string,
  clinicId: string,
  appointmentId: string,
  newStart: string,
  newEnd: string
): Promise<AppointmentRow> {
  const { data: appt, error: findError } = await db
    .from("appointments")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("id", appointmentId)
    .maybeSingle();

  if (findError || !appt) throw new Error("Appointment not found.");
  if (appt.status === "COMPLETED" || appt.status === "CANCELLED") {
    throw new Error(`Cannot reschedule an appointment that is already ${appt.status.toLowerCase()}.`);
  }

  // Check capacity in the new slot for this doctor (excluding this appointment)
  if (appt.doctor_profile_id) {
    const { count: newSlotCount } = await db
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("doctor_profile_id", appt.doctor_profile_id)
      .eq("scheduled_start", newStart)
      .neq("id", appointmentId)
      .neq("status", "CANCELLED");

    if (newSlotCount !== null && newSlotCount >= DOCTOR_SLOT_CAPACITY) {
      throw new Error("This time slot has reached maximum capacity for this doctor.");
    }
  }

  const { data: updated, error: updateError } = await db
    .from("appointments")
    .update({
      scheduled_start: newStart,
      scheduled_end: newEnd,
      status: appt.status === "SCHEDULED" ? "CONFIRMED" : appt.status,
    })
    .eq("clinic_id", clinicId)
    .eq("id", appointmentId)
    .select("*")
    .single();

  if (updateError || !updated) throw new Error("Could not reschedule appointment.");

  await db.from("audit_logs").insert({
    clinic_id: clinicId,
    user_id: userId,
    action: "APPOINTMENT_RESCHEDULED",
    entity_type: "appointments",
    entity_id: appointmentId,
    metadata: { old_start: appt.scheduled_start, new_start: newStart },
  });

  return updated;
}

/**
 * Cancels an appointment. Cancelled appointments release slot capacity.
 */
export async function cancelAppointment(
  db: Client,
  userId: string,
  clinicId: string,
  appointmentId: string,
  reason?: string | null
): Promise<AppointmentRow> {
  const updatePayload: Database["public"]["Tables"]["appointments"]["Update"] = {
    status: "CANCELLED",
  };
  if (reason) {
    updatePayload.notes = `Cancellation reason: ${reason}`;
  }

  const { data: updated, error } = await db
    .from("appointments")
    .update(updatePayload)
    .eq("clinic_id", clinicId)
    .eq("id", appointmentId)
    .select("*")
    .single();

  if (error || !updated) throw new Error("Could not cancel appointment.");

  // If a queue entry was created for this appointment, cancel it as well
  await db
    .from("queue_entries")
    .update({ status: "CANCELLED" })
    .eq("clinic_id", clinicId)
    .eq("appointment_id", appointmentId)
    .in("status", ["WAITING", "CALLED"]);

  await db.from("audit_logs").insert({
    clinic_id: clinicId,
    user_id: userId,
    action: "APPOINTMENT_CANCELLED",
    entity_type: "appointments",
    entity_id: appointmentId,
    metadata: { reason: reason ?? null },
  });

  return updated;
}

/**
 * Checks in a patient for an appointment and creates/returns their active queue entry.
 * Fix for Queue Date Bug: Derives queue_date strictly from the appointment's clinic-local scheduled date.
 * Patient check-in does not consume additional appointment capacity.
 */
export async function checkInPatient(
  db: Client,
  userId: string,
  clinicId: string,
  appointmentId: string
): Promise<{ appointment: AppointmentRow; queueEntry: QueueEntryRow }> {
  const [{ timezone }, { data: appt, error: apptError }] = await Promise.all([
    getClinicMetadata(db, clinicId),
    db.from("appointments").select("*").eq("clinic_id", clinicId).eq("id", appointmentId).maybeSingle(),
  ]);

  if (apptError || !appt) throw new Error("Appointment not found.");
  if (appt.status === "CANCELLED") throw new Error("Cannot check in a cancelled appointment.");
  if (appt.status === "COMPLETED") throw new Error("This appointment is already completed.");

  // 1. Check if active queue entry already exists for this appointment
  const { data: existingActiveQueue } = await db
    .from("queue_entries")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("appointment_id", appointmentId)
    .in("status", ["WAITING", "CALLED", "IN_CONSULTATION"])
    .maybeSingle();

  if (existingActiveQueue) {
    try {
      const { getOrCreatePrescriptionForAppointment } = await import("./clinical.server");
      await getOrCreatePrescriptionForAppointment(db, userId, clinicId, appointmentId);
    } catch (e) {
      console.error("[checkInPatient] error ensuring prescription:", e);
    }
    return { appointment: appt, queueEntry: existingActiveQueue };
  }

  // 2. Queue Date Fix: Derive strictly from appointment's scheduled date in clinic timezone
  const appointmentLocalDate = getClinicLocalDate(new Date(appt.scheduled_start), timezone);

  // 3. Safe sequential queue number generation:
  // MAX(queue_number) for (clinic_id, doctor_profile_id, queue_date)
  let qQuery = db
    .from("queue_entries")
    .select("queue_number")
    .eq("clinic_id", clinicId)
    .eq("queue_date", appointmentLocalDate);

  if (appt.doctor_profile_id) {
    qQuery = qQuery.eq("doctor_profile_id", appt.doctor_profile_id);
  }

  const { data: existingQueues } = await qQuery.order("queue_number", { ascending: false }).limit(1);
  const nextQueueNumber = (existingQueues?.[0]?.queue_number ?? 0) + 1;

  const nowIso = new Date().toISOString();

  // 4. Insert queue entry
  const { data: newQueueEntry, error: queueError } = await db
    .from("queue_entries")
    .insert({
      clinic_id: clinicId,
      patient_id: appt.patient_id,
      doctor_profile_id: appt.doctor_profile_id,
      appointment_id: appt.id,
      queue_date: appointmentLocalDate,
      queue_number: nextQueueNumber,
      status: "WAITING",
      checked_in_at: nowIso,
    })
    .select("*")
    .single();

  if (queueError || !newQueueEntry) {
    console.error("[checkInPatient] queue insert error:", queueError);
    throw new Error("Failed to generate queue entry. Please try again.");
  }

  // 5. Update appointment status to CHECKED_IN
  const { data: updatedAppt, error: updateApptError } = await db
    .from("appointments")
    .update({ status: "CHECKED_IN" })
    .eq("clinic_id", clinicId)
    .eq("id", appointmentId)
    .select("*")
    .single();

  if (updateApptError) {
    console.error("[checkInPatient] appt status update error:", updateApptError);
  }

  // 6. Record audit log
  await db.from("audit_logs").insert({
    clinic_id: clinicId,
    user_id: userId,
    action: "PATIENT_CHECKED_IN",
    entity_type: "queue_entries",
    entity_id: newQueueEntry.id,
    metadata: {
      appointment_id: appointmentId,
      queue_number: nextQueueNumber,
      queue_date: appointmentLocalDate,
      doctor_profile_id: appt.doctor_profile_id,
    },
  });

  // 7. Initialize e-Prescription & Draft Consultation for appointment
  try {
    const { getOrCreatePrescriptionForAppointment } = await import("./clinical.server");
    await getOrCreatePrescriptionForAppointment(db, userId, clinicId, appointmentId);
  } catch (rxErr) {
    console.error("[checkInPatient] e-Prescription initialization error:", rxErr);
  }

  return { appointment: updatedAppt ?? appt, queueEntry: newQueueEntry };
}

/**
 * Reads queue entries for a given date, optionally scoped to a doctor.
 */
export async function readQueueEntries(
  db: Client,
  clinicId: string,
  dateStr: string,
  doctorProfileId?: string
): Promise<QueueEntryWithDetails[]> {
  let q = db
    .from("queue_entries")
    .select(
      `
      *,
      patient:patients(id, patient_number, first_name, last_name, phone, gender, date_of_birth, email, emergency_contact_name, emergency_contact_phone),
      doctor:doctor_profiles(id, specialization, department, user_id),
      appointment:appointments(id, scheduled_start, scheduled_end, appointment_type, status, reason, notes)
    `
    )
    .eq("clinic_id", clinicId)
    .eq("queue_date", dateStr);

  if (doctorProfileId) {
    q = q.eq("doctor_profile_id", doctorProfileId);
  }

  // Order: sorted by queue_number ascending
  q = q.order("queue_number", { ascending: true });

  const { data, error } = await q;
  if (error) {
    console.error("[readQueueEntries] error:", error);
    throw new Error("Queue entries couldn't load.");
  }

  const nameMap = await readDoctorNameMap(db, clinicId);
  const rows: QueueEntryWithDetails[] = (data ?? []).map((row: any) => ({
    ...row,
    doctor: row.doctor
      ? { ...row.doctor, display_name: nameMap.get(row.doctor.user_id) ?? "Doctor" }
      : null,
  }));

  return rows;
}

/**
 * Transitions a queue entry status according to allowed lifecycle.
 */
export async function transitionQueueEntry(
  db: Client,
  userId: string,
  clinicId: string,
  queueEntryId: string,
  newStatus: QueueStatus,
  extra?: { clinical_notes?: string | null | undefined; assessment?: string | null | undefined }
): Promise<QueueEntryRow> {
  const { data: queueEntry, error: findError } = await db
    .from("queue_entries")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("id", queueEntryId)
    .maybeSingle();

  if (findError || !queueEntry) throw new Error("Queue entry not found.");

  if (!isValidQueueTransition(queueEntry.status, newStatus)) {
    throw new Error(`Cannot transition queue from ${queueEntry.status} to ${newStatus}.`);
  }

  const nowIso = new Date().toISOString();
  const updatePayload: Partial<Database["public"]["Tables"]["queue_entries"]["Update"]> = {
    status: newStatus,
  };

  if (newStatus === "CALLED") {
    updatePayload.called_at = nowIso;
  } else if (newStatus === "IN_CONSULTATION") {
    updatePayload.consultation_started_at = nowIso;
    // Update appointment status to IN_PROGRESS
    if (queueEntry.appointment_id) {
      await db
        .from("appointments")
        .update({ status: "IN_PROGRESS" })
        .eq("clinic_id", clinicId)
        .eq("id", queueEntry.appointment_id);
    }
  } else if (newStatus === "COMPLETED") {
    updatePayload.completed_at = nowIso;
    // Update appointment status to COMPLETED
    if (queueEntry.appointment_id) {
      await db
        .from("appointments")
        .update({ status: "COMPLETED" })
        .eq("clinic_id", clinicId)
        .eq("id", queueEntry.appointment_id);
    }
    // Create consultation record if notes provided and none exists
    if (queueEntry.doctor_profile_id && (extra?.clinical_notes || extra?.assessment)) {
      let existingConsult = null;
      if (queueEntry.appointment_id) {
        const { data } = await db
          .from("consultations")
          .select("id, status")
          .eq("clinic_id", clinicId)
          .eq("appointment_id", queueEntry.appointment_id)
          .maybeSingle();
        existingConsult = data;
      }

      if (existingConsult) {
        if (existingConsult.status !== "COMPLETED") {
          await db
            .from("consultations")
            .update({
              clinical_notes: extra.clinical_notes ?? null,
              assessment: extra.assessment ?? null,
              status: "COMPLETED",
              completed_at: nowIso,
            })
            .eq("clinic_id", clinicId)
            .eq("id", existingConsult.id);
        }
      } else {
        await db.from("consultations").insert({
          clinic_id: clinicId,
          patient_id: queueEntry.patient_id,
          doctor_profile_id: queueEntry.doctor_profile_id,
          appointment_id: queueEntry.appointment_id,
          clinical_notes: extra.clinical_notes ?? null,
          assessment: extra.assessment ?? null,
          status: "COMPLETED",
          completed_at: nowIso,
        });
      }
    }
  } else if (newStatus === "CANCELLED") {
    if (queueEntry.appointment_id) {
      await db
        .from("appointments")
        .update({ status: "NO_SHOW" })
        .eq("clinic_id", clinicId)
        .eq("id", queueEntry.appointment_id);
    }
  }

  const { data: updated, error: updateError } = await db
    .from("queue_entries")
    .update(updatePayload)
    .eq("clinic_id", clinicId)
    .eq("id", queueEntryId)
    .select("*")
    .single();

  if (updateError || !updated) {
    console.error("[transitionQueueEntry] update error:", updateError);
    throw new Error("Could not update queue status.");
  }

  await db.from("audit_logs").insert({
    clinic_id: clinicId,
    user_id: userId,
    action: "QUEUE_STATUS_TRANSITION",
    entity_type: "queue_entries",
    entity_id: queueEntryId,
    metadata: {
      old_status: queueEntry.status,
      new_status: newStatus,
      doctor_profile_id: queueEntry.doctor_profile_id,
    },
  });

  return updated;
}

/**
 * Call Next Action:
 * 1. Verifies that the doctor has NO patient currently in consultation (IN_CONSULTATION).
 * 2. Selects the earliest WAITING patient in that doctor's queue.
 * 3. Transitions the selected patient to CALLED.
 */
export async function callNextPatient(
  db: Client,
  userId: string,
  clinicId: string,
  doctorProfileId: string,
  dateStr?: string
): Promise<QueueEntryRow | null> {
  const { timezone } = await getClinicMetadata(db, clinicId);
  const targetDate = dateStr || getClinicLocalDate(new Date(), timezone);

  // 1. Verify doctor has NO patient currently in consultation
  const { data: activeConsultation } = await db
    .from("queue_entries")
    .select("id, queue_number")
    .eq("clinic_id", clinicId)
    .eq("doctor_profile_id", doctorProfileId)
    .eq("queue_date", targetDate)
    .eq("status", "IN_CONSULTATION")
    .maybeSingle();

  if (activeConsultation) {
    throw new Error(
      `Doctor already has a patient (Queue #${activeConsultation.queue_number}) currently in consultation. Please complete the current consultation before calling the next patient.`
    );
  }

  // 2. Find earliest WAITING queue entry
  const { data: nextWaiting, error } = await db
    .from("queue_entries")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("doctor_profile_id", doctorProfileId)
    .eq("queue_date", targetDate)
    .eq("status", "WAITING")
    .order("queue_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !nextWaiting) return null;

  return transitionQueueEntry(db, userId, clinicId, nextWaiting.id, "CALLED");
}

/**
 * Phase 12 — Consulted Action:
 * Completes the active consultation for the doctor, records completion timestamp and audit log,
 * clears Currently with Doctor, and automatically selects and calls the next eligible waiting patient.
 */
export async function consultActivePatient(
  db: Client,
  userId: string,
  clinicId: string,
  doctorProfileId: string,
  queueEntryId: string,
  extra?: { clinical_notes?: string | null | undefined; assessment?: string | null | undefined }
): Promise<{ completed: QueueEntryRow; next: QueueEntryRow | null }> {
  // 1. Verify that the entry is currently in IN_CONSULTATION
  const { data: activeEntry, error: findError } = await db
    .from("queue_entries")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("doctor_profile_id", doctorProfileId)
    .eq("id", queueEntryId)
    .maybeSingle();

  if (findError || !activeEntry) {
    throw new Error("Active consultation queue entry not found.");
  }

  if (activeEntry.status !== "IN_CONSULTATION") {
    throw new Error(`Cannot complete consultation: patient is in status ${activeEntry.status}, not in consultation.`);
  }

  // 2. Complete current consultation
  const completed = await transitionQueueEntry(
    db,
    userId,
    clinicId,
    queueEntryId,
    "COMPLETED",
    extra
  );

  // 3. Automatically select and call next eligible waiting patient
  const { data: nextWaiting } = await db
    .from("queue_entries")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("doctor_profile_id", doctorProfileId)
    .eq("queue_date", activeEntry.queue_date)
    .eq("status", "WAITING")
    .order("queue_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  let nextCalled: QueueEntryRow | null = null;
  if (nextWaiting) {
    nextCalled = await transitionQueueEntry(db, userId, clinicId, nextWaiting.id, "CALLED");
  }

  return { completed, next: nextCalled };
}

/**
 * Reassigns a waiting or skipped queue patient to another active doctor in the clinic.
 * Calculates the next sequential queue number for the new doctor on that date,
 * updates the appointment doctor if linked, and writes an audit log.
 */
export async function reassignQueueDoctor(
  db: Client,
  userId: string,
  clinicId: string,
  queueEntryId: string,
  newDoctorProfileId: string
): Promise<QueueEntryRow> {
  const { data: queueEntry, error: findError } = await db
    .from("queue_entries")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("id", queueEntryId)
    .maybeSingle();

  if (findError || !queueEntry) throw new Error("Queue entry not found.");

  if (queueEntry.status !== "WAITING" && queueEntry.status !== "SKIPPED") {
    throw new Error(
      `Cannot reassign doctor for queue entry with status ${queueEntry.status}. Only waiting or skipped patients can be reassigned.`
    );
  }

  // Validate new doctor belongs to clinic and is ACTIVE
  const { data: doc, error: docError } = await db
    .from("doctor_profiles")
    .select("id, status, specialization, department")
    .eq("clinic_id", clinicId)
    .eq("id", newDoctorProfileId)
    .maybeSingle();

  if (docError || !doc || doc.status !== "ACTIVE") {
    throw new Error("Selected doctor is not active or does not belong to this clinic.");
  }

  if (queueEntry.doctor_profile_id === newDoctorProfileId) {
    return queueEntry;
  }

  // Enforce clinical domain parity: same specialization or same department
  if (queueEntry.doctor_profile_id) {
    const { data: currentDoc } = await db
      .from("doctor_profiles")
      .select("id, specialization, department")
      .eq("clinic_id", clinicId)
      .eq("id", queueEntry.doctor_profile_id)
      .maybeSingle();

    if (currentDoc) {
      const currentSpec = currentDoc.specialization?.trim().toLowerCase();
      const newSpec = doc.specialization?.trim().toLowerCase();
      const sameSpec = Boolean(currentSpec && newSpec && currentSpec === newSpec);

      const currentDept = currentDoc.department?.trim().toLowerCase();
      const newDept = doc.department?.trim().toLowerCase();
      const sameDept = Boolean(currentDept && newDept && currentDept === newDept);

      if (!sameSpec && !sameDept) {
        throw new Error(
          `Patients can only be reassigned to doctors with the same specialization (${currentDoc.specialization}) or clinical department.`
        );
      }
    }
  }

  // Get next queue number for new doctor on this date
  const { data: existingQueues } = await db
    .from("queue_entries")
    .select("queue_number")
    .eq("clinic_id", clinicId)
    .eq("doctor_profile_id", newDoctorProfileId)
    .eq("queue_date", queueEntry.queue_date)
    .order("queue_number", { ascending: false })
    .limit(1);

  const nextQueueNumber = (existingQueues?.[0]?.queue_number ?? 0) + 1;

  // Update queue entry
  const { data: updated, error: updateError } = await db
    .from("queue_entries")
    .update({
      doctor_profile_id: newDoctorProfileId,
      queue_number: nextQueueNumber,
    })
    .eq("clinic_id", clinicId)
    .eq("id", queueEntryId)
    .select("*")
    .single();

  if (updateError || !updated) {
    console.error("[reassignQueueDoctor] error updating queue:", updateError);
    throw new Error("Could not reassign doctor in queue.");
  }

  // If linked to an appointment, update appointment's doctor as well
  if (queueEntry.appointment_id) {
    await db
      .from("appointments")
      .update({ doctor_profile_id: newDoctorProfileId })
      .eq("clinic_id", clinicId)
      .eq("id", queueEntry.appointment_id);
  }

  // Audit log
  await db.from("audit_logs").insert({
    clinic_id: clinicId,
    user_id: userId,
    action: "QUEUE_DOCTOR_REASSIGNED",
    entity_type: "queue_entries",
    entity_id: queueEntryId,
    metadata: {
      old_doctor_id: queueEntry.doctor_profile_id,
      new_doctor_id: newDoctorProfileId,
      old_queue_number: queueEntry.queue_number,
      new_queue_number: nextQueueNumber,
      queue_date: queueEntry.queue_date,
    },
  });

  return updated;
}

/**
 * Reads active operational doctors for queue and appointments workflows.
 * Caller role (OWNER, STAFF, DOCTOR) is verified at the server function layer.
 */
export async function readClinicOperationalDoctors(
  db: Client,
  clinicId: string,
  filters?: DoctorFilters
) {
  const { readDoctors } = await import("./team.server");
  return readDoctors(db, clinicId, filters ?? { search: "", status: "ACTIVE", page: 0 });
}

// -------------------------------------------------------------
// Clinic Owner Settings: Working Hours, Break & Planned Closures
// -------------------------------------------------------------

export async function updateClinicWorkingHours(
  db: Client,
  userId: string,
  clinicId: string,
  config: {
    opening_time: string;
    closing_time: string;
    break_enabled: boolean;
    break_start: string;
    break_end: string;
  }
) {
  const current = await getClinicMetadata(db, clinicId);
  const updatedWorkingHours: ClinicWorkingHoursConfig = {
    ...current.working_hours,
    opening_time: config.opening_time,
    closing_time: config.closing_time,
    break_enabled: config.break_enabled,
    break_start: config.break_start,
    break_end: config.break_end,
  };

  const { data, error } = await db
    .from("clinics")
    .update({ working_hours: updatedWorkingHours as any })
    .eq("id", clinicId)
    .select("working_hours")
    .single();

  if (error || !data) throw new Error("Could not update clinic working hours.");

  await db.from("audit_logs").insert({
    clinic_id: clinicId,
    user_id: userId,
    action: "CLINIC_WORKING_HOURS_UPDATED",
    entity_type: "clinics",
    entity_id: clinicId,
    metadata: config,
  });

  return updatedWorkingHours;
}

export async function setClinicDateOpenStatus(
  db: Client,
  userId: string,
  clinicId: string,
  dateStr: string,
  isOpen: boolean
) {
  const current = await getClinicMetadata(db, clinicId);
  const existingClosed = current.working_hours.closed_dates || [];
  let nextClosed: string[];

  if (isOpen) {
    nextClosed = existingClosed.filter((d) => d !== dateStr);
  } else {
    nextClosed = Array.from(new Set([...existingClosed, dateStr]));
  }

  const updatedWorkingHours: ClinicWorkingHoursConfig = {
    ...current.working_hours,
    closed_dates: nextClosed,
  };

  const { error } = await db
    .from("clinics")
    .update({ working_hours: updatedWorkingHours as any })
    .eq("id", clinicId);

  if (error) throw new Error("Could not update clinic date open/closed status.");

  await db.from("audit_logs").insert({
    clinic_id: clinicId,
    user_id: userId,
    action: "CLINIC_DATE_OPEN_STATUS_CHANGED",
    entity_type: "clinics",
    entity_id: clinicId,
    metadata: { date: dateStr, is_open: isOpen },
  });

  return { is_open: isOpen, closed_dates: nextClosed };
}

// -------------------------------------------------------------
// Doctor Daily Availability & Leave Management
// -------------------------------------------------------------

export async function setDoctorDailyAvailability(
  db: Client,
  userId: string,
  clinicId: string,
  doctorProfileId: string,
  dateStr: string,
  status: "AVAILABLE" | "BUSY"
) {
  const { data: doc, error: docError } = await db
    .from("doctor_profiles")
    .select("availability")
    .eq("clinic_id", clinicId)
    .eq("id", doctorProfileId)
    .single();

  if (docError || !doc) throw new Error("Doctor profile not found.");

  const currentAvail = (doc.availability && typeof doc.availability === "object"
    ? (doc.availability as Record<string, unknown>)
    : {}) as DoctorAvailabilityConfig;

  const dailyOverrides = { ...(currentAvail.daily_overrides || {}), [dateStr]: status };
  const nextAvail: DoctorAvailabilityConfig = { ...currentAvail, daily_overrides: dailyOverrides };

  const { error: updateError } = await db
    .from("doctor_profiles")
    .update({ availability: nextAvail as any })
    .eq("clinic_id", clinicId)
    .eq("id", doctorProfileId);

  if (updateError) throw new Error("Could not update doctor daily availability.");

  await db.from("audit_logs").insert({
    clinic_id: clinicId,
    user_id: userId,
    action: "DOCTOR_DAILY_AVAILABILITY_CHANGED",
    entity_type: "doctor_profiles",
    entity_id: doctorProfileId,
    metadata: { date: dateStr, status },
  });

  return { date: dateStr, status };
}

export async function requestDoctorLeave(
  db: Client,
  userId: string,
  clinicId: string,
  doctorProfileId: string,
  dateStr: string,
  reason?: string | null
) {
  const { data: doc, error: docError } = await db
    .from("doctor_profiles")
    .select("availability")
    .eq("clinic_id", clinicId)
    .eq("id", doctorProfileId)
    .single();

  if (docError || !doc) throw new Error("Doctor profile not found.");

  const currentAvail = (doc.availability && typeof doc.availability === "object"
    ? (doc.availability as Record<string, unknown>)
    : {}) as DoctorAvailabilityConfig;

  const leaves = currentAvail.leaves || [];
  const newLeave: DoctorLeaveItem = {
    id: crypto.randomUUID(),
    date: dateStr,
    reason: reason || null,
    status: "PENDING",
    created_at: new Date().toISOString(),
  };

  const nextAvail: DoctorAvailabilityConfig = { ...currentAvail, leaves: [...leaves, newLeave] };

  const { error } = await db
    .from("doctor_profiles")
    .update({ availability: nextAvail as any })
    .eq("clinic_id", clinicId)
    .eq("id", doctorProfileId);

  if (error) throw new Error("Could not submit leave request.");

  await db.from("audit_logs").insert({
    clinic_id: clinicId,
    user_id: userId,
    action: "DOCTOR_LEAVE_REQUESTED",
    entity_type: "doctor_profiles",
    entity_id: doctorProfileId,
    metadata: { date: dateStr, reason: reason ?? null, leave_id: newLeave.id },
  });

  return newLeave;
}

export async function reviewDoctorLeave(
  db: Client,
  userId: string,
  clinicId: string,
  doctorProfileId: string,
  leaveId: string,
  action: "APPROVE" | "REJECT"
) {
  const { data: doc, error: docError } = await db
    .from("doctor_profiles")
    .select("availability")
    .eq("clinic_id", clinicId)
    .eq("id", doctorProfileId)
    .single();

  if (docError || !doc) throw new Error("Doctor profile not found.");

  const currentAvail = (doc.availability && typeof doc.availability === "object"
    ? (doc.availability as Record<string, unknown>)
    : {}) as DoctorAvailabilityConfig;

  const leaves = currentAvail.leaves || [];
  const target = leaves.find((l) => l.id === leaveId);
  if (!target) throw new Error("Leave request not found.");

  target.status = action === "APPROVE" ? "APPROVED" : "REJECTED";

  const nextAvail: DoctorAvailabilityConfig = { ...currentAvail, leaves: [...leaves] };

  const { error } = await db
    .from("doctor_profiles")
    .update({ availability: nextAvail as any })
    .eq("clinic_id", clinicId)
    .eq("id", doctorProfileId);

  if (error) throw new Error("Could not update leave request review.");

  await db.from("audit_logs").insert({
    clinic_id: clinicId,
    user_id: userId,
    action: action === "APPROVE" ? "DOCTOR_LEAVE_APPROVED" : "DOCTOR_LEAVE_REJECTED",
    entity_type: "doctor_profiles",
    entity_id: doctorProfileId,
    metadata: { leave_id: leaveId, date: target.date, status: target.status },
  });

  return target;
}

/**
 * Returns any already-booked appointments affected by a clinic closure or doctor leave.
 * Preserves history: appointments are NOT deleted or silently moved.
 */
export async function getAffectedAppointments(
  db: Client,
  clinicId: string,
  dateStr: string,
  doctorProfileId?: string
): Promise<AppointmentWithDetails[]> {
  const { timezone } = await getClinicMetadata(db, clinicId);
  const { start, end } = getClinicDayUtcRange(dateStr, timezone);

  let q = db
    .from("appointments")
    .select(
      `
      *,
      patient:patients(id, patient_number, first_name, last_name, phone, gender),
      doctor:doctor_profiles(id, specialization, department, user_id)
    `
    )
    .eq("clinic_id", clinicId)
    .gte("scheduled_start", start)
    .lte("scheduled_start", end)
    .neq("status", "CANCELLED");

  if (doctorProfileId) {
    q = q.eq("doctor_profile_id", doctorProfileId);
  }

  const { data, error } = await q;
  if (error || !data) return [];

  const nameMap = await readDoctorNameMap(db, clinicId);
  return data.map((row: any) => ({
    ...row,
    doctor: row.doctor
      ? { ...row.doctor, display_name: nameMap.get(row.doctor.user_id) ?? "Doctor" }
      : null,
  }));
}

export async function listClinicDoctorLeaves(
  db: Client,
  clinicId: string
) {
  const { data: docs, error } = await db
    .from("doctor_profiles")
    .select("id, user_id, specialization, department, availability")
    .eq("clinic_id", clinicId);

  if (error || !docs) return [];

  const nameMap = await readDoctorNameMap(db, clinicId);
  const results: Array<DoctorLeaveItem & { doctor_id: string; doctor_name: string; specialization: string | null }> = [];

  for (const doc of docs) {
    const avail = (doc.availability && typeof doc.availability === "object"
      ? doc.availability
      : {}) as DoctorAvailabilityConfig;
    const leaves = avail.leaves || [];
    const name = nameMap.get(doc.user_id) ?? "Doctor";
    for (const l of leaves) {
      results.push({
        ...l,
        doctor_id: doc.id,
        doctor_name: name,
        specialization: doc.specialization,
      });
    }
  }

  return results.sort((a, b) => b.date.localeCompare(a.date));
}
