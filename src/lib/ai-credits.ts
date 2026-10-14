/** Client-safe AI credit rules. The database (reserve_ai_credit / clinic_ai_usage) is the authority; this only interprets its answers.
 * For UNLIMITED plans the database withholds the internal threshold from clinic members (limit = null) and reports `throttled` instead;
 * only platform admins receive the threshold. */
export const CREDITS_PER_REQUEST = 1;
export const THROTTLE_DELAY_MS = 8_000; // Max AI: deliberate slowdown once the monthly threshold is passed

export type AiUsage =
  | { included: false }
  | { included: true; creditType: "LIMITED" | "UNLIMITED"; limit: number | null; throttled: boolean; used: number; shared: boolean; periodStart: string; periodEnd: string };

export function parseAiUsage(v: unknown): AiUsage {
  const o = (v ?? {}) as { included?: unknown; credit_type?: unknown; limit?: unknown; throttled?: unknown; used?: unknown; shared?: unknown; period_start?: unknown; period_end?: unknown };
  if (o.included !== true) return { included: false };
  return {
    included: true,
    creditType: o.credit_type === "UNLIMITED" ? "UNLIMITED" : "LIMITED",
    limit: o.limit == null ? null : Number(o.limit),
    throttled: o.throttled === true,
    used: Number(o.used ?? 0),
    shared: o.shared === true,
    periodStart: String(o.period_start ?? ""),
    periodEnd: String(o.period_end ?? ""),
  };
}

export type UsageState = "OK" | "LIMIT_REACHED" | "THROTTLED";
export function usageState(u: Extract<AiUsage, { included: true }>): UsageState {
  if (u.creditType === "UNLIMITED") return u.throttled || (u.limit != null && u.used >= u.limit) ? "THROTTLED" : "OK";
  if (u.limit == null || u.used < u.limit) return "OK";
  return "LIMIT_REACHED";
}
export function remaining(u: Extract<AiUsage, { included: true }>) {
  return u.limit == null ? null : Math.max(0, u.limit - u.used);
}
