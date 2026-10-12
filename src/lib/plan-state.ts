import { queryOptions } from "@tanstack/react-query";
import { getClinicPlanState } from "@/lib/subscriptions.functions";

// Real subscription/trial state for the clinic; refetched after every plan action.
export const planStateQuery = (clinicId: string) => queryOptions({
  queryKey: ["plan-state", clinicId],
  queryFn: () => getClinicPlanState({ data: { clinicId } }),
  enabled: !!clinicId,
  staleTime: 15_000,
});
