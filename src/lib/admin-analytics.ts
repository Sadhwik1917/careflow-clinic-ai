import { queryOptions } from "@tanstack/react-query";
import { getAdminAnalytics } from "./admin-analytics.functions";
import type { AnalyticsRange } from "./admin-analytics-rules";

export const adminAnalyticsQuery = (range: AnalyticsRange) => queryOptions({
  queryKey: ["admin-analytics", range], queryFn: () => getAdminAnalytics({ data: { range } }), staleTime: 30000,
});
