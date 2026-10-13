import { describe, expect, it } from "vitest";
import { registrationKey, trialDenial, trialErrorMessage, decideEnrollment } from "@/lib/subscription-rules";

const owner = "o1", clinic = "c1";
describe("trial eligibility", () => {
  it("normalises registration numbers so formatting can't bypass the rule", () => {
    expect(registrationKey(" tn-mc/2024 001 ")).toBe("TNMC2024001");
    expect(registrationKey("")).toBeNull();
  });
  it("same owner cannot activate a second trial (any clinic)", () =>
    expect(trialDenial({ registrationKey: "R2", consumed: [{ owner_user_id: owner, clinic_id: "other", registration_key: "R1" }], ownerId: owner, clinicId: clinic })).toBe("TRIAL_ALREADY_USED"));
  it("a new owner can't reuse a clinic's or registration number's trial", () => {
    expect(trialDenial({ registrationKey: "R1", consumed: [{ owner_user_id: "old", clinic_id: clinic, registration_key: null }], ownerId: "new", clinicId: clinic })).toBe("TRIAL_ALREADY_USED");
    expect(trialDenial({ registrationKey: "R1", consumed: [{ owner_user_id: "old", clinic_id: "oldclinic", registration_key: "R1" }], ownerId: "new", clinicId: "newclinic" })).toBe("TRIAL_ALREADY_USED");
  });
  it("cancelled/expired trials stay consumed (the record is permanent, status is irrelevant)", () =>
    expect(trialDenial({ registrationKey: "R1", consumed: [{ owner_user_id: owner, clinic_id: clinic, registration_key: "R1" }], ownerId: owner, clinicId: clinic })).toBe("TRIAL_ALREADY_USED"));
  it("pending or abandoned authorizations don't consume eligibility", () =>
    expect(trialDenial({ registrationKey: "R1", consumed: [], ownerId: owner, clinicId: clinic })).toBeNull());
  it("fails closed without a registration number, with a support path", () => {
    expect(trialDenial({ registrationKey: null, consumed: [], ownerId: owner, clinicId: clinic })).toBe("TRIAL_REGISTRATION_REQUIRED");
    expect(trialErrorMessage("ERROR: TRIAL_REGISTRATION_REQUIRED")).toMatch(/registration number.*support.*Full plans/);
  });
  it("paid enrollment stays available to owners who aren't trial-eligible", () =>
    expect(decideEnrollment([], "p1", "SINGLE").kind).toBe("create"));
});
