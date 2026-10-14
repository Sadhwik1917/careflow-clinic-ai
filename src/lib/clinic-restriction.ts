import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { VerificationStatus } from "@/lib/verification";

export type ClinicRestriction = { kind: "SUSPENDED" | "REVOKED"; reason: string | null } | null;
type Event = { event_type: string; reason: string | null; created_at: string };

/**
 * Pure: a clinic is restricted when an admin suspended it (clinics.status) or revoked its approval
 * (latest admin decision is REVOKED_AFTER_APPROVAL and the verification is still REJECTED).
 * The reason is the admin's own note from that event — never invented.
 */
export function restrictionFrom(clinicStatus: string | null | undefined, verification: VerificationStatus | null | undefined, events: Event[]): ClinicRestriction {
  const sorted = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const latest = (types: string[]) => sorted.find(e => types.includes(e.event_type));
  if (clinicStatus === "SUSPENDED") return { kind: "SUSPENDED", reason: latest(["SUSPENDED"])?.reason ?? null };
  const decision = latest(["APPROVED", "CHANGES_REQUESTED", "REJECTED", "REVOKED_AFTER_APPROVAL", "REINSTATED", "SUSPENDED"]);
  if (verification === "REJECTED" && decision?.event_type === "REVOKED_AFTER_APPROVAL") return { kind: "REVOKED", reason: decision.reason };
  return null;
}

/** Always reads the latest database state (RLS: owner or platform admin only). Failures throw, so the guard never fails open. */
export const clinicRestrictionQuery = (clinicId: string) => queryOptions({
  queryKey: ["clinic-restriction", clinicId],
  queryFn: async (): Promise<ClinicRestriction> => {
    const [c, v, e] = await Promise.all([
      supabase.from("clinics").select("status").eq("id", clinicId).maybeSingle(),
      supabase.from("clinic_verifications").select("status").eq("clinic_id", clinicId).maybeSingle(),
      supabase.from("verification_events").select("event_type, reason, created_at").eq("clinic_id", clinicId).in("event_type", ["APPROVED", "CHANGES_REQUESTED", "REJECTED", "REVOKED_AFTER_APPROVAL", "REINSTATED", "SUSPENDED"]).order("created_at", { ascending: false }).limit(20),
    ]);
    if (c.error || v.error || e.error) throw new Error("We couldn't check your clinic's status. Please try again.");
    return restrictionFrom(c.data?.status, v.data?.status ?? null, e.data ?? []);
  },
  enabled: !!clinicId,
  staleTime: 0,
  refetchOnWindowFocus: true,
});

/** One badge for the clinic's real state: Suspended / Revoked override the verification label. */
export function effectiveStatusBadge(clinicStatus: string | null | undefined, verification: VerificationStatus | null | undefined, events: Event[], labels: Record<VerificationStatus, string>, tones: Record<VerificationStatus, "success" | "warning" | "danger" | "neutral" | "info">) {
  const r = restrictionFrom(clinicStatus, verification, events);
  if (r?.kind === "SUSPENDED") return { label: "Suspended", tone: "danger" as const };
  if (r?.kind === "REVOKED") return { label: "Revoked", tone: "danger" as const };
  if (!verification) return { label: "Not submitted", tone: "neutral" as const };
  return { label: labels[verification], tone: tones[verification] };
}

/** The only owner page reachable while restricted (plus sign-out, which lives outside the area). */
export const RESTRICTED_ALLOWED_PATH = "/clinic/verification";
export function restrictionBlocks(pathname: string, r: ClinicRestriction) {
  return !!r && !(pathname === RESTRICTED_ALLOWED_PATH || pathname.startsWith(`${RESTRICTED_ALLOWED_PATH}/`));
}
