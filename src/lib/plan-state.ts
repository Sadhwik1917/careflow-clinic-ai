import { queryOptions } from "@tanstack/react-query";
import { getClinicPlanState } from "@/lib/subscriptions.functions";
import { supabase } from "@/integrations/supabase/client";
import { parseAllowance } from "@/lib/entitlements";

// Real subscription/trial state for the clinic; refetched after every plan action.
export const planStateQuery = (clinicId: string) => queryOptions({
  queryKey: ["plan-state", clinicId],
  queryFn: () => getClinicPlanState({ data: { clinicId } }),
  enabled: !!clinicId,
  staleTime: 15_000,
});

// Whether the clinic's effective plan includes AI (database check; failures count as "no").
export const clinicAiQuery = (clinicId: string) => queryOptions({
  queryKey: ["plan-state", clinicId, "ai"],
  queryFn: async () => { const { data, error } = await supabase.rpc("clinic_ai_enabled", { p_clinic: clinicId }); return !error && data === true; },
  enabled: !!clinicId,
  staleTime: 15_000,
});

export const clinicAllowanceQuery = queryOptions({
  queryKey: ["plan-state", "allowance"],
  queryFn: async () => { const { data, error } = await supabase.rpc("owner_clinic_allowance"); if (error) throw new Error("allowance"); return parseAllowance(data); },
  staleTime: 15_000,
});
