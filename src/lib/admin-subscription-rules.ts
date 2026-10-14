import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const subscriptionStatuses = ["ACTIVE", "TRIAL_ACTIVE", "PAST_DUE", "PENDING_PAYMENT", "TRIAL_CANCELLED", "TRIAL_EXPIRED", "CANCELLED", "EXPIRED"] as const;
export const subscriptionFiltersSchema = z.object({
  search: z.string().trim().max(120).default(""),
  status: z.enum(["ALL", ...subscriptionStatuses]).default("ALL"),
  type: z.enum(["ALL", "PAID", "TRIAL"]).default("ALL"),
  page: z.number().int().min(0).max(100000).default(0),
});
export const historySchema = z.object({ id: z.string().uuid(), kind: z.enum(["payments", "trials"]), page: z.number().int().min(0).max(100000).default(0) });
export type SubscriptionFilters = z.infer<typeof subscriptionFiltersSchema>;
export const SUBSCRIPTION_PAGE_SIZE = 20;
export type SubscriptionRow = Pick<Database["public"]["Tables"]["clinic_subscriptions"]["Row"],
  "id" | "status" | "subscription_type" | "amount" | "currency" | "billing_cycle" | "start_date" | "renewal_date" | "next_billing_date" | "trial_start_date" | "trial_end_date" | "trial_cancelled_at" | "cancelled_at" | "auto_renew" | "clinic_scope" | "mandate_status" | "created_at"> & {
    plan: { name: string } | null;
    links: { clinic: { id: string; name: string; display_name: string; clinic_code: string } | null }[];
    payments: { id: string; status: Database["public"]["Enums"]["payment_status"]; created_at: string; paid_at: string | null }[];
  };
export type PaymentHistory = Pick<Database["public"]["Tables"]["platform_payments"]["Row"], "id" | "amount" | "currency" | "status" | "paid_at" | "created_at" | "payment_method">;
export type TrialHistory = Pick<Database["public"]["Tables"]["trial_events"]["Row"], "id" | "event_type" | "event_date">;
export function searchTerm(value: string) { return value.replace(/[^\p{L}\p{N}\s-]/gu, " ").trim().replace(/\s+/g, " "); }
export function dateLabel(value: string | null) { return value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"; }
export function moneyLabel(amount: number, currency: string) { return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount); }
export function trialLabel(row: Pick<SubscriptionRow, "subscription_type" | "status" | "trial_end_date">, now = Date.now()) {
  if (row.subscription_type !== "TRIAL") return "Not a trial";
  if (row.status === "PENDING_PAYMENT") return "Awaiting mandate";
  if (row.status === "TRIAL_CANCELLED") return "Cancelled";
  if (row.status === "ACTIVE") return "Converted to paid";
  if (row.status === "TRIAL_EXPIRED" || (row.status === "TRIAL_ACTIVE" && row.trial_end_date && Date.parse(row.trial_end_date) <= now)) return "Expired";
  if (row.status === "TRIAL_ACTIVE") return "Running";
  return "Ended";
}