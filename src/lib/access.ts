import { queryOptions } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { AppRole } from "@/lib/navigation";
import { syncPatientAccountFn } from "./patient-registration.functions";

type MemberRole = Database["public"]["Enums"]["member_role"];

export type AccessProfile = { id: string; display_name: string | null; platform_role: Database["public"]["Enums"]["platform_role"]; status: string };
export type AccessMembership = {
  id: string;
  clinic_id: string;
  role: MemberRole;
  status: Database["public"]["Enums"]["member_status"];
  clinic: { id: string; name: string; display_name: string; status: Database["public"]["Enums"]["clinic_status"] } | null;
};
export type UserAccess = { userId: string; email: string | null; profile: AccessProfile | null; memberships: AccessMembership[] };

// Reads the signed-in user's own profile and memberships. RLS limits both queries to the caller's rows,
// so this is a navigation aid only; every data request is still authorized by the database.
export async function fetchUserAccess(userId: string, email: string | null): Promise<UserAccess> {
  // If email is available, synchronize any pending verified patient self-registrations
  if (email && typeof window !== "undefined") {
    try {
      await syncPatientAccountFn();
    } catch {
      // Ignore background sync errors; access queries still proceed cleanly
    }
  }

  const [profileResult, membershipResult] = await Promise.all([
    supabase.from("profiles").select("id, display_name, platform_role, status").eq("id", userId).maybeSingle(),
    supabase.from("clinic_members").select("id, clinic_id, role, status, clinic:clinics(id, name, display_name, status)").eq("user_id", userId),
  ]);
  if (profileResult.error) throw new Error("We couldn't load your profile. Please try again.");
  if (membershipResult.error) throw new Error("We couldn't load your clinic memberships. Please try again.");
  return { userId, email, profile: profileResult.data, memberships: (membershipResult.data ?? []) as AccessMembership[] };
}

export const accessQueryOptions = (userId: string, email: string | null) =>
  queryOptions({ queryKey: ["access", userId], queryFn: () => fetchUserAccess(userId, email), staleTime: 60_000 });

export const memberRoleForArea: Record<Exclude<AppRole, "PLATFORM_ADMIN">, MemberRole> = { OWNER: "OWNER", DOCTOR: "DOCTOR", STAFF: "STAFF", PATIENT: "PATIENT" };
export const dashboardForRole: Record<AppRole, string> = { PLATFORM_ADMIN: "/admin/dashboard", OWNER: "/clinic/dashboard", DOCTOR: "/doctor/dashboard", STAFF: "/staff/dashboard", PATIENT: "/patient/dashboard" };

export function activeMemberships(access: UserAccess) {
  return access.memberships.filter(m => m.status === "ACTIVE" && m.clinic !== null);
}
export function isPlatformAdmin(access: UserAccess) {
  return access.profile?.platform_role === "PLATFORM_ADMIN";
}

/** Every workspace the user can enter: platform admin plus one entry per active clinic membership. */
export type Workspace = { key: string; role: AppRole; clinicId: string | null; label: string };
export function availableWorkspaces(access: UserAccess): Workspace[] {
  const list: Workspace[] = [];
  if (isPlatformAdmin(access)) list.push({ key: "admin", role: "PLATFORM_ADMIN", clinicId: null, label: "Platform administration" });
  for (const m of activeMemberships(access)) list.push({ key: m.id, role: m.role, clinicId: m.clinic_id, label: m.clinic?.display_name || m.clinic?.name || "Clinic" });
  return list;
}

const CLINIC_KEY = "careflow.activeClinicId";
export function getSelectedClinicId(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(CLINIC_KEY);
}
export function setSelectedClinicId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.sessionStorage.setItem(CLINIC_KEY, id);
  else window.sessionStorage.removeItem(CLINIC_KEY);
}

export type AreaDecision =
  | { kind: "allow"; membership: AccessMembership | null }
  | { kind: "denied" }
  | { kind: "select"; options: AccessMembership[] };

/** Pure decision used by the area guards; the stored clinic id is only honoured if it matches a verified membership. */
export function decideAreaAccess(access: UserAccess, role: AppRole, selectedClinicId: string | null): AreaDecision {
  if (role === "PLATFORM_ADMIN") return isPlatformAdmin(access) ? { kind: "allow", membership: null } : { kind: "denied" };
  const options = activeMemberships(access).filter(m => m.role === memberRoleForArea[role]);
  if (options.length === 0) return { kind: "denied" };
  if (options.length === 1) return { kind: "allow", membership: options[0] ?? null };
  const selected = options.find(m => m.clinic_id === selectedClinicId);
  return selected ? { kind: "allow", membership: selected } : { kind: "select", options };
}

/** Only same-origin relative paths are accepted as post-login destinations. */
export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return undefined;
  if (/^\/(login|signup|forgot-password|reset-password)(\/|\?|$)/.test(value)) return undefined;
  return value;
}

export function redirectSearch(search: Record<string, unknown>): { redirect?: string | undefined } {
  return { redirect: safeRedirect(search["redirect"]) };
}

type GuardContext = { queryClient: import("@tanstack/react-query").QueryClient; user: { id: string; email?: string | null } };
export async function guardArea(role: AppRole, context: GuardContext, href: string) {
  const access = await context.queryClient.ensureQueryData(accessQueryOptions(context.user.id, context.user.email ?? null));
  const decision = decideAreaAccess(access, role, getSelectedClinicId());
  if (decision.kind === "denied") throw redirect({ to: "/workspace", search: { denied: role } });
  if (decision.kind === "select") throw redirect({ to: "/select-clinic", search: { role: role as Exclude<AppRole, "PLATFORM_ADMIN">, redirect: href } });
  if (decision.membership) setSelectedClinicId(decision.membership.clinic_id);
  return { access, area: role, membership: decision.membership };
}
