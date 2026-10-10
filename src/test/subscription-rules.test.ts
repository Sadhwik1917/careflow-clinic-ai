import { describe, expect, it } from "vitest";
import { parseCreateSubscriptionInput, resolvePlanScope } from "@/lib/subscription-rules";

const id = "325c512c-8fa0-44a7-a715-50721f4f600a";
const plan = { is_active: true, razorpay_plan_id: "plan_a" };

describe("subscription input", () => {
  it("rejects bad ids and scope", () => {
    expect(() => parseCreateSubscriptionInput(null)).toThrow();
    expect(() => parseCreateSubscriptionInput({ clinicId: "x", planId: id })).toThrow("Invalid clinic");
    expect(() => parseCreateSubscriptionInput({ clinicId: id, planId: id, scope: "ALL" })).toThrow("Invalid clinic scope");
  });
  it("drops client-supplied price and provider plan id", () => {
    expect(parseCreateSubscriptionInput({ clinicId: id, planId: id, price: 1, razorpay_plan_id: "plan_x" })).toEqual({ clinicId: id, planId: id, scope: null });
  });
});

describe("plan scope", () => {
  it("enforces fixed scopes", () => {
    expect(resolvePlanScope({ ...plan, clinic_mode: "SINGLE" }, null)).toEqual({ scope: "SINGLE" });
    expect(resolvePlanScope({ ...plan, clinic_mode: "SINGLE" }, "MULTI")).toHaveProperty("error");
  });
  it("requires a choice for Max AI", () => {
    expect(resolvePlanScope({ ...plan, clinic_mode: "SINGLE_OR_MULTI" }, "MULTI")).toEqual({ scope: "MULTI" });
    expect(resolvePlanScope({ ...plan, clinic_mode: "SINGLE_OR_MULTI" }, null)).toHaveProperty("error");
  });
  it("rejects inactive or unmapped plans", () => {
    expect(resolvePlanScope({ ...plan, is_active: false, clinic_mode: "MULTI" }, null)).toHaveProperty("error");
    expect(resolvePlanScope({ is_active: true, razorpay_plan_id: null, clinic_mode: "MULTI" }, null)).toHaveProperty("error");
  });
});
