// Server-only helpers for Razorpay subscription bookkeeping.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;
type Row = { id: string; status: string; provider_subscription_id: string | null };

export function razorpayAuth(): string | null {
  const id = process.env["RAZORPAY_KEY_ID"] || process.env["VITE_RAZORPAY_KEY_ID"];
  const secret = process.env["RAZORPAY_KEY_SECRET"];
  return id && secret ? "Basic " + btoa(`${id}:${secret}`) : null;
}

export async function cancelAtRazorpay(providerId: string | null) {
  const auth = razorpayAuth();
  if (!providerId || !auth) return !providerId;
  const r = await fetch(`https://api.razorpay.com/v1/subscriptions/${providerId}/cancel`, { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify({ cancel_at_cycle_end: 0 }) }).catch(() => null);
  if (r?.ok) return true;
  // Already cancelled/expired at Razorpay counts as stopped.
  const body = r ? ((await r.json().catch(() => ({}))) as { error?: { description?: string } }) : {};
  if (r && /cancel|expired|completed/i.test(body.error?.description ?? "")) return true;
  console.error("[subscriptions] Razorpay cancel failed", providerId, r?.status);
  return false;
}

/** Ends rows replaced by another enrollment: unpaid checkouts and plans superseded by a verified payment. */
export async function supersede(admin: Admin, rows: Row[]) {
  for (const r of rows) {
    await cancelAtRazorpay(r.provider_subscription_id);
    const trial = r.status === "TRIAL_ACTIVE";
    const now = new Date().toISOString();
    await admin.from("clinic_subscriptions").update(trial ? { status: "TRIAL_CANCELLED", trial_cancelled_at: now, cancelled_at: now } : { status: "CANCELLED", cancelled_at: now }).eq("id", r.id).eq("status", r.status as never);
  }
}

export async function openSubsForClinic(admin: Admin, clinicId: string) {
  const res = await admin.from("subscription_clinics")
    .select("subscription:clinic_subscriptions(id, plan_id, clinic_scope, status, subscription_type, provider_subscription_id, trial_end_date, owner_user_id, mandate_status, amount, next_billing_date)").eq("clinic_id", clinicId);
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []).map(r => r.subscription).filter((s): s is NonNullable<typeof s> => !!s);
}
