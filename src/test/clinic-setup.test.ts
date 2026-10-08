import { describe, expect, it } from "vitest";
import { canStartFirstClinic, clinicSetupErrorMessage, validateClinicSetup } from "@/lib/clinic-setup";
import { availableWorkspaces, type UserAccess } from "@/lib/access";

const base = { displayName: "Sunrise", name: "Sunrise Family Clinic", phone: "", email: "", address: "", city: "", state: "" };
const acc = (status: "ACTIVE" | "INVITED" | null, role: "OWNER" | "DOCTOR" = "OWNER"): UserAccess => ({ userId: "u", email: null, profile: { id: "u", display_name: null, platform_role: "USER", status: "ACTIVE" }, memberships: status ? [{ id: "m", clinic_id: "c", role, status, clinic: { id: "c", name: "Legal", display_name: "Sunrise", status: "ACTIVE" } }] : [] });

describe("clinic setup validation", () => {
  it("accepts a valid form", () => expect(validateClinicSetup(base)).toEqual({}));
  it("requires display name", () => expect(validateClinicSetup({ ...base, displayName: "   " }).displayName).toBeDefined());
  it("limits display name to 60", () => expect(validateClinicSetup({ ...base, displayName: "x".repeat(61) }).displayName).toBeDefined());
  it("requires clinic name", () => expect(validateClinicSetup({ ...base, name: "" }).name).toBeDefined());
  it("rejects bad email and phone", () => { const e = validateClinicSetup({ ...base, email: "nope", phone: "abc" }); expect(e.email).toBeDefined(); expect(e.phone).toBeDefined(); });
});

describe("clinic setup eligibility hint", () => {
  it("allows users with no membership", () => expect(canStartFirstClinic(acc(null))).toBe(true));
  it("allows users with only an invited membership", () => expect(canStartFirstClinic(acc("INVITED"))).toBe(true));
  it("blocks active owners", () => expect(canStartFirstClinic(acc("ACTIVE"))).toBe(false));
  it("blocks active doctors", () => expect(canStartFirstClinic(acc("ACTIVE", "DOCTOR"))).toBe(false));
  it("maps database refusals to friendly text", () => expect(clinicSetupErrorMessage("Not eligible: account already owns a clinic")).toMatch(/already has clinic access/));
  it("labels workspaces with the display name", () => expect(availableWorkspaces(acc("ACTIVE"))[0]?.label).toBe("Sunrise"));
});
