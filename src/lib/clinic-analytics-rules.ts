import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { FutureVisualizationDef, AnalyticsAiPayload, MetricComparison, MetricValue } from "./analytics-types";

export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];
export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export const CLINIC_ANALYTICS_RANGES = ["today", "7d", "30d", "90d", "12m"] as const;
export type ClinicAnalyticsRange = (typeof CLINIC_ANALYTICS_RANGES)[number];

export const clinicAnalyticsSearchSchema = z.object({
  range: z.enum(CLINIC_ANALYTICS_RANGES).catch("30d").default("30d"),
  doctorId: z.string().optional().default(""),
});

export const clinicRangeLabel: Record<ClinicAnalyticsRange, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "12m": "Last 12 months",
};

export interface ClinicBucket {
  label: string;
  start: string;
  end: string;
}

/** Generates contiguous time buckets aligned to clinic range */
export function clinicBuckets(range: ClinicAnalyticsRange, now = new Date()): ClinicBucket[] {
  const out: ClinicBucket[] = [];
  const dayMs = 86_400_000;

  if (range === "today") {
    // 6 4-hour intervals for today
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    for (let h = 8; h <= 20; h += 3) {
      const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, 0, 0));
      const e = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h + 3, 0, 0));
      out.push({
        label: `${String(h).padStart(2, "0")}:00`,
        start: s.toISOString(),
        end: e.toISOString(),
      });
    }
    return out;
  }

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
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  for (let i = count - 1; i >= 0; i--) {
    const e = new Date(end.getTime() - i * size * dayMs);
    const s = new Date(e.getTime() - size * dayMs);
    out.push({
      label: s.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
      start: s.toISOString(),
      end: e.toISOString(),
    });
  }
  return out;
}

/** Computes change percentage between current period and previous period */
export function calculateComparison(current: number, previous: number | null): MetricComparison {
  if (previous === null || previous === undefined || isNaN(previous)) {
    return { current, previous: null, changePercentage: null, direction: "none" };
  }
  if (previous === 0) {
    if (current === 0) return { current, previous: 0, changePercentage: 0, direction: "neutral" };
    return { current, previous: 0, changePercentage: 100, direction: "increase" };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  const direction = pct > 0 ? "increase" : pct < 0 ? "decrease" : "neutral";
  return { current, previous, changePercentage: pct, direction };
}

/** Clinic Owner Planned Future Visualizations */
export const CLINIC_FUTURE_VISUALIZATIONS: FutureVisualizationDef[] = [
  {
    id: "noshow-risk-predictor",
    title: "Patient No-Show Risk & Cancellation Predictor",
    description: "Machine-learning assessment identifying appointments with high probability of missed attendance.",
    purpose: "Empowers the front desk to proactively send SMS/WhatsApp confirmations or optimize schedule buffering.",
    dataRequired: [
      "appointments (booking lead time, time of day)",
      "patients (historical cancellation & no-show counts)",
      "notifications (reminder delivery & interaction status)",
    ],
    aggregation: "Risk scoring model classification mapping appointments to Low, Moderate, or High no-show probability",
    role: "OWNER",
    status: "PLANNED",
    chartType: "scatter",
  },
  {
    id: "capacity-utilization-forecast",
    title: "Doctor Workload & Capacity Utilization Forecast",
    description: "Predictive model comparing projected appointment demand curve against scheduled doctor consultation hours.",
    purpose: "Highlights upcoming clinical bottlenecks, overtime stress, and underutilized consultation blocks 14 days ahead.",
    dataRequired: [
      "doctor_profiles (availability json, consultation fees)",
      "clinic_attendance (physician shift compliance)",
      "appointments (booking velocity per specialty)",
    ],
    aggregation: "Projected consultation hours divided by rostered clinical operating capacity per weekday",
    role: "OWNER",
    status: "PLANNED",
    chartType: "bar",
  },
  {
    id: "cash-inflow-forecast",
    title: "30-Day Revenue & Cash Inflow Forecast",
    description: "Cash flow projection forecasting expected collections from pending follow-ups and uncollected invoices.",
    purpose: "Gives clinic owners advance visibility into expected receipts and outstanding receivables aging.",
    dataRequired: [
      "invoices (amount_due, issued_at, status)",
      "consultations (follow_up_date)",
      "payments (historical velocity of settlement)",
    ],
    aggregation: "Probability-weighted receivables recovery curve combined with scheduled follow-up value modeling",
    role: "OWNER",
    status: "PLANNED",
    chartType: "area",
  },
];

export interface ClinicAnalyticsData {
  clinicId: string;
  clinicName: string;
  range: ClinicAnalyticsRange;
  timezone: string;
  currency: string;
  // Appointments
  appointments: {
    total: number;
    completed: number;
    scheduled: number;
    confirmed: number;
    cancelled: number;
    noShow: number;
    completionRate: number; // percentage (0-100)
    comparison: MetricComparison;
    trend: { label: string; count: number; completed: number }[];
    statusBreakdown: { status: string; count: number }[];
    typeBreakdown: { type: string; count: number }[];
  };
  // Revenue & Invoicing
  financials: {
    totalBilled: number;
    totalCollected: number;
    outstandingBalance: number;
    collectionRate: number; // percentage (0-100)
    comparisonBilled: MetricComparison;
    comparisonCollected: MetricComparison;
    trend: { label: string; billed: number; collected: number }[];
    invoiceStatusBreakdown: { status: string; count: number; amount: number }[];
    paymentMethodsBreakdown: { method: string; amount: number; count: number }[];
  };
  // Patients
  patients: {
    totalActive: number;
    newRegistrations: number;
    comparisonNew: MetricComparison;
    trend: { label: string; newPatients: number }[];
  };
  // Team & Consultations
  clinical: {
    consultationsTotal: number;
    consultationsCompleted: number;
    consultationsDraft: number;
    doctorAttendanceRate: number; // percentage (0-100)
    staffAttendanceRate: number; // percentage (0-100)
    doctorsPresentDays: number;
    doctorsAbsentDays: number;
    doctorsCount: number;
    staffCount: number;
  };
  // AI credits used by this clinic
  aiUsage: {
    totalCredits: number;
    features: { feature: string; credits: number }[];
  };
  // Operational exceptions / action items
  operationalAlerts: {
    id: string;
    type: "warning" | "info" | "neutral";
    title: string;
    description: string;
  }[];
  // Future-ready visualizations
  futureVisualizations: FutureVisualizationDef[];
}

/** Structured output formatter for future AI assistant integration */
export function exportClinicAnalyticsForAi(data: ClinicAnalyticsData): AnalyticsAiPayload {
  return {
    generatedAt: new Date().toISOString(),
    role: "OWNER",
    clinicId: data.clinicId,
    range: data.range,
    metrics: {
      totalAppointments: {
        label: "Total Appointments",
        value: data.appointments.total,
        isFactual: true,
      },
      appointmentCompletionRate: {
        label: "Appointment Completion Rate",
        value: `${data.appointments.completionRate}%`,
        isFactual: true,
      },
      cancelledAppointments: {
        label: "Cancelled Appointments",
        value: data.appointments.cancelled,
        isFactual: true,
      },
      totalBilled: {
        label: "Total Billed Amount",
        value: data.financials.totalBilled,
        unit: data.currency,
        isFactual: true,
      },
      totalCollected: {
        label: "Total Collected Amount",
        value: data.financials.totalCollected,
        unit: data.currency,
        isFactual: true,
      },
      collectionEfficiency: {
        label: "Collection Efficiency Rate",
        value: `${data.financials.collectionRate}%`,
        isFactual: true,
      },
      outstandingReceivables: {
        label: "Outstanding Accounts Receivable",
        value: data.financials.outstandingBalance,
        unit: data.currency,
        isFactual: true,
      },
      newPatientRegistrations: {
        label: "New Patients Registered",
        value: data.patients.newRegistrations,
        isFactual: true,
      },
      doctorAttendanceRate: {
        label: "Doctor Attendance Rate",
        value: `${data.clinical.doctorAttendanceRate}%`,
        isFactual: true,
      },
      aiCreditsUsed: {
        label: "Clinic AI Credits Used",
        value: data.aiUsage.totalCredits,
        isFactual: true,
      },
    },
    summaryText: `Operational report for ${data.clinicName} (${clinicRangeLabel[data.range]}): ${data.appointments.total} appointments with ${data.appointments.completionRate}% completion; ${data.currency} ${data.financials.totalCollected.toLocaleString("en-IN")} collected (${data.financials.collectionRate}% collection rate); ${data.patients.newRegistrations} new patients registered; doctor attendance at ${data.clinical.doctorAttendanceRate}%.`,
  };
}
