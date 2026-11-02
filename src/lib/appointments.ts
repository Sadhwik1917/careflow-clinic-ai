import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
export type QueueEntryRow = Database["public"]["Tables"]["queue_entries"]["Row"];
export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];
export type AppointmentType = Database["public"]["Enums"]["appointment_type"];
export type QueueStatus = Database["public"]["Enums"]["queue_status"];

export const DOCTOR_SLOT_CAPACITY = 6;
export const APPOINTMENTS_PAGE_SIZE = 20;

export interface AppointmentWithDetails extends AppointmentRow {
  patient: {
    id: string;
    patient_number: string;
    first_name: string;
    last_name: string | null;
    phone: string | null;
    gender: string | null;
  } | null;
  doctor: {
    id: string;
    specialization: string;
    department: string | null;
    user_id: string;
    display_name?: string | null;
  } | null;
}

export interface QueueEntryWithDetails extends QueueEntryRow {
  patient: {
    id: string;
    patient_number: string;
    first_name: string;
    last_name: string | null;
    phone: string | null;
    gender: string | null;
    date_of_birth?: string | null;
    email?: string | null;
    emergency_contact_name?: string | null;
    emergency_contact_phone?: string | null;
  } | null;
  doctor: {
    id: string;
    specialization: string;
    department: string | null;
    user_id: string;
    display_name?: string | null;
  } | null;
  appointment?: AppointmentRow | null;
}

export interface DoctorWorkingHours {
  day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  startTime: string; // "09:00"
  endTime: string;   // "18:00"
  slotDuration: number; // in minutes, default 60
}

export interface ClinicWorkingHoursConfig {
  opening_time: string; // "09:00"
  closing_time: string; // "18:00"
  break_enabled: boolean;
  break_start: string;  // "13:00"
  break_end: string;    // "14:00"
  closed_dates?: string[]; // ["2026-11-01"]
}

export interface DoctorLeaveItem {
  id: string;
  date: string; // "YYYY-MM-DD"
  reason?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  created_at: string;
}

export interface DoctorAvailabilityConfig {
  daily_overrides?: Record<string, "AVAILABLE" | "BUSY">;
  leaves?: DoctorLeaveItem[];
  schedule?: Record<string, { enabled?: boolean; start?: string; end?: string; duration?: number }>;
}

export interface TimeSlot {
  start: string; // ISO string in UTC
  end: string;   // ISO string in UTC
  slotStart?: string; // "09:00"
  slotEnd?: string;   // "10:00"
  timeLabel: string; // "09:00 AM - 10:00 AM"
  displayTime: string; // "09:00 AM"
  available: boolean;
  bookedCount?: number;
  reason?: "Booked" | "Past" | "Doctor on leave" | "Doctor busy" | "Clinic closed" | "Break time" | "Doctor inactive" | "Outside schedule" | undefined;
}

export const appointmentStatusLabel: Record<AppointmentStatus, string> = {
  SCHEDULED: "Scheduled",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked In",
  IN_QUEUE: "In Queue",
  IN_PROGRESS: "In Consultation",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
};

export const appointmentTypeLabel: Record<AppointmentType, string> = {
  CONSULTATION: "Consultation",
  FOLLOW_UP: "Follow-up",
  EMERGENCY: "Emergency",
  OTHER: "Other",
};

export const queueStatusLabel: Record<QueueStatus, string> = {
  WAITING: "Waiting",
  CALLED: "Called",
  IN_CONSULTATION: "In Consultation",
  COMPLETED: "Completed",
  SKIPPED: "Skipped",
  CANCELLED: "Cancelled",
};

export const ALLOWED_QUEUE_TRANSITIONS: Record<QueueStatus, QueueStatus[]> = {
  WAITING: ["CALLED", "CANCELLED"],
  CALLED: ["IN_CONSULTATION", "SKIPPED", "CANCELLED"],
  IN_CONSULTATION: ["COMPLETED", "SKIPPED", "CANCELLED"],
  SKIPPED: ["WAITING", "CALLED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function isValidQueueTransition(current: QueueStatus, next: QueueStatus): boolean {
  if (current === next) return true;
  return ALLOWED_QUEUE_TRANSITIONS[current]?.includes(next) ?? false;
}

export function formatQueueNumber(num: number): string {
  return String(num).padStart(3, "0");
}

// -------------------------------------------------------------
// Timezone and 12-Hour AM/PM Helpers
// -------------------------------------------------------------

/**
 * Returns the current date in "YYYY-MM-DD" format within the clinic's local timezone.
 * Avoids UTC boundary shifts.
 */
export function getClinicLocalDate(date: Date = new Date(), timeZone: string = "Asia/Kolkata"): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Formats an ISO string or Date into a 12-hour AM/PM string (e.g. "09:00 AM", "01:00 PM")
 * in the clinic's timezone.
 */
export function formatTime12h(isoOrDate: string | Date, timeZone: string = "Asia/Kolkata"): string {
  try {
    if (typeof isoOrDate === "string") {
      const timeMatch = isoOrDate.match(/^(\d{1,2}):(\d{2})$/);
      if (timeMatch) {
        let h = parseInt(timeMatch[1]!, 10);
        const m = parseInt(timeMatch[2]!, 10);
        const ampm = h >= 12 ? "PM" : "AM";
        h = h % 12;
        if (h === 0) h = 12;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
      }
    }
    const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
    if (isNaN(d.getTime())) return "--";
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return typeof isoOrDate === "string" ? isoOrDate : "--";
  }
}

/**
 * Formats a slot range into 12-hour AM/PM format (e.g. "09:00 AM - 10:00 AM").
 */
export function formatSlotLabel12h(
  startIso: string | Date,
  endIso: string | Date,
  timeZone: string = "Asia/Kolkata"
): string {
  const startStr = formatTime12h(startIso, timeZone);
  const endStr = formatTime12h(endIso, timeZone);
  return `${startStr} - ${endStr}`;
}

/**
 * Converts a clinic-local date ("YYYY-MM-DD") and 24-hr time ("HH:MM") into an exact UTC Date instant.
 */
export function clinicLocalToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string = "Asia/Kolkata"
): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, min] = timeStr.split(":").map(Number);
  if (!year || !month || !day || hour === undefined || min === undefined) {
    return new Date(`${dateStr}T${timeStr}:00.000Z`);
  }

  let utc = new Date(Date.UTC(year, month - 1, day, hour, min, 0, 0));
  try {
    const inv = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(utc);

    const parts = inv.match(/(\d{4})-(\d{2})-(\d{2})[,\s]+(\d{2}):(\d{2}):(\d{2})/);
    if (parts) {
      const tzYear = Number(parts[1]);
      const tzMonth = Number(parts[2]);
      const tzDay = Number(parts[3]);
      const tzHour = Number(parts[4]);
      const tzMin = Number(parts[5]);
      const tzSec = Number(parts[6]);
      const asTzUtc = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMin, tzSec);
      const diff = asTzUtc - utc.getTime();
      utc = new Date(utc.getTime() - diff);
    }
  } catch {
    // Fallback to naive UTC
  }
  return utc;
}

/**
 * Computes the UTC range [start, end] for a given clinic-local date ("YYYY-MM-DD") in the clinic's timezone.
 * Used for database queries to avoid UTC off-by-one errors.
 */
export function getClinicDayUtcRange(
  dateStr: string,
  timeZone: string = "Asia/Kolkata"
): { start: string; end: string } {
  const startUtc = clinicLocalToUtc(dateStr, "00:00", timeZone);
  // End of day is 23:59:59.999
  const nextDay = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000 - 1);
  return {
    start: startUtc.toISOString(),
    end: nextDay.toISOString(),
  };
}

export function getDayName(date: Date, timeZone: string = "Asia/Kolkata"): DoctorWorkingHours["day"] {
  const days: DoctorWorkingHours["day"][] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  try {
    const dayStr = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" })
      .format(date)
      .toLowerCase() as DoctorWorkingHours["day"];
    if (days.includes(dayStr)) return dayStr;
  } catch {
    // Fallback
  }
  return days[date.getUTCDay()] ?? "monday";
}

// -------------------------------------------------------------
// Validation Schemas
// -------------------------------------------------------------

export const appointmentFiltersSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).catch("").default(""),
  doctor_id: z.string().uuid().catch("").default(""),
  status: z.enum([
    "ALL",
    "SCHEDULED",
    "CONFIRMED",
    "CHECKED_IN",
    "IN_QUEUE",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
    "NO_SHOW",
  ]).catch("ALL").default("ALL"),
  search: z.string().trim().max(100).catch("").default(""),
  page: z.coerce.number().int().min(0).catch(0).default(0),
});

export type AppointmentFilters = z.infer<typeof appointmentFiltersSchema>;

export const createAppointmentSchema = z.object({
  clinic_id: z.string().uuid(),
  patient_id: z.string().uuid("Please select a valid patient."),
  doctor_profile_id: z.string().uuid("Please select a valid doctor."),
  appointment_type: z.enum(["CONSULTATION", "FOLLOW_UP", "EMERGENCY", "OTHER"]).default("CONSULTATION"),
  scheduled_start: z.string().datetime({ offset: true }),
  scheduled_end: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const patientBookingSchema = z.object({
  clinic_id: z.string().uuid(),
  patient_id: z.string().uuid().optional(),
  doctor_profile_id: z.string().uuid("Please select a valid doctor."),
  appointment_type: z.enum(["CONSULTATION", "FOLLOW_UP", "EMERGENCY", "OTHER"]).default("CONSULTATION"),
  scheduled_start: z.string().datetime({ offset: true }),
  scheduled_end: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type PatientBookingInput = z.infer<typeof patientBookingSchema>;

export interface PatientAppointmentCreateInput {
  patient_id?: string | undefined;
  doctor_profile_id: string;
  scheduled_start: string;
  scheduled_end: string;
  appointment_type?: AppointmentType | undefined;
  reason?: string | null | undefined;
  notes?: string | null | undefined;
}

export const rescheduleAppointmentSchema = z.object({
  clinic_id: z.string().uuid(),
  appointment_id: z.string().uuid(),
  scheduled_start: z.string().datetime({ offset: true }),
  scheduled_end: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(500).optional().nullable(),
});

export interface AppointmentRescheduleInfo {
  isRescheduled: boolean;
  originalSchedule: string | null;
  reason: string | null;
  history: Array<{ originalSchedule: string; reason: string | null }>;
}

/**
 * Extracts rescheduling audit history and previous slot details from appointment notes.
 * Format: [Rescheduled from <Date> (<Time>): <Reason>]
 */
export function getAppointmentRescheduleInfo(notes?: string | null): AppointmentRescheduleInfo {
  if (!notes) return { isRescheduled: false, originalSchedule: null, reason: null, history: [] };
  const regex = /\[Rescheduled from (.+?\))(?:[:\-]\s*([^\]]+))?\]/g;
  let matches = Array.from(notes.matchAll(regex));
  if (matches.length === 0) {
    const bracketRegex = /\[Rescheduled from (.+?)(?::\s+([^\]]+))?\]/g;
    matches = Array.from(notes.matchAll(bracketRegex));
  }
  if (matches.length === 0) {
    const fallbackMatch = notes.match(/Rescheduled from ([^\n\r]+)/);
    if (!fallbackMatch) return { isRescheduled: false, originalSchedule: null, reason: null, history: [] };
    const raw = fallbackMatch[1]?.trim() ?? null;
    return {
      isRescheduled: true,
      originalSchedule: raw,
      reason: null,
      history: [{ originalSchedule: raw ?? "", reason: null }],
    };
  }
  const history = matches.map((m) => ({
    originalSchedule: m[1]?.trim() ?? "",
    reason: m[2]?.trim() ?? null,
  }));
  const latest = history[history.length - 1]!;
  return {
    isRescheduled: true,
    originalSchedule: latest.originalSchedule,
    reason: latest.reason,
    history,
  };
}

export const cancelAppointmentSchema = z.object({
  clinic_id: z.string().uuid(),
  appointment_id: z.string().uuid(),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const checkInSchema = z.object({
  clinic_id: z.string().uuid(),
  appointment_id: z.string().uuid(),
});

export const queueTransitionSchema = z.object({
  clinic_id: z.string().uuid(),
  queue_entry_id: z.string().uuid(),
  new_status: z.enum(["WAITING", "CALLED", "IN_CONSULTATION", "COMPLETED", "SKIPPED", "CANCELLED"]),
  clinical_notes: z.string().max(5000).optional().nullable(),
  assessment: z.string().max(2000).optional().nullable(),
});

export const consultPatientSchema = z.object({
  clinic_id: z.string().uuid(),
  doctor_profile_id: z.string().uuid(),
  queue_entry_id: z.string().uuid(),
  clinical_notes: z.string().max(5000).optional().nullable(),
  assessment: z.string().max(2000).optional().nullable(),
});

export const clinicWorkingHoursSchema = z.object({
  clinic_id: z.string().uuid(),
  opening_time: z.string().regex(/^\d{2}:\d{2}$/, "Opening time must be HH:MM format"),
  closing_time: z.string().regex(/^\d{2}:\d{2}$/, "Closing time must be HH:MM format"),
  break_enabled: z.boolean().default(false),
  break_start: z.string().regex(/^\d{2}:\d{2}$/, "Break start must be HH:MM format").default("13:00"),
  break_end: z.string().regex(/^\d{2}:\d{2}$/, "Break end must be HH:MM format").default("14:00"),
});

export const clinicDateOpenStatusSchema = z.object({
  clinic_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  is_open: z.boolean(),
});

export const doctorDailyAvailabilitySchema = z.object({
  clinic_id: z.string().uuid(),
  doctor_profile_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  status: z.enum(["AVAILABLE", "BUSY"]),
});

export const doctorLeaveRequestSchema = z.object({
  clinic_id: z.string().uuid(),
  doctor_profile_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const doctorLeaveReviewSchema = z.object({
  clinic_id: z.string().uuid(),
  doctor_profile_id: z.string().uuid(),
  leave_id: z.string().uuid(),
  action: z.enum(["APPROVE", "REJECT"]),
});

// -------------------------------------------------------------
// Doctor Availability & 1-Hour Slot Capacity Calculations
// -------------------------------------------------------------

/**
 * Calculates doctor slots for a given clinic-local date based on:
 * - Clinic operating hours & break times
 * - Clinic open/closed status for date
 * - Doctor membership status (ACTIVE vs INACTIVE/ON_LEAVE)
 * - Doctor daily availability (AVAILABLE vs BUSY)
 * - Doctor approved leaves
 * - 1-hour slot duration
 * - Doctor-specific capacity (max 6 appointments per slot)
 * - Omits past slots for today strictly later than now()
 * - Omits full slots for user selectable view (Requirement A & C)
 */
export function calculateDoctorSlots(
  dateStr: string, // "YYYY-MM-DD"
  availabilityJson: unknown,
  doctorStatus: string,
  existingAppointments: Array<{ scheduled_start: string; scheduled_end: string; status: string }>,
  now: Date = new Date(),
  clinicHoursOrTz?: Partial<ClinicWorkingHoursConfig> | string | null,
  tzOrClinicHours?: string | Partial<ClinicWorkingHoursConfig> | null,
  options?: {
    selectableOnly?: boolean;
    omitPast?: boolean;
    omitFull?: boolean;
    slotDurationMinutes?: number;
  }
): TimeSlot[] {
  let clinicHours: Partial<ClinicWorkingHoursConfig> | null = null;
  let clinicTimeZone = "Asia/Kolkata";

  if (typeof clinicHoursOrTz === "string") {
    clinicTimeZone = clinicHoursOrTz;
    if (tzOrClinicHours && typeof tzOrClinicHours === "object") {
      clinicHours = tzOrClinicHours as Partial<ClinicWorkingHoursConfig>;
    }
  } else {
    clinicHours = clinicHoursOrTz ?? null;
    if (typeof tzOrClinicHours === "string") {
      clinicTimeZone = tzOrClinicHours;
    }
  }

  const selectableOnly = options?.selectableOnly ?? false;
  const omitPast = options?.omitPast ?? selectableOnly;
  const omitFull = options?.omitFull ?? selectableOnly;

  // 1. Doctor Clinic Membership Status Check
  if (doctorStatus === "INACTIVE" || doctorStatus === "ON_LEAVE") {
    return [];
  }

  // 2. Parse Doctor Availability configuration (overrides, leaves, schedule)
  const avail = (availabilityJson && typeof availabilityJson === "object"
    ? (availabilityJson as Record<string, unknown>)
    : {}) as DoctorAvailabilityConfig;

  // 3. Clinic Planned Closures
  const closedDates = clinicHours?.closed_dates ?? [];
  if (closedDates.includes(dateStr)) {
    return [];
  }

  // 4. Doctor Daily Availability (Doctor-side Available / Busy control)
  const dailyOverrides = avail.daily_overrides ?? {};
  if (dailyOverrides[dateStr] === "BUSY") {
    return [];
  }

  // 5. Doctor Approved Leave check for dateStr
  const leaves = avail.leaves ?? [];
  const hasApprovedLeave = leaves.some(
    (l) => l.date === dateStr && l.status === "APPROVED"
  );
  if (hasApprovedLeave) {
    return [];
  }

  // 6. Day of week schedule check
  const sampleUtc = clinicLocalToUtc(dateStr, "12:00", clinicTimeZone);
  const dayName = getDayName(sampleUtc, clinicTimeZone);

  // Check if doctor has custom day configuration
  const doctorSchedule = avail.schedule ?? {};
  const daySchedule = doctorSchedule[dayName];
  if (daySchedule && daySchedule.enabled === false) {
    return [];
  }

  // Sunday default behavior: closed unless explicitly configured in clinic or doctor
  if (dayName === "sunday" && !daySchedule?.enabled) {
    return [];
  }

  // 7. Operating window (Default 09:00 to 18:00 or clinic settings)
  let startTime = clinicHours?.opening_time || "09:00";
  let endTime = clinicHours?.closing_time || "18:00";
  let slotDuration = options?.slotDurationMinutes ?? 60; // 1-hour appointment slots

  // Doctor custom hours override if within clinic window
  if (daySchedule?.start) startTime = daySchedule.start;
  if (daySchedule?.end) endTime = daySchedule.end;
  if (daySchedule?.duration) slotDuration = daySchedule.duration;

  const [startHour, startMin] = startTime.split(":").map(Number);
  const [endHour, endMin] = endTime.split(":").map(Number);

  if (
    startHour === undefined ||
    startMin === undefined ||
    endHour === undefined ||
    endMin === undefined ||
    isNaN(startHour) ||
    isNaN(startMin) ||
    isNaN(endHour) ||
    isNaN(endMin) ||
    startHour * 60 + startMin >= endHour * 60 + endMin
  ) {
    return [];
  }

  // Break window
  const breakEnabled = clinicHours?.break_enabled ?? false;
  const breakStartUtc = breakEnabled && clinicHours?.break_start
    ? clinicLocalToUtc(dateStr, clinicHours.break_start, clinicTimeZone).getTime()
    : null;
  const breakEndUtc = breakEnabled && clinicHours?.break_end
    ? clinicLocalToUtc(dateStr, clinicHours.break_end, clinicTimeZone).getTime()
    : null;

  // Active appointments for this specific doctor (cancelled do not consume capacity)
  const activeAppts = existingAppointments.filter((a) => a.status !== "CANCELLED");

  const slots: TimeSlot[] = [];
  let currentMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  while (currentMinutes + slotDuration <= endMinutes) {
    const sH = Math.floor(currentMinutes / 60);
    const sM = currentMinutes % 60;
    const eH = Math.floor((currentMinutes + slotDuration) / 60);
    const eM = (currentMinutes + slotDuration) % 60;

    const sStr = `${String(sH).padStart(2, "0")}:${String(sM).padStart(2, "0")}`;
    const eStr = `${String(eH).padStart(2, "0")}:${String(eM).padStart(2, "0")}`;

    const slotStart = clinicLocalToUtc(dateStr, sStr, clinicTimeZone);
    const slotEnd = clinicLocalToUtc(dateStr, eStr, clinicTimeZone);

    const slotStartTime = slotStart.getTime();
    const slotEndTime = slotEnd.getTime();

    // 12-Hour AM/PM formatting for UI
    const timeLabel = formatSlotLabel12h(slotStart, slotEnd, clinicTimeZone);
    const displayTime = formatTime12h(slotStart, clinicTimeZone);

    // Overlap with break time (Phase 5: Do not generate slots that overlap the configured break)
    const overlapsBreak =
      breakStartUtc !== null &&
      breakEndUtc !== null &&
      slotStartTime < breakEndUtc &&
      slotEndTime > breakStartUtc;

    if (overlapsBreak) {
      currentMinutes += slotDuration;
      continue;
    }

    // Doctor capacity: Count active appointments for this doctor in this slot
    const bookedCount = activeAppts.filter((appt) => {
      const aStart = new Date(appt.scheduled_start).getTime();
      const aEnd = new Date(appt.scheduled_end).getTime();
      return slotStartTime < aEnd && slotEndTime > aStart;
    }).length;

    const isFull = bookedCount >= DOCTOR_SLOT_CAPACITY;
    // Past slot check: strictly later than now() per Requirement C
    const isPast = slotStartTime <= now.getTime();

    let available = true;
    let reason: TimeSlot["reason"] = undefined;

    if (isFull) {
      available = false;
      reason = "Booked";
    } else if (isPast) {
      available = false;
      reason = "Past";
    }

    // Additional Requirement A: Omit full slots from selectable UI
    // Additional Requirement C: Omit past slots from selectable UI
    if (omitPast && isPast) {
      currentMinutes += slotDuration;
      continue;
    }
    if (omitFull && isFull) {
      currentMinutes += slotDuration;
      continue;
    }
    if (selectableOnly && !available) {
      currentMinutes += slotDuration;
      continue;
    }

    const slotItem: TimeSlot = {
      start: slotStart.toISOString(),
      end: slotEnd.toISOString(),
      slotStart: sStr,
      slotEnd: eStr,
      timeLabel,
      displayTime,
      available,
      bookedCount,
    };
    if (reason !== undefined) {
      slotItem.reason = reason;
    }

    slots.push(slotItem);
    currentMinutes += slotDuration;
  }

  return slots;
}

/**
 * Returns available slots or suggests alternative slots when a chosen slot is unavailable.
 */
export function findAlternativeSlots(allSlots: TimeSlot[], targetSlotStart?: string): TimeSlot[] {
  const available = allSlots.filter((s) => s.available);
  if (!targetSlotStart) return available.slice(0, 5);

  const targetTime = new Date(targetSlotStart).getTime();
  return available
    .slice()
    .sort(
      (a, b) =>
        Math.abs(new Date(a.start).getTime() - targetTime) -
        Math.abs(new Date(b.start).getTime() - targetTime)
    )
    .slice(0, 5);
}
