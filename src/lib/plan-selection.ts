type PricedPlan = { id: string; price: number; multi_price: number | null; clinic_mode: string };
export function monthlyPlanPrice(plan: PricedPlan, scope: string | null = "SINGLE") {
  return plan.clinic_mode === "SINGLE_OR_MULTI" && scope === "MULTI" && plan.multi_price != null ? plan.multi_price : plan.price;
}
export function planComparisonPrice(plans: PricedPlan[], selected: PricedPlan | null, scope: string, current: { planId: string; scope: string | null; status: string } | null | undefined) {
  if (selected) return monthlyPlanPrice(selected, scope);
  if (!current || !["ACTIVE", "TRIAL_ACTIVE", "PAST_DUE"].includes(current.status)) return null;
  const plan = plans.find(p => p.id === current.planId);
  return plan ? monthlyPlanPrice(plan, current.scope) : null;
}
export function planChoiceLabel(price: number, comparison: number | null) {
  return comparison != null && price > comparison ? "Upgrade" : "Choose";
}