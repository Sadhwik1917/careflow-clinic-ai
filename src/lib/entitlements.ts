import type { Database } from "@/integrations/supabase/types";
import type { VerificationStatus } from "@/lib/verification";

type ClinicStatus = Database["public"]["Enums"]["clinic_status"];
export type AdminClinicAction = "SUSPEND" | "REVOKE" | "REINSTATE";

export const actionLabel: Record<AdminClinicAction, string> = { SUSPEND: "Suspend clinic", REVOKE: "Revoke approval", REINSTATE: "Lift suspension" };
export const actionHelp: Record<AdminClinicAction, string> = {
  SUSPEND: "Blocks all clinic access immediately. Records are kept and the suspension can be lifted later.",
  REVOKE: "Super rejection of an approved clinic: approval is withdrawn and the owner must go through verification again.",
  REINSTATE: "Lifts the suspension of an approved clinic. If the clinic has no active plan, the owner will be asked to choose one before using CAREFLOW.",
};

/** Client mirror of admin_clinic_action's rules; the database re-checks everything and authorises only platform admins. */
export function availableActions(verification: VerificationStatus | null, clinicStatus: ClinicStatus): AdminClinicAction[] {
  if (verification !== "APPROVED") return [];
  return clinicStatus === "SUSPENDED" ? ["REINSTATE", "REVOKE"] : ["SUSPEND", "REVOKE"];
}
export function actionProblem(action: AdminClinicAction, verification: VerificationStatus | null, clinicStatus: ClinicStatus, reason: string): string | null {
  if (!availableActions(verification, clinicStatus).includes(action)) return "This action isn't available for this clinic right now.";
  if (!reason.trim()) return "Enter a reason.";
  return null;
}

/** Plan entitlement fields are the source of truth, never plan names. */
export function planAllowsAi(plan: { ai_enabled: boolean } | null | undefined) { return plan?.ai_enabled === true; }
export function planAllowsMultiClinic(plan: { clinic_mode: string } | null | undefined, scope: string | null | undefined) {
  if (!plan) return false;
  return plan.clinic_mode === "MULTI" || (plan.clinic_mode === "SINGLE_OR_MULTI" && scope === "MULTI");
}
export type ClinicAllowance = { eligible: boolean; used: number; limit: number };
export function parseAllowance(v: unknown): ClinicAllowance {
  const o = (v ?? {}) as Partial<ClinicAllowance>;
  return { eligible: o.eligible === true, used: Number(o.used ?? 0), limit: Number(o.limit ?? 0) };
}

export function adminActionErrorMessage(message: string | undefined) {
  const m = message ?? "";
  if (/reason is required|already suspended|Only suspended|no active plan|Only approved|too long/i.test(m)) return m;
  if (/Not authorised|permission/i.test(m)) return "You don't have permission to do that.";
  return "Something went wrong. Nothing was changed — please try again.";
}
export function addClinicErrorMessage(message: string | undefined) {
  const m = message ?? "";
  if (/does not allow additional|limit reached|must be|Unknown clinic type/i.test(m)) return m;
  return "We couldn't add the clinic. Nothing was changed — please try again.";
}
