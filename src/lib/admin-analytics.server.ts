import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { allBatches } from "./admin-subscriptions.server";
import { buckets, countRevoked, SUB_STATUSES, type AnalyticsData, type AnalyticsRange, type Metric } from "./admin-analytics-rules";

type Client = SupabaseClient<Database>;

/** Count-only reads (head: true) under the caller's RLS; a failed count becomes null, not zero. */
async function n(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<Metric> {
  try { const { count, error } = await q; return error || count === null ? null : count; } catch { return null; }
}

async function revoked(client: Client): Promise<Metric> {
  try {
    const rejected = await allBatches((s, e) => client.from("clinic_verifications").select("clinic_id").eq("status", "REJECTED").order("clinic_id").range(s, e));
    if (!rejected.length) return 0;
    const ids = rejected.map(r => r.clinic_id);
    const events: { clinic_id: string; event_type: string; created_at: string }[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      events.push(...await allBatches((s, e) => client.from("verification_events").select("clinic_id,event_type,created_at").in("clinic_id", ids.slice(i, i + 100)).order("id").range(s, e)));
    }
    return countRevoked(ids, events);
  } catch { return null; }
}

export async function readAdminAnalytics(client: Client, range: AnalyticsRange, now = new Date()): Promise<AnalyticsData> {
  const head = { count: "exact" as const, head: true };
  const subs = () => client.from("clinic_subscriptions").select("id", head);
  const [users, clinics, pendingReview, approved, suspended, revokedCount, activePaid, runningTrials, ...dist] = await Promise.all([
    n(client.from("profiles").select("id", head)),
    n(client.from("clinics").select("id", head)),
    n(client.from("clinic_verifications").select("clinic_id", head).eq("status", "PENDING_REVIEW")),
    n(client.from("clinic_verifications").select("clinic_id, clinic:clinics!inner(status)", head).eq("status", "APPROVED").eq("clinic.status", "ACTIVE")),
    n(client.from("clinics").select("id", head).eq("status", "SUSPENDED")),
    revoked(client),
    n(subs().eq("status", "ACTIVE")),
    // Matches trialLabel: a TRIAL_ACTIVE row past its end date is expired, not running.
    n(subs().eq("status", "TRIAL_ACTIVE").gt("trial_end_date", now.toISOString())),
    ...SUB_STATUSES.map(s => n(subs().eq("status", s))),
  ]);
  const bs = buckets(range, now);
  const trend = await Promise.all(bs.map(async b => ({
    label: b.label,
    users: await n(client.from("profiles").select("id", head).gte("created_at", b.start).lt("created_at", b.end)),
    clinics: await n(client.from("clinics").select("id", head).gte("created_at", b.start).lt("created_at", b.end)),
  })));
  return {
    users, clinics, pendingReview, approved, suspended, revoked: revokedCount, activePaid, runningTrials,
    statusDistribution: SUB_STATUSES.map((status, i) => ({ status, count: dist[i] ?? null })), trend,
  };
}
