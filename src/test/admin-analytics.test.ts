import { describe, it, expect, vi } from "vitest";
import {
  analyticsSearchSchema,
  buckets,
  countRevoked,
  calculateEstimatedMrr,
  ADMIN_FUTURE_VISUALIZATIONS,
  exportAdminAnalyticsForAi,
} from "@/lib/admin-analytics-rules";
import { readAdminAnalytics } from "@/lib/admin-analytics.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function client(result: (calls: string[][]) => unknown) {
  return {
    from: vi.fn(() => {
      const calls: string[][] = [];
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gt", "gte", "lt", "in", "order", "range"])
        b[m] = vi.fn((...a: string[]) => {
          calls.push([m, ...a.map(String)]);
          return b;
        });
      b["then"] = (r: (v: unknown) => unknown, j: (e: unknown) => unknown) => Promise.resolve(result(calls)).then(r, j);
      return b;
    }),
  } as unknown as SupabaseClient<Database>;
}

describe("admin analytics", () => {
  it("defaults and rejects unknown ranges safely", () => {
    expect(analyticsSearchSchema.parse({})).toEqual({ range: "30d" });
    expect(analyticsSearchSchema.parse({ range: "5y" })).toEqual({ range: "30d" });
  });

  it("builds contiguous buckets for every range", () => {
    const now = new Date("2026-10-14T12:00:00Z");
    for (const [r, len] of [["7d", 7], ["30d", 10], ["90d", 13], ["12m", 12]] as const) {
      const b = buckets(r, now);
      expect(b).toHaveLength(len);
      for (let i = 1; i < b.length; i++) expect(b[i]!.start).toBe(b[i - 1]!.end);
      expect(new Date(b.at(-1)!.end) > now).toBe(true);
    }
  });

  it("counts revoked only when the latest event is a revocation", () => {
    expect(
      countRevoked(
        ["a", "b", "c"],
        [
          { clinic_id: "a", event_type: "REVOKED_AFTER_APPROVAL", created_at: "2026-01-02" },
          { clinic_id: "b", event_type: "REVOKED_AFTER_APPROVAL", created_at: "2026-01-01" },
          { clinic_id: "b", event_type: "REJECTED", created_at: "2026-01-03" },
        ]
      )
    ).toBe(1);
  });

  it("calculates estimated MRR correctly from monthly and annual plans", () => {
    const subs = [
      { amount: 1000, billing_cycle: "MONTHLY" },
      { amount: 12000, billing_cycle: "ANNUAL" },
      { amount: 2400, billing_cycle: "YEARLY" },
      { amount: 500, billing_cycle: "MONTHLY" },
    ];
    // 1000 + 1000 (12000/12) + 200 (2400/12) + 500 = 2700
    expect(calculateEstimatedMrr(subs)).toBe(2700);
  });

  it("reports failed counts as unavailable, not zero", async () => {
    const data = await readAdminAnalytics(client(() => ({ count: null, data: null, error: new Error("x") })), "7d");
    expect(data.users).toBeNull();
    expect(data.activePaid).toBeNull();
    expect(data.estimatedMrr).toBeNull();
    expect(data.trend.every(t => t.users === null)).toBe(true);
  });

  it("uses count-only reads and excludes expired trials", async () => {
    const seen: string[][][] = [];
    const data = await readAdminAnalytics(
      client(calls => {
        seen.push(calls);
        return { count: 3, data: [], error: null };
      }),
      "7d",
      new Date("2026-10-14T00:00:00Z")
    );
    expect(data.users).toBe(3);
    expect(data.revoked).toBe(0);
    const trial = seen.find(c => c.some(x => x[0] === "eq" && x[2] === "TRIAL_ACTIVE") && c.some(x => x[0] === "gt"));
    expect(trial?.find(x => x[0] === "gt")).toEqual(["gt", "trial_end_date", "2026-10-14T00:00:00.000Z"]);
  });

  it("includes valid future visualization definitions", () => {
    expect(ADMIN_FUTURE_VISUALIZATIONS.length).toBeGreaterThan(0);
    for (const def of ADMIN_FUTURE_VISUALIZATIONS) {
      expect(def.role).toBe("PLATFORM_ADMIN");
      expect(def.status).toBe("PLANNED");
      expect(def.dataRequired.length).toBeGreaterThan(0);
      expect(def.purpose).toBeTruthy();
    }
  });

  it("formats structured AI analytics payload cleanly without sensitive data", () => {
    const payload = exportAdminAnalyticsForAi(
      {
        users: 150,
        clinics: 12,
        pendingReview: 2,
        approved: 9,
        suspended: 1,
        revoked: 0,
        activePaid: 8,
        runningTrials: 1,
        statusDistribution: [],
        trend: [],
        estimatedMrr: 25000,
        totalAiCredits: 340,
      },
      "30d"
    );
    expect(payload.role).toBe("PLATFORM_ADMIN");
    expect(payload.range).toBe("30d");
    expect(payload.metrics["totalUsers"]?.value).toBe(150);
    expect(payload.metrics["totalClinics"]?.value).toBe(12);
    expect(payload.metrics["estimatedMrr"]?.value).toBe(25000);
    expect(payload.summaryText).toContain("12 clinics registered");
  });
});
