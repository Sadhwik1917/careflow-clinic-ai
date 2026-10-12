// Pure validation for subscription creation; shared by the server functions and tests.
export type Scope = "SINGLE" | "MULTI";
export type PlanRule = { is_active: boolean; clinic_mode: "SINGLE" | "MULTI" | "SINGLE_OR_MULTI"; razorpay_plan_id: string | null };
export type CreateSubscriptionInput = { clinicId: string; planId: string; scope: Scope | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Only ids and scope are accepted; client-supplied prices, durations or provider plan ids are ignored. */
export function parseCreateSubscriptionInput(body: unknown): CreateSubscriptionInput {
  if (!body || typeof body !== "object") throw new Error("Invalid request");
  const b = body as Record<string, unknown>;
  if (!isUuid(b["clinicId"])) throw new Error("Invalid clinic");
  if (!isUuid(b["planId"])) throw new Error("Invalid plan");
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

export type PricedPlan = { clinic_mode: PlanRule["clinic_mode"]; price: number; multi_price: number | null; razorpay_plan_id: string | null; razorpay_multi_plan_id: string | null };

/** Price and Razorpay plan for a scope, from database values only. Max AI multi-clinic has its own price and plan. */
export function pricingFor(plan: PricedPlan, scope: Scope): { amount: number; razorpayPlanId: string } | { error: string } {
  const multi = plan.clinic_mode === "SINGLE_OR_MULTI" && scope === "MULTI" && plan.multi_price != null;
  const amount = Number(multi ? plan.multi_price : plan.price);
  const id = multi ? plan.razorpay_multi_plan_id : plan.razorpay_plan_id;
  return id ? { amount, razorpayPlanId: id } : { error: "This plan isn't available." };
}

export const OPEN_SUBSCRIPTION_STATUSES = ["PENDING_PAYMENT", "ACTIVE", "TRIAL_ACTIVE", "PAST_DUE"] as const;
export const CURRENT_STATUSES = ["ACTIVE", "TRIAL_ACTIVE", "PAST_DUE"] as const;

export type OpenSub = { id: string; plan_id: string; clinic_scope: string | null; status: string; provider_subscription_id: string | null; mandate_status?: string | null };
export type Enrollment =
  | { kind: "reuse"; row: OpenSub; supersede: OpenSub[] }
  | { kind: "attach_trial"; row: OpenSub; supersede: OpenSub[] }
  | { kind: "create"; supersede: OpenSub[] }
  | { kind: "error"; error: string };

/**
 * Decides how a paid enrollment request fits the clinic's open subscriptions:
 * - the current paid plan can't be bought again;
 * - "Continue to Full Plan" on an active trial attaches checkout to that same trial row;
 * - a matching unpaid checkout is reused; other unpaid checkouts are superseded (cancelled).
 * The current plan stays in place until the new payment is verified by the webhook.
 */
export function decideEnrollment(open: OpenSub[], planId: string, scope: Scope): Enrollment {
  const same = (s: OpenSub) => s.plan_id === planId && s.clinic_scope === scope;
  const current = open.filter(s => (CURRENT_STATUSES as readonly string[]).includes(s.status));
  if (current.length > 1) return { kind: "error", error: "This clinic has conflicting subscriptions. Please contact CAREFLOW support." };
  const cur = current[0];
  const pending = open.filter(s => s.status === "PENDING_PAYMENT");
  if (cur && same(cur)) {
    if (cur.status !== "TRIAL_ACTIVE") return { kind: "error", error: "This is already your current plan." };
    if (cur.mandate_status === "AUTHORIZED") return { kind: "error", error: "Your trial already converts to this plan automatically when it ends." };
    return cur.provider_subscription_id ? { kind: "reuse", row: cur, supersede: pending } : { kind: "attach_trial", row: cur, supersede: pending };
  }
  const match = pending.find(s => same(s) && s.provider_subscription_id);
  if (match) return { kind: "reuse", row: match, supersede: pending.filter(s => s !== match) };
  return { kind: "create", supersede: pending };
}

export const TRIAL_DAYS = 21;
export function trialDaysLeft(trialEnd: string, now = new Date()): number {
  return Math.max(0, Math.ceil((new Date(trialEnd).getTime() - now.getTime()) / 86_400_000));
}

const TRIAL_ERRORS: Record<string, string> = {
  TRIAL_NOT_OWNER: "Only the clinic owner can start a free trial.",
  TRIAL_NOT_APPROVED: "Your clinic must be approved first.",
  TRIAL_PLAN_UNAVAILABLE: "This plan doesn't offer a free trial.",
  TRIAL_SCOPE_REQUIRED: "Choose single-clinic or multi-clinic scope.",
  TRIAL_SCOPE_MISMATCH: "Clinic scope doesn't match this plan.",
  TRIAL_CLINIC_HAS_SUBSCRIPTION: "This clinic already has a plan or trial.",
  TRIAL_ALREADY_USED: "A free trial has already been used for this clinic or account.",
  TRIAL_BAD_TIMING: "The trial timing couldn't be set. Please try again.",
  TRIAL_NOT_FOUND: "Trial not found.",
  TRIAL_NOT_ACTIVE: "This trial is no longer active.",
};
export function trialErrorMessage(dbMessage: string | undefined, step: "update" | "enroll" = "update"): string {
  const code = Object.keys(TRIAL_ERRORS).find(k => dbMessage?.includes(k));
  if (code) return TRIAL_ERRORS[code]!;
  return step === "enroll" ? "We couldn't save your trial enrollment. Nothing was charged; please try again." : "We couldn't update your trial. Please try again.";
}

/** Razorpay start_at (first charge) is exactly 21 days after enrollment; the authorization link expires in 30 minutes. */
export function trialTiming(now: Date): { startAt: number; expireBy: number } {
  const t = Math.floor(now.getTime() / 1000);
  return { startAt: t + TRIAL_DAYS * 86_400, expireBy: t + 30 * 60 };
}
/** Cancellation is accepted until 1 hour before the scheduled first charge, so Razorpay can't have started charging. */
export const CANCEL_CUTOFF_MS = 60 * 60 * 1000;
export function beforeCancelCutoff(trialEnd: string | null, now: Date): boolean {
  return !trialEnd || new Date(trialEnd).getTime() - now.getTime() > CANCEL_CUTOFF_MS;
}

/** A trial counts as used only once it really started (event) or its mandate was authorized; abandoned enrollments don't count. */
export function isTrialUsed(o: { startedEvents: number; ownerRows: { mandate_status: string | null; status: string; subscription_type: string }[]; lookupFailed: boolean }): boolean {
  if (o.lookupFailed || o.startedEvents > 0) return true;
  return o.ownerRows.some(r => r.subscription_type === "TRIAL" && (r.mandate_status === "AUTHORIZED" || (r.mandate_status == null && r.status.startsWith("TRIAL_"))));
}
