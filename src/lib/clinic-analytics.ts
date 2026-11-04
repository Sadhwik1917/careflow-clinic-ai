import { queryOptions } from "@tanstack/react-query";
import { getClinicAnalytics } from "./clinic-analytics.functions";
import type { ClinicAnalyticsRange } from "./clinic-analytics-rules";

export const clinicAnalyticsQuery = (
  clinicId: string,
  range: ClinicAnalyticsRange = "30d",
  doctorId = ""
) =>
  queryOptions({
    queryKey: ["clinic-analytics", clinicId, range, doctorId],
    queryFn: () => getClinicAnalytics({ data: { clinicId, range, doctorId } }),
    staleTime: 30_000,
    enabled: Boolean(clinicId),
  });
