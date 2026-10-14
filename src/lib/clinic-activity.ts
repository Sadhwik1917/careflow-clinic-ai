import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { statusLabel, type VerificationStatus } from "@/lib/verification";

// Clinic history is built from existing records only. verification_events is the primary source
// (actor, reason, resulting status). admin_clinic_action also writes CLINIC_* rows to audit_logs for the
// same action, so those are skipped here to avoid showing each action twice.
export const DUPLICATE_AUDIT_ACTIONS = new Set(["CLINIC_SUSPEND", "CLINIC_REVOKE", "CLINIC_REINSTATE"]);
export const ACTIVITY_LIMIT = 50;

export type ClinicActivity = {
  id: string; source: "verification" | "audit"; label: string; actor: string | null;
  created_at: string; reason: string | null; result: string | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export const activityLabel: Record<string, string> = {
  SUBMITTED: "Verification submitted", APPROVED: "Verification approved", REJECTED: "Verification rejected",
  CHANGES_REQUESTED: "Changes requested", SUSPENDED: "Clinic suspended", REINSTATED: "Suspension lifted",
  REVOKED_AFTER_APPROVAL: "Approval revoked", CLINIC_ADDED: "Clinic added to plan", TRIAL_ACTIVATED: "Free trial started",
  SUBSCRIPTION_CANCELLED: "Subscription cancelled", CLINIC_SUSPEND: "Clinic suspended", CLINIC_REVOKE: "Approval revoked",
  CLINIC_REINSTATE: "Suspension lifted", REVERIFICATION_REQUESTED: "Reverification requested",
  DOCUMENT_UPDATE_SUBMITTED: "Document update submitted", DOCUMENT_UPDATE_ACCEPTED: "Document update accepted",
  DOCUMENT_UPDATE_NEEDS_REPLACEMENT: "Another document replacement requested",
};
export const labelFor = (code: string) => activityLabel[code] ?? code.toLowerCase().replace(/_/g, " ").replace(/^./, c => c.toUpperCase());

type VRow = { id: string; event_type: string; reason: string | null; to_status: VerificationStatus; created_at: string; actor: unknown };
type ARow = { id: string; action: string; created_at: string; metadata: unknown; actor: unknown };

export function mergeClinicActivity(ver: VRow[], audit: ARow[], limit = ACTIVITY_LIMIT): ClinicActivity[] {
  const name = (a: unknown) => one<{ display_name: string | null }>(a as any)?.display_name ?? null;
  const v: ClinicActivity[] = ver.map(e => ({
    id: `v-${e.id}`, source: "verification", label: labelFor(e.event_type), actor: name(e.actor), created_at: e.created_at,
    reason: e.reason, result: e.event_type === "SUSPENDED" ? "Suspended" : e.event_type === "REINSTATED" ? "Active" : statusLabel[e.to_status] ?? null,
  }));
  const a: ClinicActivity[] = audit.filter(r => !DUPLICATE_AUDIT_ACTIONS.has(r.action)).map(r => {
    const reason = (r.metadata as { reason?: unknown } | null)?.reason;
    return { id: `a-${r.id}`, source: "audit", label: labelFor(r.action), actor: name(r.actor), created_at: r.created_at, reason: typeof reason === "string" ? reason : null, result: null };
  });
  return [...v, ...a].sort((x, y) => y.created_at.localeCompare(x.created_at)).slice(0, limit);
}

export const clinicActivityQuery = (clinicId: string) => queryOptions({
  queryKey: ["admin-verifications", "clinic-activity", clinicId],
  queryFn: async () => {
    // Subscription events can be recorded without clinic_id; link them through subscription_clinics.
    const links = await supabase.from("subscription_clinics").select("subscription_id").eq("clinic_id", clinicId);
    if (links.error) throw new Error("We couldn't load activity.");
    const subIds = (links.data ?? []).map(l => l.subscription_id);
    const auditFilter = subIds.length ? `clinic_id.eq.${clinicId},and(entity_type.eq.clinic_subscription,entity_id.in.(${subIds.join(",")}))` : `clinic_id.eq.${clinicId}`;
    const [ver, audit] = await Promise.all([
      supabase.from("verification_events").select("id, event_type, reason, to_status, created_at, actor:profiles(display_name)")
        .eq("clinic_id", clinicId).order("created_at", { ascending: false }).limit(ACTIVITY_LIMIT),
      supabase.from("audit_logs").select("id, action, created_at, metadata, actor:profiles(display_name)")
        .or(auditFilter).order("created_at", { ascending: false }).limit(ACTIVITY_LIMIT),
    ]);
    if (ver.error || audit.error) throw new Error("We couldn't load activity.");
    return mergeClinicActivity((ver.data ?? []) as VRow[], (audit.data ?? []) as ARow[]);
  },
});
