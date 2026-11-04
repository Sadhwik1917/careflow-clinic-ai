import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClinicAnalyticsPage } from "@/components/careflow/clinic-analytics-page";
import { CLINIC_FUTURE_VISUALIZATIONS, type ClinicAnalyticsData } from "@/lib/clinic-analytics-rules";
import { FUTURE_DATA_UNAVAILABLE_MESSAGE } from "@/lib/analytics-types";

const mockData: ClinicAnalyticsData = {
  clinicId: "clinic-1",
  clinicName: "Apollo Care Clinic",
  range: "30d",
  timezone: "Asia/Kolkata",
  currency: "INR",
  appointments: {
    total: 142,
    completed: 120,
    scheduled: 12,
    confirmed: 6,
    cancelled: 4,
    noShow: 0,
    completionRate: 85,
    comparison: { current: 142, previous: 120, changePercentage: 18, direction: "increase" },
    trend: [{ label: "01 Nov", count: 12, completed: 10 }],
    statusBreakdown: [{ status: "COMPLETED", count: 120 }],
    typeBreakdown: [{ type: "CONSULTATION", count: 142 }],
  },
  financials: {
    totalBilled: 75000,
    totalCollected: 68000,
    outstandingBalance: 7000,
    collectionRate: 91,
    comparisonBilled: { current: 75000, previous: 60000, changePercentage: 25, direction: "increase" },
    comparisonCollected: { current: 68000, previous: 55000, changePercentage: 24, direction: "increase" },
    trend: [{ label: "01 Nov", billed: 10000, collected: 9000 }],
    invoiceStatusBreakdown: [{ status: "PAID", count: 40, amount: 68000 }],
    paymentMethodsBreakdown: [{ method: "UPI", amount: 48000, count: 32 }],
  },
  patients: {
    totalActive: 512,
    newRegistrations: 34,
    comparisonNew: { current: 34, previous: 25, changePercentage: 36, direction: "increase" },
    trend: [{ label: "01 Nov", newPatients: 4 }],
  },
  clinical: {
    consultationsTotal: 120,
    consultationsCompleted: 118,
    consultationsDraft: 2,
    doctorAttendanceRate: 95,
    staffAttendanceRate: 98,
    doctorsPresentDays: 22,
    doctorsAbsentDays: 1,
    doctorsCount: 3,
    staffCount: 5,
  },
  aiUsage: {
    totalCredits: 210,
    features: [{ feature: "Clinical Notes", credits: 150 }],
  },
  operationalAlerts: [],
  futureVisualizations: CLINIC_FUTURE_VISUALIZATIONS,
};

// Mock queries with matching keys and instant resolve
vi.mock("@/lib/clinic-analytics", () => ({
  clinicAnalyticsQuery: vi.fn((clinicId: string, range: string, doctorId: string) => ({
    queryKey: ["clinic-analytics", clinicId, range, doctorId],
    queryFn: async () => mockData,
    initialData: mockData,
  })),
}));

vi.mock("@/lib/team-queries", () => ({
  doctorsQuery: vi.fn(() => ({
    queryKey: ["doctors-mock"],
    queryFn: async () => ({ rows: [{ id: "doc-1", display_name: "Sarah Patel" }], count: 1 }),
    initialData: { rows: [{ id: "doc-1", display_name: "Sarah Patel" }], count: 1 },
  })),
}));

// Mock ResizeObserver for Recharts
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("ClinicAnalyticsPage Component", () => {
  it("renders page header, clinic title, and executive KPI cards", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ClinicAnalyticsPage userId="user-1" clinicId="clinic-1" />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Clinic Analytics")).toBeInTheDocument();
    expect(screen.getByText(/Apollo Care Clinic/)).toBeInTheDocument();
    expect(screen.getByText("Total Appointments")).toBeInTheDocument();
    expect(screen.getByText("Revenue Collected")).toBeInTheDocument();
    expect(screen.getByText("Active Patients")).toBeInTheDocument();
    expect(screen.getByText("Doctor Attendance")).toBeInTheDocument();
  });

  it("renders future visualization card with the exact unavailable message", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ClinicAnalyticsPage userId="user-1" clinicId="clinic-1" />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Patient No-Show Risk & Cancellation Predictor")).toBeInTheDocument();
    expect(screen.getByText(FUTURE_DATA_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  });
});
