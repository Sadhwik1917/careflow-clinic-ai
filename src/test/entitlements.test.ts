import { describe, expect, it } from "vitest";
import { actionProblem, availableActions, parseAllowance, planAllowsAi, planAllowsMultiClinic } from "@/lib/entitlements";

describe("super rejection rules", () => {
  it("only approved clinics get actions", () => { expect(availableActions("PENDING_REVIEW", "ACTIVE")).toEqual([]); expect(availableActions(null, "ACTIVE")).toEqual([]); });
  it("active approved: suspend or revoke", () => expect(availableActions("APPROVED", "ACTIVE")).toEqual(["SUSPEND", "REVOKE"]));
  it("suspended: reinstate or revoke", () => expect(availableActions("APPROVED", "SUSPENDED")).toEqual(["REINSTATE", "REVOKE"]));
  it("revoked clinics cannot be reinstated", () => expect(actionProblem("REINSTATE", "REJECTED", "ACTIVE", "x")).not.toBeNull());
  it("reason required", () => expect(actionProblem("SUSPEND", "APPROVED", "ACTIVE", "  ")).toBe("Enter a reason."));
  it("valid action passes", () => expect(actionProblem("REVOKE", "APPROVED", "ACTIVE", "fraud")).toBeNull());
});

describe("plan entitlements", () => {
  it("AI from ai_enabled", () => { expect(planAllowsAi({ ai_enabled: false })).toBe(false); expect(planAllowsAi({ ai_enabled: true })).toBe(true); expect(planAllowsAi(null)).toBe(false); });
  it("multi-clinic from clinic_mode and scope", () => {
    expect(planAllowsMultiClinic({ clinic_mode: "SINGLE" }, "SINGLE")).toBe(false);
    expect(planAllowsMultiClinic({ clinic_mode: "MULTI" }, "MULTI")).toBe(true);
    expect(planAllowsMultiClinic({ clinic_mode: "SINGLE_OR_MULTI" }, "SINGLE")).toBe(false);
    expect(planAllowsMultiClinic({ clinic_mode: "SINGLE_OR_MULTI" }, "MULTI")).toBe(true);
  });
  it("allowance parsing fails closed", () => { expect(parseAllowance(null).eligible).toBe(false); expect(parseAllowance({ eligible: true, used: 1, limit: 5 })).toEqual({ eligible: true, used: 1, limit: 5 }); });
});
