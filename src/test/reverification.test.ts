import { describe, expect, it } from "vitest";
import { deadlineFrom, isDue, reminderDue, shouldSuspend, type Reverification } from "@/lib/reverification";

const now = new Date("2026-10-15T00:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const ahead = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
const active = { clinicStatus: "ACTIVE", verification: "APPROVED", decidedAt: ago(200) };
const rev = (o: Partial<Reverification> = {}): Reverification => ({ id: "r", requested_at: ago(1), deadline_at: ahead(6), reminder_sent_at: null, responded_at: null, status: "OPEN", ...o });

describe("six-month eligibility", () => {
  it("due after six months", () => expect(isDue(active, [], now)).toBe(true));
  it("not due before six months", () => expect(isDue({ ...active, decidedAt: ago(150) }, [], now)).toBe(false));
  it("no duplicate while one is open", () => expect(isDue(active, [rev()], now)).toBe(false));
  it("no repeat within six months of a previous request", () => expect(isDue(active, [rev({ status: "SUSPENDED", requested_at: ago(30) })], now)).toBe(false));
  it("excludes suspended clinics", () => expect(isDue({ ...active, clinicStatus: "SUSPENDED" }, [], now)).toBe(false));
  it("excludes revoked clinics", () => expect(isDue({ ...active, verification: "REJECTED" }, [], now)).toBe(false));
});

describe("deadline and reminder", () => {
  it("seven-day deadline", () => expect(deadlineFrom(now).getTime() - now.getTime()).toBe(7 * 86_400_000));
  it("reminder three days before", () => { expect(reminderDue(rev({ deadline_at: ahead(2.5) }), now)).toBe(true); expect(reminderDue(rev({ deadline_at: ahead(5) }), now)).toBe(false); });
  it("reminder only once", () => expect(reminderDue(rev({ deadline_at: ahead(2), reminder_sent_at: ago(0.1) }), now)).toBe(false));
});

describe("enforcement", () => {
  it("suspends after the deadline", () => expect(shouldSuspend(rev({ deadline_at: ago(0.01) }), active, now)).toBe(true));
  it("no suspension after a valid response", () => expect(shouldSuspend(rev({ deadline_at: ago(1), status: "RESPONDED" }), active, now)).toBe(false));
  it("repeat runs do not suspend again", () => expect(shouldSuspend(rev({ deadline_at: ago(1), status: "SUSPENDED" }), { ...active, clinicStatus: "SUSPENDED" }, now)).toBe(false));
  it("not before the deadline", () => expect(shouldSuspend(rev(), active, now)).toBe(false));
});
