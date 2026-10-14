import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { VerificationStatus } from "@/lib/verification";

// Platform-admin reads. Access is enforced by RLS (private.is_platform_admin()); keys sit under
// "admin-verifications" so the existing review actions refresh these lists too.
type SubStatus = Database["public"]["Enums"]["subscription_status"];
export type AdminClinic = {
  id: string; name: string; display_name: string; clinic_code: string; city: string | null; state: string | null;
  created_at: string; verification: VerificationStatus | null; subscription: { status: SubStatus; plan: string | null } | null;
  clinic_status?: string; events?: { event_type: string; reason: string | null; created_at: string }[];
};

/** Subscriptions counted as "active": paid ACTIVE plus running trials. */
export const COUNTED_SUBSCRIPTION_STATUSES: SubStatus[] = ["ACTIVE", "TRIAL_ACTIVE"];
const SUB_PRIORITY: SubStatus[] = ["ACTIVE", "TRIAL_ACTIVE", "PAST_DUE", "PENDING_PAYMENT", "TRIAL_CANCELLED", "TRIAL_EXPIRED", "CANCELLED", "EXPIRED"];
export const subscriptionLabel: Record<SubStatus, string> = {
  ACTIVE: "Active", TRIAL_ACTIVE: "Free trial", PAST_DUE: "Past due", PENDING_PAYMENT: "Awaiting payment",
  TRIAL_CANCELLED: "Trial cancelled", TRIAL_EXPIRED: "Trial expired", CANCELLED: "Cancelled", EXPIRED: "Expired",
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export function pickSubscription(list: { status: SubStatus; plan: string | null }[]) {
  return [...list].sort((a, b) => SUB_PRIORITY.indexOf(a.status) - SUB_PRIORITY.indexOf(b.status))[0] ?? null;
}

export const adminClinicsQuery = queryOptions({
  queryKey: ["admin-verifications", "clinics"],
  queryFn: async (): Promise<AdminClinic[]> => {
    const { data, error } = await supabase.from("clinics")
      .select("id, name, display_name, clinic_code, city, state, created_at, status, verification:clinic_verifications(status), events:verification_events(event_type, reason, created_at), links:subscription_clinics(subscription:clinic_subscriptions(status, plan:plans(name)))")
      .order("created_at", { ascending: false });
    if (error) throw new Error("We couldn't load clinics.");
    return (data ?? []).map((c: any) => ({
      id: c.id, name: c.name, display_name: c.display_name, clinic_code: c.clinic_code, city: c.city, state: c.state, created_at: c.created_at,
      clinic_status: c.status, events: c.events ?? [],
      verification: one<{ status: VerificationStatus }>(c.verification)?.status ?? null,
      subscription: pickSubscription(((c.links ?? []) as any[]).map(l => one<any>(l.subscription)).filter(Boolean).map((s: any) => ({ status: s.status, plan: one<{ name: string }>(s.plan)?.name ?? null }))),
    }));
  },
});

async function count(q: PromiseLike<{ count: number | null; error: unknown }>) {
  const { count: n, error } = await q;
  if (error || n === null) throw new Error("count failed");
  return n;
}

export const adminStatsQuery = queryOptions({
  queryKey: ["admin-verifications", "stats"],
  queryFn: async () => {
    const [clinics, subscriptions, users, pending] = await Promise.allSettled([
      count(supabase.from("clinics").select("id", { count: "exact", head: true })),
      count(supabase.from("clinic_subscriptions").select("id", { count: "exact", head: true }).in("status", COUNTED_SUBSCRIPTION_STATUSES)),
      count(supabase.from("profiles").select("id", { count: "exact", head: true })),
      count(supabase.from("clinic_verifications").select("clinic_id", { count: "exact", head: true }).eq("status", "PENDING_REVIEW")),
    ]);
    const v = (r: PromiseSettledResult<number>) => (r.status === "fulfilled" ? r.value : null);
    return { clinics: v(clinics), subscriptions: v(subscriptions), users: v(users), pending: v(pending) };
  },
});

export type DashboardActivity = { id: string; action: string; entity_type: string; created_at: string; clinic: { id: string; display_name: string; clinic_code: string } | null };

/** Maps audit rows to dashboard items, attaching the affected clinic only when the row records it. */
export function toDashboardActivity(rows: any[]): DashboardActivity[] {
  return rows.map(r => ({ id: r.id, action: r.action, entity_type: r.entity_type, created_at: r.created_at, clinic: one<any>(r.clinic) ?? null }));
}

export const adminActivityQuery = queryOptions({
  queryKey: ["admin-verifications", "activity"],
  queryFn: async () => {
    const { data, error } = await supabase.from("audit_logs").select("id, action, entity_type, created_at, clinic:clinics(id, display_name, clinic_code)").order("created_at", { ascending: false }).limit(8);
    if (error) throw new Error("We couldn't load platform activity.");
    return toDashboardActivity(data ?? []);
  },
});
