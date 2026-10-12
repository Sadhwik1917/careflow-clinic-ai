import { describe, expect, it } from "vitest";
import { decideEnrollment, parseCreateSubscriptionInput, pricingFor, trialDaysLeft, trialErrorMessage, type OpenSub } from "@/lib/subscription-rules";
import { canTransition } from "@/lib/razorpay-verify";

const maxAi = { clinic_mode: "SINGLE_OR_MULTI" as const, price: 8500, multi_price: 10000, razorpay_plan_id: "plan_single", razorpay_multi_plan_id: "plan_multi" };
const sub = (o: Partial<OpenSub>): OpenSub => ({ id: "s1", plan_id: "p1", clinic_scope: "SINGLE", status: "ACTIVE", provider_subscription_id: "sub_1", ...o });

describe("Max AI pricing", () => {
  it("uses ₹8,500 and the single plan for single-clinic", () => expect(pricingFor(maxAi, "SINGLE")).toEqual({ amount: 8500, razorpayPlanId: "plan_single" }));
  it("uses ₹10,000 and the multi plan for multi-clinic", () => expect(pricingFor(maxAi, "MULTI")).toEqual({ amount: 10000, razorpayPlanId: "plan_multi" }));
  it("leaves other plans' prices unchanged", () =>
    expect(pricingFor({ clinic_mode: "MULTI", price: 2499, multi_price: null, razorpay_plan_id: "plan_m", razorpay_multi_plan_id: null }, "MULTI")).toEqual({ amount: 2499, razorpayPlanId: "plan_m" }));
  it("refuses multi-clinic Max AI if its Razorpay plan is missing", () => expect(pricingFor({ ...maxAi, razorpay_multi_plan_id: null }, "MULTI")).toHaveProperty("error"));
});

describe("enrollment decisions", () => {
  it("blocks buying the current paid plan again", () => expect(decideEnrollment([sub({})], "p1", "SINGLE")).toEqual({ kind: "error", error: "This is already your current plan." }));
  it("allows upgrading from a paid plan without cancelling it first", () => expect(decideEnrollment([sub({})], "p2", "SINGLE")).toEqual({ kind: "create", supersede: [] }));
  it("converts an active trial on the same row (no duplicate subscription)", () => {
    const t = sub({ status: "TRIAL_ACTIVE", provider_subscription_id: null });
    expect(decideEnrollment([t], "p1", "SINGLE")).toEqual({ kind: "attach_trial", row: t, supersede: [] });
    const started = sub({ status: "TRIAL_ACTIVE" });
    expect(decideEnrollment([started], "p1", "SINGLE")).toMatchObject({ kind: "reuse", row: started });
  });
  it("reuses a matching unpaid checkout and supersedes others", () => {
    const a = sub({ id: "a", status: "PENDING_PAYMENT" }), b = sub({ id: "b", plan_id: "p2", status: "PENDING_PAYMENT" });
    expect(decideEnrollment([a, b], "p1", "SINGLE")).toEqual({ kind: "reuse", row: a, supersede: [b] });
  });
  it("treats a different Max AI scope as a different plan", () => expect(decideEnrollment([sub({})], "p1", "MULTI").kind).toBe("create"));
  it("rejects conflicting current plans", () => expect(decideEnrollment([sub({ id: "a" }), sub({ id: "b", status: "TRIAL_ACTIVE" })], "p3", "SINGLE").kind).toBe("error"));
});

describe("trial rules", () => {
  it("ignores browser-supplied duration, price or status", () =>
    expect(parseCreateSubscriptionInput({ clinicId: "325c512c-8fa0-44a7-a715-50721f4f600a", planId: "325c512c-8fa0-44a7-a715-50721f4f600a", trial_end_date: "2099-01-01", amount: 0, status: "ACTIVE" }))
      .toEqual({ clinicId: "325c512c-8fa0-44a7-a715-50721f4f600a", planId: "325c512c-8fa0-44a7-a715-50721f4f600a", scope: null }));
  it("counts remaining days and never goes negative", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    expect(trialDaysLeft("2026-10-22T00:00:00Z", now)).toBe(21);
    expect(trialDaysLeft("2026-09-01T00:00:00Z", now)).toBe(0);
  });
  it("maps database refusals to clear messages", () => {
    expect(trialErrorMessage("ERROR: TRIAL_ALREADY_USED")).toMatch(/already been used/);
    expect(trialErrorMessage("ERROR: TRIAL_CLINIC_HAS_SUBSCRIPTION")).toMatch(/already has a plan/);
    expect(trialErrorMessage(undefined)).toMatch(/try again/);
  });
});

describe("webhook ordering", () => {
  it("activates trials on verified payment, including a late payment after expiry", () => {
    expect(canTransition("TRIAL_ACTIVE", "ACTIVE")).toBe(true);
    expect(canTransition("TRIAL_EXPIRED", "ACTIVE")).toBe(true);
  });
  it("never revives cancelled trials or ended plans", () => {
    for (const from of ["TRIAL_CANCELLED", "CANCELLED", "EXPIRED"]) expect(canTransition(from, "ACTIVE")).toBe(false);
  });
  it("doesn't let a stray Razorpay cancel/halt end a running trial", () => {
    expect(canTransition("TRIAL_ACTIVE", "CANCELLED")).toBe(false);
    expect(canTransition("TRIAL_ACTIVE", "PAST_DUE")).toBe(false);
  });
});
