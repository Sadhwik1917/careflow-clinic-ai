import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assertTeamOwner, resolveClinicMemberNameMap } from "./team.server";
import { getClinicMetadata, getAffectedAppointments } from "./appointments.server";
import { getClinicLocalDate, type DoctorAvailabilityConfig } from "./appointments";
import type {
  AttendanceRecord,
  AttendanceSummary,
  AttendanceCounts,
  AttendanceMemberItem,
  AttendanceAnalyticsResult,
  AttendanceDayTrend,
  MarkDoctorAbsentInput,
  RecordAttendanceInput,
} from "./attendance";

type Client = SupabaseClient<Database>;

export interface AffectedAppointmentSummary {
  id: string;
  scheduled_start: string;
  patient_name: string;
}

/** Asserts caller is an active clinic member (OWNER, DOCTOR, or STAFF) of an operational clinic. */
export async function assertClinicTeamMember(db: Client, userId: string, clinicId: string) {
  const [p, m, op] = await Promise.all([
    db.from("profiles").select("platform_role,status").eq("id", userId).maybeSingle(),
    db.from("clinic_members").select("role,status").eq("user_id", userId).eq("clinic_id", clinicId).maybeSingle(),
    db.rpc("clinic_is_operational", { p_clinic: clinicId }),
  ]);
  if (
    p.error ||
    m.error ||
    op.error ||
    p.data?.status !== "ACTIVE" ||
    m.data?.status !== "ACTIVE" ||
    op.data !== true ||
    !["OWNER", "DOCTOR", "STAFF"].includes(m.data?.role ?? "")
  ) {
    throw new Error("Attendance workspace is unavailable for this clinic.");
  }
}

/**
 * Mark a doctor absent for a specific date (emergency leave or no show).
 * Idempotently updates or inserts attendance, updates availability to BUSY,
 * detects affected appointments, and records an audit log.
 */
export async function markDoctorAbsent(
  db: Client,
  userId: string,
  input: MarkDoctorAbsentInput
): Promise<{
  record: AttendanceRecord;
  affectedAppointments: AffectedAppointmentSummary[];
  isCorrection: boolean;
}> {
  await assertTeamOwner(db, userId, input.clinicId);

  // 1. Fetch doctor profile
  const { data: doctor, error: docError } = await db
    .from("doctor_profiles")
    .select("id, user_id, specialization, availability")
    .eq("clinic_id", input.clinicId)
    .eq("id", input.doctorProfileId)
    .maybeSingle();

  if (docError || !doctor) {
    throw new Error("Doctor profile not found in this clinic.");
  }

  // 2. Check for existing attendance record (prevent duplicates)
  const { data: existing, error: findError } = await db
    .from("clinic_attendance")
    .select("*")
    .eq("clinic_id", input.clinicId)
    .eq("user_id", doctor.user_id)
    .eq("date", input.date)
    .maybeSingle();

  if (findError) {
    throw new Error("Could not check existing attendance record.");
  }

  let record: AttendanceRecord;
  let isCorrection = false;

  if (existing) {
    isCorrection = true;
    const { data: updated, error: updateError } = await db
      .from("clinic_attendance")
      .update({
        status: "ABSENT",
        reason: input.reason || "Unplanned absence / emergency leave",
        recorded_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (updateError || !updated) {
      throw new Error("Could not update attendance record.");
    }
    record = updated;
  } else {
    const { data: inserted, error: insertError } = await db
      .from("clinic_attendance")
      .insert({
        clinic_id: input.clinicId,
        user_id: doctor.user_id,
        role: "DOCTOR",
        date: input.date,
        status: "ABSENT",
        reason: input.reason || "Unplanned absence / emergency leave",
        recorded_by: userId,
      })
      .select("*")
      .single();

    if (insertError || !inserted) {
      throw new Error("Could not record doctor absence.");
    }
    record = inserted;
  }

  // 3. Synchronize doctor availability daily override to BUSY
  const currentAvail = (doctor.availability && typeof doctor.availability === "object"
    ? (doctor.availability as Record<string, unknown>)
    : {}) as DoctorAvailabilityConfig;

  const nextOverrides = {
    ...(currentAvail.daily_overrides || {}),
    [input.date]: "BUSY" as const,
  };

  const nextAvail: DoctorAvailabilityConfig = {
    ...currentAvail,
    daily_overrides: nextOverrides,
  };

  await db
    .from("doctor_profiles")
    .update({ availability: nextAvail as any })
    .eq("clinic_id", input.clinicId)
    .eq("id", input.doctorProfileId);

  // 4. Retrieve affected appointments
  const affected = await getAffectedAppointments(db, input.clinicId, input.date, input.doctorProfileId);

  // 5. Audit log
  await db.from("audit_logs").insert({
    clinic_id: input.clinicId,
    user_id: userId,
    action: isCorrection ? "ATTENDANCE_CORRECTED" : "DOCTOR_MARKED_ABSENT",
    entity_type: "clinic_attendance",
    entity_id: record.id,
    metadata: {
      doctor_profile_id: input.doctorProfileId,
      target_user_id: doctor.user_id,
      date: input.date,
      status: "ABSENT",
      reason: input.reason,
      affected_appointments_count: affected.length,
      is_correction: isCorrection,
    },
  });

  return {
    record,
    affectedAppointments: affected.map((a) => {
      const p = a.patient
        ? `${a.patient.first_name} ${a.patient.last_name ?? ""}`.trim()
        : "Patient";
      return {
        id: a.id,
        scheduled_start: a.scheduled_start,
        patient_name: p,
      };
    }),
    isCorrection,
  };
}

/**
 * Record or correct attendance (Present or Absent) for a doctor or staff member.
 * Enforces uniqueness per (clinic_id, user_id, date) and updates audit trail.
 */
export async function recordAttendance(
  db: Client,
  userId: string,
  input: RecordAttendanceInput
): Promise<{ record: AttendanceRecord; isCorrection: boolean }> {
  await assertTeamOwner(db, userId, input.clinicId);

  // 1. Verify target user belongs to clinic
  const { data: member, error: memberError } = await db
    .from("clinic_members")
    .select("id, role, status")
    .eq("clinic_id", input.clinicId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (memberError || !member || member.role !== input.role) {
    throw new Error(`Member not found as active ${input.role.toLowerCase()} in this clinic.`);
  }

  // 2. Check for existing attendance record
  const { data: existing, error: findError } = await db
    .from("clinic_attendance")
    .select("*")
    .eq("clinic_id", input.clinicId)
    .eq("user_id", input.userId)
    .eq("date", input.date)
    .maybeSingle();

  if (findError) {
    throw new Error("Could not check existing attendance record.");
  }

  let record: AttendanceRecord;
  let isCorrection = false;

  if (existing) {
    isCorrection = true;
    const { data: updated, error: updateError } = await db
      .from("clinic_attendance")
      .update({
        status: input.status,
        reason: input.reason || null,
        recorded_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (updateError || !updated) {
      throw new Error("Could not update attendance record.");
    }
    record = updated;
  } else {
    const { data: inserted, error: insertError } = await db
      .from("clinic_attendance")
      .insert({
        clinic_id: input.clinicId,
        user_id: input.userId,
        role: input.role,
        date: input.date,
        status: input.status,
        reason: input.reason || null,
        recorded_by: userId,
      })
      .select("*")
      .single();

    if (insertError || !inserted) {
      throw new Error("Could not record attendance.");
    }
    record = inserted;
  }

  // 3. If doctor, synchronize availability
  if (input.role === "DOCTOR") {
    const { data: doctor } = await db
      .from("doctor_profiles")
      .select("id, availability")
      .eq("clinic_id", input.clinicId)
      .eq("user_id", input.userId)
      .maybeSingle();

    if (doctor) {
      const currentAvail = (doctor.availability && typeof doctor.availability === "object"
        ? (doctor.availability as Record<string, unknown>)
        : {}) as DoctorAvailabilityConfig;

      const overrides = { ...(currentAvail.daily_overrides || {}) };

      if (input.status === "ABSENT") {
        overrides[input.date] = "BUSY";
      } else if (input.status === "PRESENT") {
        // If doctor was previously set BUSY for this date, revert it
        if (overrides[input.date] === "BUSY") {
          delete overrides[input.date];
        }
      }

      await db
        .from("doctor_profiles")
        .update({ availability: { ...currentAvail, daily_overrides: overrides } as any })
        .eq("clinic_id", input.clinicId)
        .eq("id", doctor.id);
    }
  }

  // 4. Audit log
  await db.from("audit_logs").insert({
    clinic_id: input.clinicId,
    user_id: userId,
    action: isCorrection ? "ATTENDANCE_CORRECTED" : "ATTENDANCE_RECORDED",
    entity_type: "clinic_attendance",
    entity_id: record.id,
    metadata: {
      target_user_id: input.userId,
      role: input.role,
      date: input.date,
      status: input.status,
      previous_status: existing?.status ?? null,
      reason: input.reason ?? null,
      is_correction: isCorrection,
    },
  });

  return { record, isCorrection };
}

/**
 * Reads attendance information for a specific date honestly.
 * Doctors and staff without an attendance record are reported as UNRECORDED,
 * never fabricated or assumed absent.
 */
export async function readAttendanceForDate(
  db: Client,
  userId: string,
  clinicId: string,
  dateStr?: string
): Promise<AttendanceSummary> {
  await assertClinicTeamMember(db, userId, clinicId);

  const { timezone } = await getClinicMetadata(db, clinicId);
  const targetDate = dateStr || getClinicLocalDate(new Date(), timezone);

  // 1. Fetch active clinic doctors and staff
  const [docRes, staffRes, attendanceRes, nameMap] = await Promise.all([
    db
      .from("doctor_profiles")
      .select("id, user_id, specialization, status")
      .eq("clinic_id", clinicId)
      .in("status", ["ACTIVE", "ON_LEAVE"]),
    db
      .from("clinic_members")
      .select("id, user_id, role, status")
      .eq("clinic_id", clinicId)
      .eq("role", "STAFF")
      .eq("status", "ACTIVE"),
    db
      .from("clinic_attendance")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("date", targetDate),
    resolveClinicMemberNameMap(db, clinicId),
  ]);

  if (docRes.error) throw new Error("Could not load doctor profiles.");
  if (staffRes.error) throw new Error("Could not load staff members.");
  if (attendanceRes.error) throw new Error("Could not load attendance records.");

  const attendanceMap = new Map<string, AttendanceRecord>();
  for (const a of attendanceRes.data ?? []) {
    attendanceMap.set(a.user_id, a as AttendanceRecord);
  }

  // 2. Build doctor attendance list
  const doctorRows: AttendanceMemberItem[] = (docRes.data ?? []).map((doc) => {
    const att = attendanceMap.get(doc.user_id);
    const displayName = nameMap.get(doc.user_id) || "Doctor";
    return {
      id: doc.id,
      user_id: doc.user_id,
      role: "DOCTOR" as const,
      display_name: displayName,
      specialization: doc.specialization,
      date: targetDate,
      status: (att?.status as "PRESENT" | "ABSENT") || "UNRECORDED",
      reason: att?.reason ?? null,
      attendance_id: att?.id ?? null,
      recorded_by: att?.recorded_by ?? null,
      updated_at: att?.updated_at ?? null,
    };
  });

  // 3. Build staff attendance list
  const staffRows: AttendanceMemberItem[] = (staffRes.data ?? []).map((staff) => {
    const att = attendanceMap.get(staff.user_id);
    const displayName = nameMap.get(staff.user_id) || "Staff member";
    return {
      id: staff.id,
      user_id: staff.user_id,
      role: "STAFF" as const,
      display_name: displayName,
      date: targetDate,
      status: (att?.status as "PRESENT" | "ABSENT") || "UNRECORDED",
      reason: att?.reason ?? null,
      attendance_id: att?.id ?? null,
      recorded_by: att?.recorded_by ?? null,
      updated_at: att?.updated_at ?? null,
    };
  });

  // 4. Calculate honest counts
  const calcCounts = (rows: AttendanceMemberItem[]): AttendanceCounts => {
    const present = rows.filter((r) => r.status === "PRESENT").length;
    const absent = rows.filter((r) => r.status === "ABSENT").length;
    const unrecorded = rows.filter((r) => r.status === "UNRECORDED").length;
    return {
      total: rows.length,
      present,
      absent,
      unrecorded,
    };
  };

  return {
    date: targetDate,
    timezone,
    doctors: calcCounts(doctorRows),
    staff: calcCounts(staffRows),
    doctorRows,
    staffRows,
  };
}

/**
 * Calculates date range boundaries based on range preset or custom dates.
 */
function resolveDateRange(
  range: "today" | "7d" | "30d" | "custom",
  todayStr: string,
  startDate?: string,
  endDate?: string
): { start: string; end: string } {
  if (range === "custom" && startDate && endDate) {
    return { start: startDate, end: endDate };
  }

  const today = new Date(todayStr + "T00:00:00Z");

  if (range === "today") {
    return { start: todayStr, end: todayStr };
  }

  const daysBack = range === "7d" ? 6 : 29;
  const start = new Date(today.getTime() - daysBack * 86_400_000);
  const startStr = start.toISOString().slice(0, 10);

  return { start: startStr, end: todayStr };
}

/**
 * Generate all dates between start and end inclusive (YYYY-MM-DD).
 */
function enumerateDates(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  const current = new Date(startStr + "T00:00:00Z");
  const end = new Date(endStr + "T00:00:00Z");

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Reads attendance analytics across a date or date range.
 * Respects clinic boundaries and handles missing records honestly.
 */
export async function readAttendanceAnalytics(
  db: Client,
  userId: string,
  clinicId: string,
  range: "today" | "7d" | "30d" | "custom" = "today",
  startDate?: string,
  endDate?: string
): Promise<AttendanceAnalyticsResult> {
  await assertClinicTeamMember(db, userId, clinicId);

  const { timezone } = await getClinicMetadata(db, clinicId);
  const todayStr = getClinicLocalDate(new Date(), timezone);
  const { start, end } = resolveDateRange(range, todayStr, startDate, endDate);

  // 1. Fetch all attendance records in range for this clinic
  const [attendanceRes, docCountRes, staffCountRes, latestSummary] = await Promise.all([
    db
      .from("clinic_attendance")
      .select("date, role, status")
      .eq("clinic_id", clinicId)
      .gte("date", start)
      .lte("date", end),
    db
      .from("doctor_profiles")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .in("status", ["ACTIVE", "ON_LEAVE"]),
    db
      .from("clinic_members")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("role", "STAFF")
      .eq("status", "ACTIVE"),
    readAttendanceForDate(db, userId, clinicId, end),
  ]);

  if (attendanceRes.error) throw new Error("Could not load attendance data.");

  const allDates = enumerateDates(start, end);
  const records = attendanceRes.data ?? [];

  // Group attendance by date
  const dateMap = new Map<
    string,
    { docPres: number; docAbs: number; staffPres: number; staffAbs: number }
  >();

  for (const d of allDates) {
    dateMap.set(d, { docPres: 0, docAbs: 0, staffPres: 0, staffAbs: 0 });
  }

  let totalDocPresent = 0;
  let totalDocAbsent = 0;
  let totalStaffPresent = 0;
  let totalStaffAbsent = 0;

  for (const r of records) {
    const entry = dateMap.get(r.date);
    if (!entry) continue;

    if (r.role === "DOCTOR") {
      if (r.status === "PRESENT") {
        entry.docPres += 1;
        totalDocPresent += 1;
      } else if (r.status === "ABSENT") {
        entry.docAbs += 1;
        totalDocAbsent += 1;
      }
    } else if (r.role === "STAFF") {
      if (r.status === "PRESENT") {
        entry.staffPres += 1;
        totalStaffPresent += 1;
      } else if (r.status === "ABSENT") {
        entry.staffAbs += 1;
        totalStaffAbsent += 1;
      }
    }
  }

  const dailyTrends: AttendanceDayTrend[] = allDates.map((date) => {
    const d = dateMap.get(date)!;
    return {
      date,
      doctorsPresent: d.docPres,
      doctorsAbsent: d.docAbs,
      staffPresent: d.staffPres,
      staffAbsent: d.staffAbs,
    };
  });

  return {
    range,
    startDate: start,
    endDate: end,
    totalDays: allDates.length,
    doctors: {
      totalMembers: docCountRes.count ?? 0,
      totalPresentCount: totalDocPresent,
      totalAbsentCount: totalDocAbsent,
    },
    staff: {
      totalMembers: staffCountRes.count ?? 0,
      totalPresentCount: totalStaffPresent,
      totalAbsentCount: totalStaffAbsent,
    },
    dailyTrends,
    latestSummary,
  };
}
