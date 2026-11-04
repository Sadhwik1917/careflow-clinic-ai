import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { FutureVisualizationDef, AnalyticsAiPayload } from "./analytics-types";

export type SubStatus = Database["public"]["Enums"]["subscription_status"];
export const SUB_STATUSES: SubStatus[] = [
  "ACTIVE",
  "TRIAL_ACTIVE",
  "PAST_DUE",
  "PENDING_PAYMENT",
  "TRIAL_CANCELLED",
  "TRIAL_EXPIRED",
  "CANCELLED",
  "EXPIRED",
];

export const ANALYTICS_RANGES = ["7d", "30d", "90d", "12m"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];
export const analyticsSearchSchema = z.object({ range: z.enum(ANALYTICS_RANGES).catch("30d").default("30d") });
export const rangeLabel: Record<AnalyticsRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "12m": "12 months",
};

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
      out.push({
        label: s.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }),
        start: s.toISOString(),
        end: e.toISOString(),
      });
    }
    return out;
  }
  const [count, size] = range === "7d" ? [7, 1] : range === "30d" ? [10, 3] : [13, 7];
  for (let i = count - 1; i >= 0; i--) {
    const e = new Date(end.getTime() - i * size * day);
    const s = new Date(e.getTime() - size * day);
    out.push({
      label: s.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
      start: s.toISOString(),
      end: e.toISOString(),
    });
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

/** Estimates Monthly Recurring Revenue (MRR) from active paid subscriptions. */
export function calculateEstimatedMrr(activeSubs: { amount: number; billing_cycle: string }[]): number {
  return activeSubs.reduce((acc, sub) => {
    const amt = typeof sub.amount === "number" && !isNaN(sub.amount) ? sub.amount : 0;
    if (sub.billing_cycle === "ANNUAL" || sub.billing_cycle === "YEARLY") {
      return acc + Math.round(amt / 12);
    }
    return acc + amt;
  }, 0);
}

/** Platform Admin planned future visualizations */
export const ADMIN_FUTURE_VISUALIZATIONS: FutureVisualizationDef[] = [
  {
    id: "clinic-churn-risk-forecast",
    title: "Clinic Adoption & Churn Risk Forecast",
    description: "Predictive model projecting 90-day clinic churn risk based on active staff logins and appointment volume decay.",
    purpose: "Alerts platform administrators to clinics with dropping operational engagement before subscription expiration.",
    dataRequired: [
      "user_sessions (login frequency)",
      "appointments (rolling 14-day velocity)",
      "clinic_members (active vs stale seats)",
      "clinic_subscriptions (mandate status)",
    ],
    aggregation: "Machine-learning churn risk classification vector grouped by subscription cohort",
    role: "PLATFORM_ADMIN",
    status: "PLANNED",
    chartType: "area",
  },
  {
    id: "ai-token-cost-velocity",
    title: "AI Token & Inference Margin Forecast",
    description: "Projected platform inference cost against subscription credit consumption tiers.",
    purpose: "Evaluates whether current plan credit pricing remains gross-margin positive as clinic AI assistant interactions scale.",
    dataRequired: [
      "ai_usage (credits consumed)",
      "ai_interactions (model identifier, prompt/completion tokens)",
      "plans (price, monthly credit allowances)",
    ],
    aggregation: "Token velocity moving average multiplied by model inference API cost matrix",
    role: "PLATFORM_ADMIN",
    status: "PLANNED",
    chartType: "bar",
  },
];

/** null = couldn't be calculated (never shown as zero). */
export type Metric = number | null;

export type AnalyticsData = {
  users: Metric;
  clinics: Metric;
  pendingReview: Metric;
  approved: Metric;
  suspended: Metric;
  revoked: Metric;
  activePaid: Metric;
  runningTrials: Metric;
  statusDistribution: { status: SubStatus; count: Metric }[];
  trend: { label: string; users: Metric; clinics: Metric }[];
  // Enhanced platform health and AI analytics
  estimatedMrr?: Metric;
  totalAiCredits?: Metric;
  aiTrend?: { label: string; credits: Metric }[];
  aiFeatures?: { feature: string; credits: number }[];
  futureVisualizations?: FutureVisualizationDef[];
};

/** AI-readiness helper: exports de-identified platform admin analytics for future AI assistant reasoning */
export function exportAdminAnalyticsForAi(data: AnalyticsData, range: AnalyticsRange): AnalyticsAiPayload {
  return {
    generatedAt: new Date().toISOString(),
    role: "PLATFORM_ADMIN",
    range,
    metrics: {
      totalUsers: { label: "Total Registered Users", value: data.users, isFactual: true },
      totalClinics: { label: "Total Registered Clinics", value: data.clinics, isFactual: true },
      approvedClinics: { label: "Approved Operational Clinics", value: data.approved, isFactual: true },
      pendingReviewClinics: { label: "Verifications Awaiting Review", value: data.pendingReview, isFactual: true },
      suspendedClinics: { label: "Suspended Clinics", value: data.suspended, isFactual: true },
      activePaidSubscriptions: { label: "Active Paid Subscriptions", value: data.activePaid, isFactual: true },
      runningTrials: { label: "Running Mandated Trials", value: data.runningTrials, isFactual: true },
      estimatedMrr: { label: "Estimated Platform MRR", value: data.estimatedMrr ?? null, unit: "INR", isFactual: true },
      totalAiCreditsUsed: { label: "Total Platform AI Credits Used", value: data.totalAiCredits ?? null, isFactual: true },
    },
    summaryText: `Platform summary for ${rangeLabel[range]}: ${data.clinics ?? "unknown"} clinics registered (${data.approved ?? "unknown"} approved), ${data.activePaid ?? "unknown"} active subscriptions, estimated MRR: ₹${data.estimatedMrr?.toLocaleString("en-IN") ?? "0"}.`,
  };
}
