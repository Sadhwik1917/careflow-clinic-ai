// Mirrors private.run_reverification_maintenance for display and tests only.
// The hourly database job is the sole enforcer; nothing here changes clinic state.
export const REVERIFY_MONTHS = 6;
export const RESPONSE_DAYS = 7;
export const REMINDER_DAYS = 3;
const DAY = 86_400_000;

export type ReverificationStatus = "OPEN" | "RESPONDED" | "COMPLETED" | "CLOSED" | "SUSPENDED";
export type Reverification = { id: string; requested_at: string; deadline_at: string; reminder_sent_at: string | null; responded_at: string | null; status: ReverificationStatus };
export type ClinicState = { clinicStatus: string; verification: string | null; decidedAt: string | null };

const sixMonthsBefore = (now: Date) => { const d = new Date(now); d.setMonth(d.getMonth() - REVERIFY_MONTHS); return d; };

export function isDue(c: ClinicState, history: Reverification[], now = new Date()): boolean {
  if (c.verification !== "APPROVED" || c.clinicStatus !== "ACTIVE" || !c.decidedAt) return false;
  const cutoff = sixMonthsBefore(now);
  if (new Date(c.decidedAt) > cutoff) return false;
  return !history.some(r => r.status === "OPEN" || r.status === "RESPONDED" || new Date(r.requested_at) > cutoff);
}

export const deadlineFrom = (requestedAt: Date) => new Date(requestedAt.getTime() + RESPONSE_DAYS * DAY);

export function reminderDue(r: Reverification, now = new Date()): boolean {
  const d = new Date(r.deadline_at).getTime();
  return r.status === "OPEN" && !r.reminder_sent_at && d > now.getTime() && d - now.getTime() <= REMINDER_DAYS * DAY;
}

export function shouldSuspend(r: Reverification, c: ClinicState, now = new Date()): boolean {
  return r.status === "OPEN" && new Date(r.deadline_at) <= now && c.clinicStatus === "ACTIVE" && c.verification === "APPROVED";
}

export const openReverification = (rows: Reverification[]) => rows.find(r => r.status === "OPEN" || r.status === "RESPONDED") ?? null;
