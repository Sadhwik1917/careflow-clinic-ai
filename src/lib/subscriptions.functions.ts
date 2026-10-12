import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { decideEnrollment, isUuid, OPEN_SUBSCRIPTION_STATUSES, parseCreateSubscriptionInput, pricingFor, resolvePlanScope, trialErrorMessage, trialTiming, beforeCancelCutoff, isTrialUsed, type OpenSub } from "@/lib/subscription-rules";
import { parseCheckoutResult, verifyCheckoutSignature } from "@/lib/razorpay-verify";
import { cancelAtRazorpay, openSubsForClinic, razorpayAuth, supersede } from "@/lib/subscriptions.server";

export type CreateSubscriptionResult =
  | { ok: true; subscriptionId: string; razorpaySubscriptionId: string; keyId: string; reused: boolean }
  | { ok: false; error: string };

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>; userId: string };

async function assertOwner(ctx: Ctx, clinicId: string, needApproved: boolean): Promise<string | null> {
  const member = await ctx.supabase.from("clinic_members").select("id")
    .eq("clinic_id", clinicId).eq("user_id", ctx.userId).eq("role", "OWNER").eq("status", "ACTIVE").maybeSingle();
  if (member.error || !member.data) return "Only the clinic owner can manage plans.";
  if (needApproved) {
    const ver = await ctx.supabase.from("clinic_verifications").select("status").eq("clinic_id", clinicId).maybeSingle();
    if (ver.error || ver.data?.status !== "APPROVED") return "Your clinic must be approved first.";
  }
  return null;
}

// Creates (or resumes) a Razorpay checkout for an approved clinic's owner. New rows are PENDING_PAYMENT and a trial
// being converted stays TRIAL_ACTIVE; only the signed webhook can make a subscription ACTIVE.
export const createClinicSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseCreateSubscriptionInput)
  .handler(async ({ data, context }): Promise<CreateSubscriptionResult> => {
    const keyId = process.env["RAZORPAY_KEY_ID"];
    const auth = razorpayAuth();
    if (!keyId || !auth) { console.error("[subscriptions] Razorpay credentials missing"); return { ok: false, error: "Payments aren't configured yet." }; }
    const { userId } = context;
    const denied = await assertOwner(context, data.clinicId, true);
    if (denied) return { ok: false, error: denied };

    // Plan, price and Razorpay plan id come only from the database.
    const plan = await context.supabase.from("plans")
      .select("id, price, multi_price, currency, billing_cycle, clinic_mode, is_active, razorpay_plan_id, razorpay_multi_plan_id").eq("id", data.planId).maybeSingle();
    if (plan.error || !plan.data) return { ok: false, error: "This plan isn't available." };
    const resolved = resolvePlanScope(plan.data, data.scope);
    if ("error" in resolved) return { ok: false, error: resolved.error };
    const pricing = pricingFor(plan.data, resolved.scope);
    if ("error" in pricing) return { ok: false, error: pricing.error };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let open: OpenSub[];
    try {
      open = (await openSubsForClinic(supabaseAdmin, data.clinicId)).filter(s => (OPEN_SUBSCRIPTION_STATUSES as readonly string[]).includes(s.status));
    } catch (e) { console.error("[subscriptions] lookup failed", e instanceof Error ? e.message : e); return { ok: false, error: "Please try again." }; }
    const decision = decideEnrollment(open, plan.data.id, resolved.scope);
    if (decision.kind === "error") return { ok: false, error: decision.error };
    await supersede(supabaseAdmin, decision.supersede);
    if (decision.kind === "reuse")
      return { ok: true, subscriptionId: decision.row.id, razorpaySubscriptionId: decision.row.provider_subscription_id!, keyId, reused: true };

    const rz = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({
        plan_id: pricing.razorpayPlanId, total_count: 120, quantity: 1, customer_notify: 1,
        notes: { clinic_id: data.clinicId, careflow_plan_id: plan.data.id, clinic_scope: resolved.scope },
      }),
    });
    const rzBody = (await rz.json().catch(() => ({}))) as { id?: unknown; error?: { code?: string; description?: string } };
    if (!rz.ok || typeof rzBody.id !== "string") {
      console.error("[subscriptions] Razorpay create failed", rz.status, rzBody.error?.code, rzBody.error?.description);
      return { ok: false, error: "We couldn't start the subscription. Please try again." };
    }
    const rzId = rzBody.id;

    if (decision.kind === "attach_trial") {
      // Converting a trial: the same row keeps the trial running until Razorpay confirms payment.
      const up = await supabaseAdmin.from("clinic_subscriptions").update({ provider_subscription_id: rzId, payment_provider: "razorpay", amount: pricing.amount })
        .eq("id", decision.row.id).eq("status", "TRIAL_ACTIVE").is("provider_subscription_id", null).select("id");
      if (up.error || !up.data?.length) { await cancelAtRazorpay(rzId); return { ok: false, error: "Your trial changed while starting checkout. Please refresh and try again." }; }
      return { ok: true, subscriptionId: decision.row.id, razorpaySubscriptionId: rzId, keyId, reused: false };
    }

    const ins = await supabaseAdmin.from("clinic_subscriptions").insert({
      owner_user_id: userId, plan_id: plan.data.id, status: "PENDING_PAYMENT", subscription_type: "PAID", auto_renew: true,
      payment_provider: "razorpay", provider_subscription_id: rzId, clinic_scope: resolved.scope,
      billing_cycle: plan.data.billing_cycle, amount: pricing.amount, currency: plan.data.currency,
    }).select("id").single();
    const link = ins.data ? await supabaseAdmin.from("subscription_clinics").insert({ subscription_id: ins.data.id, clinic_id: data.clinicId }) : null;
    if (ins.error || !ins.data || link?.error) {
      console.error("[subscriptions] store failed", ins.error?.message ?? link?.error?.message);
      if (ins.data) await supabaseAdmin.from("clinic_subscriptions").delete().eq("id", ins.data.id);
      await cancelAtRazorpay(rzId);
      return { ok: false, error: "We couldn't save the subscription. Please try again." };
    }
    return { ok: true, subscriptionId: ins.data.id, razorpaySubscriptionId: rzId, keyId, reused: false };
  });

export type VerifyPaymentResult = { ok: true; status: string } | { ok: false; error: string };

// Checks the checkout signature for the caller's own subscription. It never changes status:
// only the signed Razorpay webhook can make a subscription ACTIVE.
export const verifySubscriptionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseCheckoutResult)
  .handler(async ({ data, context }): Promise<VerifyPaymentResult> => {
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];
    if (!keySecret) return { ok: false, error: "Payments aren't configured yet." };
    if (!(await verifyCheckoutSignature(keySecret, data.paymentId, data.subscriptionId, data.signature))) {
      console.error("[subscriptions] invalid checkout signature");
      return { ok: false, error: "We couldn't verify this payment. If you were charged, it will be confirmed by Razorpay shortly." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await supabaseAdmin.from("clinic_subscriptions").select("status")
      .eq("provider_subscription_id", data.subscriptionId).eq("owner_user_id", context.userId).maybeSingle();
    if (row.error || !row.data) return { ok: false, error: "Subscription not found." };
    return { ok: true, status: row.data.status };
  });

const parseClinic = (b: unknown) => { const c = (b as { clinicId?: unknown } | null)?.clinicId; if (!isUuid(c)) throw new Error("Invalid clinic"); return { clinicId: c }; };

export type PlanState = {
  current: { id: string; planId: string; scope: string | null; status: string; type: string; trialEnd: string | null; checkoutStarted: boolean; mandate: string | null; amount: number } | null;
  trialUsed: boolean;
};

// Read-only view of the clinic's current plan for the owner (subscription tables are server-read-only).
export const getClinicPlanState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseClinic)
  .handler(async ({ data, context }): Promise<PlanState> => {
    if (await assertOwner(context, data.clinicId, false)) return { current: null, trialUsed: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const subs = await openSubsForClinic(supabaseAdmin, data.clinicId);
    const now = Date.now();
    const cur = subs.find(s => s.status === "ACTIVE" || s.status === "PAST_DUE" || (s.status === "TRIAL_ACTIVE" && s.trial_end_date && new Date(s.trial_end_date).getTime() > now));
    // Mirrors start_clinic_trial: one trial per clinic and per owner, ever (trial rows keep trial_start_date).
    const [byClinic, byOwner] = await Promise.all([
      supabaseAdmin.from("trial_events").select("id, subscription:clinic_subscriptions!inner(owner_user_id)").eq("event_type", "TRIAL_STARTED")
        .or(`clinic_id.eq.${data.clinicId},owner_user_id.eq.${context.userId}`, { referencedTable: undefined }).limit(1),
      supabaseAdmin.from("clinic_subscriptions").select("mandate_status, status, subscription_type").eq("owner_user_id", context.userId).eq("subscription_type", "TRIAL"),
    ]);
    const trialUsed = isTrialUsed({ startedEvents: byClinic.data?.length ?? 0, ownerRows: byOwner.data ?? [], lookupFailed: !!byClinic.error || !!byOwner.error });
    return {
      current: cur ? { id: cur.id, planId: cur.plan_id, scope: cur.clinic_scope, status: cur.status, type: cur.subscription_type, trialEnd: cur.trial_end_date, checkoutStarted: !!cur.provider_subscription_id, mandate: cur.mandate_status ?? null, amount: Number(cur.amount) } : null,
      trialUsed,
    };
  });

export type StartTrialResult =
  | { ok: true; subscriptionId: string; razorpaySubscriptionId: string; keyId: string; trialEnd: string }
  | { ok: false; error: string };

// Starts trial enrollment with a Razorpay subscription whose first charge (start_at) is exactly 21 days away.
// The customer must authorize the mandate in checkout; the trial starts only when the signed
// subscription.authenticated webhook confirms it. Razorpay then charges automatically at start_at.
export const startClinicTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseCreateSubscriptionInput)
  .handler(async ({ data, context }): Promise<StartTrialResult> => {
    const keyId = process.env["RAZORPAY_KEY_ID"];
    const auth = razorpayAuth();
    if (!keyId || !auth) return { ok: false, error: "Payments aren't configured yet." };
    const denied = await assertOwner(context, data.clinicId, true);
    if (denied) return { ok: false, error: denied };
    const plan = await context.supabase.from("plans")
      .select("id, price, multi_price, currency, billing_cycle, clinic_mode, is_active, trial_enabled, razorpay_plan_id, razorpay_multi_plan_id").eq("id", data.planId).maybeSingle();
    if (plan.error || !plan.data || !plan.data.trial_enabled) return { ok: false, error: "This plan doesn't offer a free trial." };
    const resolved = resolvePlanScope(plan.data, data.scope);
    if ("error" in resolved) return { ok: false, error: resolved.error };
    const pricing = pricingFor(plan.data, resolved.scope);
    if ("error" in pricing) return { ok: false, error: pricing.error };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Unpaid checkouts (including abandoned trial authorizations) are cancelled so they can't overlap.
    const pending = (await openSubsForClinic(supabaseAdmin, data.clinicId)).filter(s => s.status === "PENDING_PAYMENT");
    await supersede(supabaseAdmin, pending);

    const { startAt, expireBy } = trialTiming(new Date());
    const rz = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({
        plan_id: pricing.razorpayPlanId, total_count: 120, quantity: 1, customer_notify: 1,
        start_at: startAt, expire_by: expireBy,
        notes: { clinic_id: data.clinicId, careflow_plan_id: plan.data.id, clinic_scope: resolved.scope, careflow_trial: "21d" },
      }),
    });
    const rzBody = (await rz.json().catch(() => ({}))) as { id?: unknown; error?: { code?: string; description?: string } };
    if (!rz.ok || typeof rzBody.id !== "string") {
      console.error("[subscriptions] Razorpay trial create failed", rz.status, rzBody.error?.code, rzBody.error?.description);
      return { ok: false, error: "We couldn't start the trial authorization. Please try again." };
    }
    const trialEnd = new Date(startAt * 1000).toISOString();
    const r = await supabaseAdmin.rpc("begin_mandated_trial", { p_user: context.userId, p_clinic: data.clinicId, p_plan: data.planId, p_scope: resolved.scope, p_provider_id: rzBody.id, p_trial_end: trialEnd });
    if (r.error || !r.data) {
      console.error("[subscriptions] trial enrollment refused", r.error?.message);
      await cancelAtRazorpay(rzBody.id);
      return { ok: false, error: trialErrorMessage(r.error?.message, "enroll") };
    }
    return { ok: true, subscriptionId: r.data, razorpaySubscriptionId: rzBody.id, keyId, trialEnd };
  });

// Cancels the caller's own trial. The Razorpay subscription is cancelled first; if Razorpay refuses, nothing changes,
// so a trial is never shown as cancelled while its trial-end charge is still scheduled. Access ends immediately.
export const cancelClinicTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((b: unknown) => { const s = (b as { subscriptionId?: unknown } | null)?.subscriptionId; if (!isUuid(s)) throw new Error("Invalid subscription"); return { subscriptionId: s }; })
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await supabaseAdmin.from("clinic_subscriptions").select("status, provider_subscription_id, trial_end_date")
      .eq("id", data.subscriptionId).eq("owner_user_id", context.userId).maybeSingle();
    if (row.error || !row.data) return { ok: false, error: trialErrorMessage("TRIAL_NOT_FOUND") };
    if (row.data.status !== "TRIAL_ACTIVE") return { ok: false, error: trialErrorMessage("TRIAL_NOT_ACTIVE") };
    if (!beforeCancelCutoff(row.data.trial_end_date, new Date()))
      return { ok: false, error: "The trial has reached its billing time, so it can no longer be cancelled as a trial. Cancel the plan instead." };
    if (row.data.provider_subscription_id && !(await cancelAtRazorpay(row.data.provider_subscription_id)))
      return { ok: false, error: "Razorpay didn't confirm the cancellation, so your trial wasn't changed. Please try again." };
    const r = await supabaseAdmin.rpc("cancel_clinic_trial", { p_user: context.userId, p_subscription: data.subscriptionId });
    if (r.error) return { ok: false, error: trialErrorMessage(r.error.message) };
    return { ok: true };
  });
