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
 * Every AI feature runs through this. `userDb` is the caller's RLS client (entitlement check); `serverDb` is the
 * service-role client used only for the server-only reservation/settlement wrappers, acting as the verified `userId`.
 * Browsers cannot reserve or settle credits directly. Failures are never charged; reusing a requestId never charges twice.
 */
export async function meteredAi<T>(userDb: Rpc, serverDb: Rpc, userId: string, clinicId: string, feature: string, requestId: string, run: () => Promise<T>, sleep = (ms: number) => new Promise(r => setTimeout(r, ms))): Promise<T> {
  await assertClinicAi(userDb as never, clinicId);
  const { data, error } = await serverDb.rpc("ai_reserve_credit_as", { p_user: userId, p_clinic: clinicId, p_feature: feature, p_request: requestId });
  if (error) throw new Error("AI_NOT_INCLUDED");
  const r = (data ?? {}) as { allowed?: boolean; duplicate?: boolean; throttled?: boolean; reason?: string };
  if (r.duplicate) throw new Error("DUPLICATE_REQUEST");
  if (!r.allowed) throw new Error(r.reason === "LIMIT_REACHED" ? "AI_LIMIT_REACHED" : "AI_NOT_INCLUDED");
  if (r.throttled) await sleep(THROTTLE_DELAY_MS);
  let out: T;
  try {
    out = await run();
  } catch (e) {
    await serverDb.rpc("ai_finish_credit_as", { p_user: userId, p_request: requestId, p_success: false });
    throw e;
  }
  await serverDb.rpc("ai_finish_credit_as", { p_user: userId, p_request: requestId, p_success: true });
  return out;
}

const uuid = /^[0-9a-f-]{36}$/i;
export const getClinicAiAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { clinicId: string }) => { if (!uuid.test(i?.clinicId ?? "")) throw new Error("Invalid clinic"); return i; })
  .handler(async ({ data, context }) => {
    try { await assertClinicAi(context.supabase as never, data.clinicId); return { allowed: true }; }
    catch { return { allowed: false }; }
  });
