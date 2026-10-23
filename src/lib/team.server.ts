import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { TEAM_PAGE_SIZE, doctorFieldsSchema, doctorSearchExpression, teamSearchTerm, type DoctorFilters, type StaffFilters } from "./team";

type Client = SupabaseClient<Database>;
const denied = () => new Error("Team management is unavailable for this clinic.");

/** Every request verifies an active OWNER membership and an operational clinic before any data access. */
export async function assertTeamOwner(db: Client, userId: string, clinicId: string) {
  const [p, m, op] = await Promise.all([
    db.from("profiles").select("platform_role,status").eq("id", userId).maybeSingle(),
    db.from("clinic_members").select("role,status").eq("user_id", userId).eq("clinic_id", clinicId).maybeSingle(),
    db.rpc("clinic_is_operational", { p_clinic: clinicId }),
  ]);
  if (p.error || m.error || op.error || p.data?.status !== "ACTIVE" || p.data.platform_role !== "USER" || m.data?.role !== "OWNER" || m.data.status !== "ACTIVE" || op.data !== true) throw denied();
}

/** Display names come only from the owner-gated trusted lookup; everything else stays on the caller's RLS client. */
async function readNameMap(db: Client, clinicId: string) {
  const { data, error } = await db.rpc("clinic_member_names", { p_clinic: clinicId });
  if (error) throw denied();
  return new Map((data ?? []).map(row => [row.user_id, row.display_name]));
}
const matchingIds = (names: Map<string, string | null>, term: string) =>
  [...names].filter(([, n]) => n?.toLowerCase().includes(term.toLowerCase())).map(([id]) => id);

export async function readDoctors(db: Client, clinicId: string, filters: DoctorFilters) {
  const names = await readNameMap(db, clinicId);
  let q = db.from("doctor_profiles").select("*", { count: "exact" }).eq("clinic_id", clinicId);
  if (filters.status !== "ALL") q = q.eq("status", filters.status);
  const term = teamSearchTerm(filters.search);
  if (term) {
    const ids = matchingIds(names, term);
    q = q.or(`${doctorSearchExpression(term)}${ids.length ? `,user_id.in.(${ids.join(",")})` : ""}`);
  }
  const { data, count, error } = await q.order("created_at", { ascending: false }).order("id").range(filters.page * TEAM_PAGE_SIZE, (filters.page + 1) * TEAM_PAGE_SIZE - 1);
  if (error) throw new Error("Doctors couldn't load. Please try again.");
  return { rows: (data ?? []).map(d => ({ ...d, display_name: names.get(d.user_id) ?? null })), count: count ?? 0 };
}

export async function readDoctor(db: Client, clinicId: string, doctorId: string) {
  const { data, error } = await db.from("doctor_profiles").select("*").eq("clinic_id", clinicId).eq("id", doctorId).maybeSingle();
  if (error) throw new Error("Doctor couldn't load. Please try again.");
  if (!data) return null;
  const names = await readNameMap(db, clinicId);
  return { ...data, display_name: names.get(data.user_id) ?? null };
}

export async function editDoctor(db: Client, clinicId: string, doctorId: string, updatedAt: string, input: unknown) {
  const fields = Object.fromEntries(Object.entries(doctorFieldsSchema.parse(input)).filter(([, v]) => v !== undefined));
  const { data, error } = await db.from("doctor_profiles").update(fields).eq("clinic_id", clinicId).eq("id", doctorId).eq("updated_at", updatedAt).select("*").maybeSingle();
  if (error) throw new Error("Doctor changes weren't saved. Please try again.");
  if (!data) throw new Error("This doctor profile changed or is no longer available. Reload the profile before editing.");
  return data;
}

export async function readStaff(db: Client, clinicId: string, filters: StaffFilters) {
  const names = await readNameMap(db, clinicId);
  const term = teamSearchTerm(filters.search);
  const ids = term ? matchingIds(names, term) : [];
  if (term && !ids.length) return { rows: [], count: 0 };
  let q = db.from("clinic_members").select("*", { count: "exact" }).eq("clinic_id", clinicId).eq("role", "STAFF");
  if (filters.status !== "ALL") q = q.eq("status", filters.status);
  if (term) q = q.in("user_id", ids);
  const { data, count, error } = await q.order("created_at", { ascending: false }).order("id").range(filters.page * TEAM_PAGE_SIZE, (filters.page + 1) * TEAM_PAGE_SIZE - 1);
  if (error) throw new Error("Staff couldn't load. Please try again.");
  return { rows: (data ?? []).map(m => ({ ...m, display_name: names.get(m.user_id) ?? null })), count: count ?? 0 };
}

export async function readInvitations(db: Client, clinicId: string) {
  const { data, error } = await db.from("clinic_invitations").select("*").eq("clinic_id", clinicId).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error("Invitations couldn't load. Please try again.");
  return data ?? [];
}
