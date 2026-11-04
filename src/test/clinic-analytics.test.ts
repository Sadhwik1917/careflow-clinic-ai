import { describe, it, expect, vi } from "vitest";
import {
  clinicAnalyticsSearchSchema,
  clinicBuckets,
  calculateComparison,
  CLINIC_FUTURE_VISUALIZATIONS,
  exportClinicAnalyticsForAi,
  type ClinicAnalyticsData,
} from "@/lib/clinic-analytics-rules";
import { readClinicAnalytics, assertOperationalClinicOwner } from "@/lib/clinic-analytics.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

describe("clinic analytics rules & comparisons", () => {
  it("defaults and validates search params safely", () => {
    expect(clinicAnalyticsSearchSchema.parse({})).toEqual({ range: "30d", doctorId: "" });
    expect(clinicAnalyticsSearchSchema.parse({ range: "7d", doctorId: "doc-123" })).toEqual({
      range: "7d",
      doctorId: "doc-123",
    });
    // Fallback for invalid range
    expect(clinicAnalyticsSearchSchema.parse({ range: "invalid-range" as any })).toEqual({
      range: "30d",
      doctorId: "",
    });
  });

  it("builds contiguous buckets for all clinic ranges", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    for (const r of ["today", "7d", "30d", "90d", "12m"] as const) {
      const b = clinicBuckets(r, now);
      expect(b.length).toBeGreaterThan(0);
      for (const bucket of b) {
        expect(bucket.label).toBeTruthy();
        expect(new Date(bucket.start).getTime()).toBeLessThanOrEqual(new Date(bucket.end).getTime());
      }
    }
  });

  it("calculates comparison metrics accurately", () => {
    // Increase
    const inc = calculateComparison(120, 100);
    expect(inc.changePercentage).toBe(20);
    expect(inc.direction).toBe("increase");

    // Decrease
    const dec = calculateComparison(80, 100);
    expect(dec.changePercentage).toBe(-20);
    expect(dec.direction).toBe("decrease");

    // Neutral
    const neu = calculateComparison(100, 100);
    expect(neu.changePercentage).toBe(0);
    expect(neu.direction).toBe("neutral");

    // Zero prior
    const fromZero = calculateComparison(50, 0);
    expect(fromZero.changePercentage).toBe(100);
    expect(fromZero.direction).toBe("increase");

    // Both zero
    const bothZero = calculateComparison(0, 0);
    expect(bothZero.changePercentage).toBe(0);
    expect(bothZero.direction).toBe("neutral");

    // Null prior
    const nullPrior = calculateComparison(50, null);
    expect(nullPrior.changePercentage).toBeNull();
    expect(nullPrior.direction).toBe("none");
  });

  it("defines planned future visualizations for clinic owners", () => {
    expect(CLINIC_FUTURE_VISUALIZATIONS.length).toBeGreaterThanOrEqual(3);
    for (const def of CLINIC_FUTURE_VISUALIZATIONS) {
      expect(def.role).toBe("OWNER");
      expect(def.status).toBe("PLANNED");
      expect(def.dataRequired.length).toBeGreaterThan(0);
      expect(def.purpose).toBeTruthy();
      expect(def.title).toBeTruthy();
    }
  });

  it("exports structured de-identified AI analytics payload", () => {
    const mockData: ClinicAnalyticsData = {
      clinicId: "clinic-1",
      clinicName: "Metro Heart Clinic",
      range: "30d",
      timezone: "Asia/Kolkata",
      currency: "INR",
      appointments: {
        total: 100,
        completed: 85,
        scheduled: 10,
        confirmed: 5,
        cancelled: 5,
        noShow: 0,
        completionRate: 85,
        comparison: { current: 100, previous: 90, changePercentage: 11, direction: "increase" },
        trend: [],
        statusBreakdown: [],
        typeBreakdown: [],
      },
      financials: {
        totalBilled: 50000,
        totalCollected: 45000,
        outstandingBalance: 5000,
        collectionRate: 90,
        comparisonBilled: { current: 50000, previous: 40000, changePercentage: 25, direction: "increase" },
        comparisonCollected: { current: 45000, previous: 38000, changePercentage: 18, direction: "increase" },
        trend: [],
        invoiceStatusBreakdown: [],
        paymentMethodsBreakdown: [],
      },
      patients: {
        totalActive: 420,
        newRegistrations: 28,
        comparisonNew: { current: 28, previous: 20, changePercentage: 40, direction: "increase" },
        trend: [],
      },
      clinical: {
        consultationsTotal: 85,
        consultationsCompleted: 82,
        consultationsDraft: 3,
        doctorAttendanceRate: 96,
        staffAttendanceRate: 98,
        doctorsPresentDays: 24,
        doctorsAbsentDays: 1,
        doctorsCount: 4,
        staffCount: 6,
      },
      aiUsage: {
        totalCredits: 120,
        features: [{ feature: "Clinical Notes", credits: 80 }, { feature: "Patient Intake", credits: 40 }],
      },
      operationalAlerts: [],
      futureVisualizations: CLINIC_FUTURE_VISUALIZATIONS,
    };

    const aiPayload = exportClinicAnalyticsForAi(mockData);
    expect(aiPayload.role).toBe("OWNER");
    expect(aiPayload.clinicId).toBe("clinic-1");
    expect(aiPayload.metrics["totalAppointments"]?.value).toBe(100);
    expect(aiPayload.metrics["appointmentCompletionRate"]?.value).toBe("85%");
    expect(aiPayload.metrics["totalCollected"]?.value).toBe(45000);
    expect(aiPayload.metrics["collectionEfficiency"]?.value).toBe("90%");
    expect(aiPayload.metrics["doctorAttendanceRate"]?.value).toBe("96%");
    expect(aiPayload.summaryText).toContain("Metro Heart Clinic");
    expect(aiPayload.summaryText).toContain("85% completion");
  });
});

describe("clinic analytics authorization & server checks", () => {
  function createMockDb(profile: any, membership: any, operational: boolean) {
    return {
      from: vi.fn((table: string) => {
        const queryObj: any = {};
        queryObj.select = vi.fn(() => queryObj);
        queryObj.eq = vi.fn(() => queryObj);
        queryObj.maybeSingle = vi.fn().mockImplementation(() => {
          if (table === "profiles") return Promise.resolve({ data: profile, error: null });
          if (table === "clinic_members") return Promise.resolve({ data: membership, error: null });
          return Promise.resolve({ data: null, error: null });
        });
        return queryObj;
      }),
      rpc: vi.fn().mockResolvedValue({ data: operational, error: null }),
    } as unknown as SupabaseClient<Database>;
  }

  it("rejects unauthorized non-owner access", async () => {
    const mockDb = createMockDb(
      { platform_role: "USER", status: "ACTIVE" },
      { role: "STAFF", status: "ACTIVE" }, // Not OWNER
      true
    );

    await expect(assertOperationalClinicOwner(mockDb, "user-1", "clinic-1")).rejects.toThrow(
      "Operational clinic owner access is required."
    );
  });

  it("rejects when clinic is not operational", async () => {
    const mockDb = createMockDb(
      { platform_role: "USER", status: "ACTIVE" },
      { role: "OWNER", status: "ACTIVE" },
      false // Not operational
    );

    await expect(assertOperationalClinicOwner(mockDb, "user-1", "clinic-1")).rejects.toThrow(
      "Operational clinic owner access is required."
    );
  });

  it("accepts active OWNER membership of an operational clinic", async () => {
    const mockDb = createMockDb(
      { platform_role: "USER", status: "ACTIVE" },
      { role: "OWNER", status: "ACTIVE" },
      true
    );

    await expect(assertOperationalClinicOwner(mockDb, "user-1", "clinic-1")).resolves.toBeUndefined();
  });
});
