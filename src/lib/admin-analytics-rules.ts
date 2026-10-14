import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type SubStatus = Database["public"]["Enums"]["subscription_status"];
export const SUB_STATUSES: SubStatus[] = ["ACTIVE", "TRIAL_ACTIVE", "PAST_DUE", "PENDING_PAYMENT", "TRIAL_CANCELLED", "TRIAL_EXPIRED", "CANCELLED", "EXPIRED"];

export const ANALYTICS_RANGES = ["7d", "30d", "90d", "12m"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];
export const analyticsSearchSchema = z.object({ range: z.enum(ANALYTICS_RANGES).catch("30d").default("30d") });
export const rangeLabel: Record<AnalyticsRange, string> = { "7d": "7 days", "30d": "30 days", "90d": "90 days", "12m": "12 months" };

export type Bucket = { label: string; start: string; end: string };

/** Fixed, small bucket sets so trends use count-only queries rather than downloading rows. */
export function buckets(range: AnalyticsRange, now = new Date()): Bucket[] {
  const out: Bucket[] = [];
  const day = 86_400_000;
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  if (range === "12m") {
    for (let i = 11; i >= 0; i--) {
      const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const e = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
      out.push({ label: s.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }), start: s.toISOString(), end: e.toISOString() });
    }
    return out;
  }
  const [count, size] = range === "7d" ? [7, 1] : range === "30d" ? [10, 3] : [13, 7];
  for (let i = count - 1; i >= 0; i--) {
    const e = new Date(end.getTime() - i * size * day);
    const s = new Date(e.getTime() - size * day);
    out.push({ label: s.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }), start: s.toISOString(), end: e.toISOString() });
  }
  return out;
}

/** A clinic is revoked when its current verification is REJECTED and its latest event is REVOKED_AFTER_APPROVAL. */
export function countRevoked(rejectedIds: string[], events: { clinic_id: string; event_type: string; created_at: string }[]) {
  const latest = new Map<string, { event_type: string; created_at: string }>();
  for (const e of events) {
    const cur = latest.get(e.clinic_id);
    if (!cur || e.created_at > cur.created_at) latest.set(e.clinic_id, e);
  }
  return rejectedIds.filter(id => latest.get(id)?.event_type === "REVOKED_AFTER_APPROVAL").length;
}

/** null = couldn't be calculated (never shown as zero). */
export type Metric = number | null;
export type AnalyticsData = {
  users: Metric; clinics: Metric; pendingReview: Metric; approved: Metric; suspended: Metric; revoked: Metric;
  activePaid: Metric; runningTrials: Metric;
  statusDistribution: { status: SubStatus; count: Metric }[];
  trend: { label: string; users: Metric; clinics: Metric }[];
};
