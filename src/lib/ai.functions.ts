import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-side AI entitlement check. Every AI server function must call `assertClinicAi`
 * before doing any work; it asks the database (clinic_ai_enabled), so direct requests can't bypass the plan.
 */
export async function assertClinicAi(supabase: { rpc: (fn: "clinic_ai_enabled", args: { p_clinic: string }) => PromiseLike<{ data: boolean | null; error: unknown }> }, clinicId: string) {
  const { data, error } = await supabase.rpc("clinic_ai_enabled", { p_clinic: clinicId });
  if (error || data !== true) throw new Error("AI_NOT_INCLUDED");
}

const uuid = /^[0-9a-f-]{36}$/i;
export const getClinicAiAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { clinicId: string }) => { if (!uuid.test(i?.clinicId ?? "")) throw new Error("Invalid clinic"); return i; })
  .handler(async ({ data, context }) => {
    try { await assertClinicAi(context.supabase as never, data.clinicId); return { allowed: true }; }
    catch { return { allowed: false }; }
  });
