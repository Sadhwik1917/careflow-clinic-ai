/**
 * CAREFLOW AI — Analytics Domain Types & Extensibility Interfaces
 *
 * Provides shared types for Platform Admin and Clinic Owner analytics:
 * - Metric values and comparison periods
 * - Future visualization specifications (with data connection contracts)
 * - Structured exports for future AI agent analysis (de-identified, factual)
 */

export type MetricValue = number | null;

export interface MetricComparison {
  current: number;
  previous: number | null;
  changePercentage: number | null;
  direction: "increase" | "decrease" | "neutral" | "none";
}

export interface FutureVisualizationDef {
  id: string;
  title: string;
  description: string;
  purpose: string;
  dataRequired: string[];
  aggregation: string;
  role: "PLATFORM_ADMIN" | "OWNER";
  status: "PLANNED" | "UNAVAILABLE";
  chartType: "area" | "bar" | "scatter" | "radial";
}

export const FUTURE_DATA_UNAVAILABLE_MESSAGE =
  "Data isn’t available yet. This insight may become available in a future update.";

/**
 * Structured output model designed for future AI assistants or agents to consume.
 * Strict rules:
 * 1. Contains only aggregated or de-identified metrics.
 * 2. Never contains patient identifiable information (PII) or secrets.
 * 3. Clearly distinguishes verified factual metrics from interpretations.
 */
export interface AnalyticsAiPayload {
  generatedAt: string;
  role: "PLATFORM_ADMIN" | "OWNER";
  clinicId?: string;
  range: string;
  metrics: Record<
    string,
    {
      label: string;
      value: number | string | null;
      unit?: string;
      isFactual: boolean;
      interpretation?: string;
    }
  >;
  summaryText: string;
}
