// Pure validation for subscription creation; shared by the server function and tests.
export type Scope = "SINGLE" | "MULTI";
export type PlanRule = { is_active: boolean; clinic_mode: "SINGLE" | "MULTI" | "SINGLE_OR_MULTI"; razorpay_plan_id: string | null };
export type CreateSubscriptionInput = { clinicId: string; planId: string; scope: Scope | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only ids and scope are accepted; client-supplied prices or provider plan ids are ignored. */
export function parseCreateSubscriptionInput(body: unknown): CreateSubscriptionInput {
  if (!body || typeof body !== "object") throw new Error("Invalid request");
  const b = body as Record<string, unknown>;
  if (typeof b["clinicId"] !== "string" || !UUID.test(b["clinicId"])) throw new Error("Invalid clinic");
  if (typeof b["planId"] !== "string" || !UUID.test(b["planId"])) throw new Error("Invalid plan");
  const s = b["scope"];
  if (s !== undefined && s !== null && s !== "SINGLE" && s !== "MULTI") throw new Error("Invalid clinic scope");
  return { clinicId: b["clinicId"], planId: b["planId"], scope: (s as Scope | null | undefined) ?? null };
}

/** Returns the effective scope or an error message. Flexible plans need an explicit choice. */
export function resolvePlanScope(plan: PlanRule, requested: Scope | null): { scope: Scope } | { error: string } {
  if (!plan.is_active || !plan.razorpay_plan_id) return { error: "This plan isn't available." };
  if (plan.clinic_mode === "SINGLE_OR_MULTI") return requested ? { scope: requested } : { error: "Choose single-clinic or multi-clinic scope." };
  if (requested && requested !== plan.clinic_mode) return { error: "Clinic scope doesn't match this plan." };
  return { scope: plan.clinic_mode };
}

export const OPEN_SUBSCRIPTION_STATUSES = ["PENDING_PAYMENT", "ACTIVE", "TRIAL_ACTIVE", "PAST_DUE"] as const;
