import { describe, it, expect, vi } from "vitest";
import { allBatches, assertSubscriptionAdmin, readAdminSubscriptions, readSubscriptionHistory } from "@/lib/admin-subscriptions.server";
import { historySchema, subscriptionFiltersSchema, searchTerm, trialLabel } from "@/lib/admin-subscription-rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function fakeClient(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "or", "ilike", "in", "order", "range", "limit"]) builder[method] = vi.fn(() => builder);
  builder['maybeSingle'] = vi.fn(async () => result);
  builder['then'] = (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return { client: { from: vi.fn(() => builder) } as unknown as SupabaseClient<Database>, builder };
}

describe("admin subscriptions", () => {
  it("validates filters and rejects unsupported statuses/pages", () => {
    expect(subscriptionFiltersSchema.parse({})).toEqual({ search: "", status: "ALL", type: "ALL", page: 0 });
    expect(() => subscriptionFiltersSchema.parse({ status: "APPROVED" })).toThrow();
    expect(() => subscriptionFiltersSchema.parse({ page: -1 })).toThrow();
    expect(() => historySchema.parse({ id: "bad", kind: "payments" })).toThrow();
  });
  it("sanitizes PostgREST search grammar without losing unicode clinic names", () => expect(searchTerm("Clinic,)(%_தமிழ்")).toBe("Clinic தமிழ்"));
  it.each(["USER", null])("denies non-admin %s", async role => {
    const { client } = fakeClient({ data: role ? { platform_role: role, status: "ACTIVE" } : null, error: null });
    await expect(assertSubscriptionAdmin(client, "caller")).rejects.toThrow("Platform admin");
  });
  it("denies inactive admins and lookup errors", async () => {
    for (const result of [{ data: { platform_role: "PLATFORM_ADMIN", status: "INACTIVE" }, error: null }, { data: null, error: new Error() }]) {
      await expect(assertSubscriptionAdmin(fakeClient(result).client, "caller")).rejects.toThrow();
    }
  });
  it("allows a real active platform-admin role result", async () => {
    await expect(assertSubscriptionAdmin(fakeClient({ data: { platform_role: "PLATFORM_ADMIN", status: "ACTIVE" }, error: null }).client, "caller")).resolves.toBeUndefined();
  });
  it("pages, filters, and projects only safe subscription fields", async () => {
    const { client, builder } = fakeClient({ data: [], count: 42, error: null });
    expect(await readAdminSubscriptions(client, { search: "", status: "ACTIVE", type: "PAID", page: 1 })).toEqual({ rows: [], count: 42 });
    expect(builder['range']).toHaveBeenCalledWith(20, 39);
    expect(builder['eq']).toHaveBeenCalledWith("status", "ACTIVE");
    expect(builder['eq']).toHaveBeenCalledWith("subscription_type", "PAID");
    expect(builder['limit']).toHaveBeenCalledWith(1, { referencedTable: "payments" });
    const calls = vi.mocked(client.from).mock.calls;
    expect(calls[0]?.[0]).toBe("clinic_subscriptions");
    const select = builder['select'] as ReturnType<typeof vi.fn>;
    expect(select.mock.calls[0]?.[0]).not.toMatch(/owner_user_id|payment_mandate_id|provider_subscription_id|razorpay/);
  });
  it("returns zero results for unmatched search without listing everything", async () => {
    const { client } = fakeClient({ data: [], error: null });
    expect(await readAdminSubscriptions(client, { search: "absent", status: "ALL", type: "ALL", page: 0 })).toEqual({ rows: [], count: 0 });
    expect(vi.mocked(client.from).mock.calls.map(c => c[0])).not.toContain("clinic_subscriptions");
  });
  it("loads payment and trial history through subscription-scoped paged reads", async () => {
    for (const kind of ["payments", "trials"] as const) {
      const { client, builder } = fakeClient({ data: [], count: 0, error: null });
      expect((await readSubscriptionHistory(client, { id: "sub", kind, page: 2 })).kind).toBe(kind);
      expect(builder['eq']).toHaveBeenCalledWith("subscription_id", "sub");
      expect(builder['range']).toHaveBeenCalledWith(40, 59);
    }
  });
  it("fails closed on query errors", async () => {
    const { client } = fakeClient({ data: null, error: new Error("private provider details") });
    await expect(readAdminSubscriptions(client, subscriptionFiltersSchema.parse({}))).rejects.toThrow("Subscriptions couldn't load");
    await expect(readSubscriptionHistory(client, { id: "sub", kind: "payments", page: 0 })).rejects.toThrow("Payment history couldn't load");
  });
  it("retrieves matches beyond the API default cap", async () => {
    const fetcher = vi.fn(async (start: number) => ({ data: Array.from({ length: start < 1000 ? 500 : 3 }, (_, i) => start + i), error: null }));
    expect(await allBatches(fetcher)).toHaveLength(1003);
    expect(fetcher).toHaveBeenLastCalledWith(1000, 1499);
  });
  it("does not label expired trials as running or mandate checkouts as active", () => {
    expect(trialLabel({ subscription_type: "TRIAL", status: "TRIAL_ACTIVE", trial_end_date: "2020-01-01" })).toBe("Expired");
    expect(trialLabel({ subscription_type: "TRIAL", status: "PENDING_PAYMENT", trial_end_date: null })).toBe("Awaiting mandate");
    expect(trialLabel({ subscription_type: "TRIAL", status: "ACTIVE", trial_end_date: null })).toBe("Converted to paid");
  });
});