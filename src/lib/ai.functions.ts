import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { THROTTLE_DELAY_MS } from "@/lib/ai-credits";

/**
 * Server-side AI entitlement check. Every AI server function must call `assertClinicAi`
 * before doing any work; it asks the database (clinic_ai_enabled), so direct requests can't bypass the plan.
 */
export async function assertClinicAi(supabase: { rpc: (fn: "clinic_ai_enabled", args: { p_clinic: string }) => PromiseLike<{ data: boolean | null; error: unknown }> }, clinicId: string) {
  const { data, error } = await supabase.rpc("clinic_ai_enabled", { p_clinic: clinicId });
  if (error || data !== true) throw new Error("AI_NOT_INCLUDED");
}

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

/**
 * Every AI feature runs through this: the database reserves 1 credit under a subscription lock (plan, trial expiry,
 * membership and limit all checked there), the work runs, then the reservation is settled. Failures are never charged;
 * reusing a requestId never charges twice. Max AI past its threshold is slowed, not blocked.
 */
export async function meteredAi<T>(supabase: Rpc, clinicId: string, feature: string, requestId: string, run: () => Promise<T>, sleep = (ms: number) => new Promise(r => setTimeout(r, ms))): Promise<T> {
  await assertClinicAi(supabase as never, clinicId);
  const { data, error } = await supabase.rpc("reserve_ai_credit", { p_clinic: clinicId, p_feature: feature, p_request: requestId });
  if (error) throw new Error("AI_NOT_INCLUDED");
  const r = (data ?? {}) as { allowed?: boolean; duplicate?: boolean; throttled?: boolean; reason?: string };
  if (r.duplicate) throw new Error("DUPLICATE_REQUEST");
  if (!r.allowed) throw new Error(r.reason === "LIMIT_REACHED" ? "AI_LIMIT_REACHED" : "AI_NOT_INCLUDED");
  if (r.throttled) await sleep(THROTTLE_DELAY_MS);
  try {
    const out = await run();
    await supabase.rpc("finish_ai_credit", { p_request: requestId, p_success: true });
    return out;
  } catch (e) {
    await supabase.rpc("finish_ai_credit", { p_request: requestId, p_success: false });
    throw e;
  }
}

const uuid = /^[0-9a-f-]{36}$/i;
export const getClinicAiAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { clinicId: string }) => { if (!uuid.test(i?.clinicId ?? "")) throw new Error("Invalid clinic"); return i; })
  .handler(async ({ data, context }) => {
    try { await assertClinicAi(context.supabase as never, data.clinicId); return { allowed: true }; }
    catch { return { allowed: false }; }
  });
