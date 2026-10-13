import { describe, expect, it } from "vitest";
import { monthlyPlanPrice, planChoiceLabel, planComparisonPrice } from "@/lib/plan-selection";
const plans = [
  { id: "basic", price: 999, multi_price: null, clinic_mode: "SINGLE" },
  { id: "ai", price: 2199, multi_price: null, clinic_mode: "SINGLE" },
  { id: "max", price: 8500, multi_price: 10000, clinic_mode: "SINGLE_OR_MULTI" },
];
describe("plan selection presentation", () => {
  it("compares prices, not positions, including equal and no-plan cases", () => {
    expect(planChoiceLabel(999, 2199)).toBe("Choose");
    expect(planChoiceLabel(2199, 2199)).toBe("Choose");
    expect(planChoiceLabel(8500, 2199)).toBe("Upgrade");
    expect(planChoiceLabel(8500, null)).toBe("Choose");
  });
  it("uses scope pricing and returns to configured current price on dismissal", () => {
    const max = plans[2];
    if (!max) throw new Error("Missing test plan");
    const current = { planId: "ai", scope: "SINGLE", status: "ACTIVE" };
    expect(monthlyPlanPrice(max, "MULTI")).toBe(10000);
    expect(planComparisonPrice(plans, max, "MULTI", current)).toBe(10000);
    expect(planComparisonPrice(plans, null, "MULTI", current)).toBe(2199);
    expect(planComparisonPrice(plans, null, "SINGLE", { planId: "max", scope: "MULTI", status: "ACTIVE" })).toBe(10000);
    expect(planComparisonPrice(plans, null, "SINGLE", { ...current, status: "PENDING_PAYMENT" })).toBeNull();
  });
});