import { queryOptions } from "@tanstack/react-query";
import { getAdminSubscriptions, getAdminSubscriptionHistory } from "./admin-subscriptions.functions";
import type { SubscriptionFilters } from "./admin-subscription-rules";

export const adminSubscriptionsQuery = (filters: SubscriptionFilters) => queryOptions({
  queryKey: ["admin-subscriptions", filters], queryFn: () => getAdminSubscriptions({ data: filters }), staleTime: 15000,
});
export const adminSubscriptionHistoryQuery = (id: string, kind: "payments" | "trials", page: number) => queryOptions({
  queryKey: ["admin-subscription-history", id, kind, page], queryFn: () => getAdminSubscriptionHistory({ data: { id, kind, page } }), staleTime: 15000,
});