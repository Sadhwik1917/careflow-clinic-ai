import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { searchTerm, SUBSCRIPTION_PAGE_SIZE, type SubscriptionFilters, type SubscriptionRow } from "./admin-subscription-rules";

type Client = SupabaseClient<Database>;
const projection = "id,status,subscription_type,amount,currency,billing_cycle,start_date,renewal_date,next_billing_date,trial_start_date,trial_end_date,trial_cancelled_at,cancelled_at,auto_renew,clinic_scope,mandate_status,created_at,plan:plans(name),links:subscription_clinics(clinic:clinics(id,name,display_name,clinic_code)),payments:platform_payments(id,status,created_at,paid_at)" as const;

// Reads remain under the caller's RLS; this is not a service-role client.
export async function assertSubscriptionAdmin(client: Client, userId: string) {
  const { data, error } = await client.from("profiles").select("platform_role,status").eq("id", userId).maybeSingle();
  if (error || data?.platform_role !== "PLATFORM_ADMIN" || data.status !== "ACTIVE") throw new Error("Platform admin access is required.");
}

// Search matching IDs in batches, rather than silently truncating at the Data API's 1,000-row limit.
export async function allBatches<T>(fetchBatch: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const result = await fetchBatch(start, start + 499);
    if (result.error) throw new Error("Subscriptions couldn't load. Please try again.");
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}

export async function readAdminSubscriptions(client: Client, filters: SubscriptionFilters): Promise<{ rows: SubscriptionRow[]; count: number }> {
  const term = searchTerm(filters.search);
  let matches: string | undefined;
  if (term) {
    const [clinics, plans] = await Promise.all([
      allBatches((start, end) => client.from("clinics").select("id").or(`display_name.ilike.%${term}%,name.ilike.%${term}%,clinic_code.ilike.%${term}%`).order("id").range(start, end)),
      allBatches((start, end) => client.from("plans").select("id").ilike("name", `%${term}%`).order("id").range(start, end)),
    ]);
    const ids = new Set<string>();
    // Keep each URL bounded even when many clinics match.
    for (let i = 0; i < clinics.length; i += 100) {
      const links = await allBatches((start, end) => client.from("subscription_clinics").select("subscription_id").in("clinic_id", clinics.slice(i, i + 100).map(c => c.id)).order("id").range(start, end));
      links.forEach(l => ids.add(l.subscription_id));
    }
    const alternatives = [...(ids.size ? [`id.in.(${[...ids].join(",")})`] : []), ...(plans.length ? [`plan_id.in.(${plans.map(p => p.id).join(",")})`] : [])];
    // Exact subscription IDs are searchable as well, without interpolating arbitrary input.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term)) alternatives.push(`id.eq.${term}`);
    if (!alternatives.length) return { rows: [], count: 0 };
    matches = alternatives.join(",");
  }
  let query = client.from("clinic_subscriptions").select(projection, { count: "exact" });
  if (filters.status !== "ALL") query = query.eq("status", filters.status);
  if (filters.type !== "ALL") query = query.eq("subscription_type", filters.type);
  if (matches) query = query.or(matches);
  const result = await query.order("created_at", { ascending: false }).order("id", { ascending: false })
    .order("created_at", { referencedTable: "payments", ascending: false }).order("id", { referencedTable: "payments", ascending: false })
    .limit(1, { referencedTable: "payments" }).range(filters.page * SUBSCRIPTION_PAGE_SIZE, (filters.page + 1) * SUBSCRIPTION_PAGE_SIZE - 1);
  if (result.error) throw new Error("Subscriptions couldn't load. Please try again.");
  return { rows: result.data ?? [], count: result.count ?? 0 };
}

export async function readSubscriptionHistory(client: Client, input: { id: string; kind: "payments" | "trials"; page: number }) {
  const first = input.page * SUBSCRIPTION_PAGE_SIZE;
  if (input.kind === "payments") {
    const result = await client.from("platform_payments").select("id,amount,currency,status,paid_at,created_at,payment_method", { count: "exact" })
      .eq("subscription_id", input.id).order("created_at", { ascending: false }).order("id", { ascending: false }).range(first, first + SUBSCRIPTION_PAGE_SIZE - 1);
    if (result.error) throw new Error("Payment history couldn't load.");
    return { kind: "payments" as const, rows: result.data ?? [], count: result.count ?? 0 };
  }
  const result = await client.from("trial_events").select("id,event_type,event_date", { count: "exact" })
    .eq("subscription_id", input.id).order("event_date", { ascending: false }).order("id", { ascending: false }).range(first, first + SUBSCRIPTION_PAGE_SIZE - 1);
  if (result.error) throw new Error("Trial history couldn't load.");
  return { kind: "trials" as const, rows: result.data ?? [], count: result.count ?? 0 };
}