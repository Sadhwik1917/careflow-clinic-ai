import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { OPEN_SUBSCRIPTION_STATUSES, parseCreateSubscriptionInput, resolvePlanScope } from "@/lib/subscription-rules";

export type CreateSubscriptionResult =
  | { ok: true; subscriptionId: string; razorpaySubscriptionId: string; keyId: string; reused: boolean }
  | { ok: false; error: string };

// Creates a Razorpay subscription for an approved clinic's owner. The row is stored as PENDING_PAYMENT,
// which clinic_is_operational() does not accept, so creating a subscription never unlocks the clinic.
export const createClinicSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseCreateSubscriptionInput)
  .handler(async ({ data, context }): Promise<CreateSubscriptionResult> => {
    const keyId = process.env["RAZORPAY_KEY_ID"];
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];
    if (!keyId || !keySecret) { console.error("[subscriptions] Razorpay credentials missing"); return { ok: false, error: "Payments aren't configured yet." }; }
    const { supabase, userId } = context;

    // Owner check and approval check run as the caller (RLS applies).
    const member = await supabase.from("clinic_members").select("id")
      .eq("clinic_id", data.clinicId).eq("user_id", userId).eq("role", "OWNER").eq("status", "ACTIVE").maybeSingle();
    if (member.error || !member.data) return { ok: false, error: "Only the clinic owner can choose a plan." };
    const ver = await supabase.from("clinic_verifications").select("status").eq("clinic_id", data.clinicId).maybeSingle();
    if (ver.error || ver.data?.status !== "APPROVED") return { ok: false, error: "Your clinic must be approved first." };

    // Plan, price and Razorpay plan id come only from the database.
    const plan = await supabase.from("plans")
      .select("id, price, currency, billing_cycle, clinic_mode, is_active, razorpay_plan_id").eq("id", data.planId).maybeSingle();
    if (plan.error || !plan.data) return { ok: false, error: "This plan isn't available." };
    const resolved = resolvePlanScope(plan.data, data.scope);
    if ("error" in resolved) return { ok: false, error: resolved.error };

    // Subscription tables are server-write-only, so the privileged client is loaded after authorization.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existing = await supabaseAdmin.from("subscription_clinics")
      .select("subscription:clinic_subscriptions(id, plan_id, clinic_scope, status, provider_subscription_id)").eq("clinic_id", data.clinicId);
    if (existing.error) { console.error("[subscriptions] lookup failed", existing.error.message); return { ok: false, error: "Please try again." }; }
    const open = (existing.data ?? []).map(r => r.subscription)
      .filter((s): s is NonNullable<typeof s> => !!s && (OPEN_SUBSCRIPTION_STATUSES as readonly string[]).includes(s.status));
    const first = open[0];
    if (first) {
      if (open.length === 1 && first.status === "PENDING_PAYMENT" && first.plan_id === plan.data.id && first.clinic_scope === resolved.scope && first.provider_subscription_id)
        return { ok: true, subscriptionId: first.id, razorpaySubscriptionId: first.provider_subscription_id, keyId, reused: true };
      return { ok: false, error: "This clinic already has a subscription in progress." };
    }

    const auth = "Basic " + btoa(`${keyId}:${keySecret}`);
    const rz = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({
        plan_id: plan.data.razorpay_plan_id, total_count: 120, quantity: 1, customer_notify: 1,
        notes: { clinic_id: data.clinicId, careflow_plan_id: plan.data.id, clinic_scope: resolved.scope },
      }),
    });
    const rzBody = (await rz.json().catch(() => ({}))) as { id?: unknown; error?: { code?: string; description?: string } };
    if (!rz.ok || typeof rzBody.id !== "string") {
      console.error("[subscriptions] Razorpay create failed", rz.status, rzBody.error?.code, rzBody.error?.description);
      return { ok: false, error: "We couldn't start the subscription. Please try again." };
    }
    const rzId = rzBody.id;

    const ins = await supabaseAdmin.from("clinic_subscriptions").insert({
      owner_user_id: userId, plan_id: plan.data.id, status: "PENDING_PAYMENT", subscription_type: "PAID", auto_renew: true,
      payment_provider: "razorpay", provider_subscription_id: rzId, clinic_scope: resolved.scope,
      billing_cycle: plan.data.billing_cycle, amount: plan.data.price, currency: plan.data.currency,
    }).select("id").single();
    const link = ins.data ? await supabaseAdmin.from("subscription_clinics").insert({ subscription_id: ins.data.id, clinic_id: data.clinicId }) : null;
    if (ins.error || !ins.data || link?.error) {
      console.error("[subscriptions] store failed", ins.error?.message ?? link?.error?.message);
      if (ins.data) await supabaseAdmin.from("clinic_subscriptions").delete().eq("id", ins.data.id);
      await fetch(`https://api.razorpay.com/v1/subscriptions/${rzId}/cancel`, { method: "POST", headers: { Authorization: auth } }).catch(() => undefined);
      return { ok: false, error: "We couldn't save the subscription. Please try again." };
    }
    return { ok: true, subscriptionId: ins.data.id, razorpaySubscriptionId: rzId, keyId, reused: false };
  });
