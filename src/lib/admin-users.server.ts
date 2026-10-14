import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { allBatches } from "./admin-subscriptions.server";
import { USER_PAGE_SIZE, userSearchTerm, type AdminUserRow, type UserFilters } from "./admin-user-rules";

type Client = SupabaseClient<Database>;
/** Only the email lookup is privileged; it runs after the caller is verified as an active platform admin. */
export type EmailDirectory = {
  emailsFor: (ids: string[]) => Promise<Map<string, string | null>>;
  idsMatching: (term: string) => Promise<string[]>;
};

const projection = "id,display_name,created_at,platform_role,status,memberships:clinic_members(id,role,status,joined_at,clinic:clinics(id,name,display_name,clinic_code))" as const;
const failed = () => new Error("Users couldn't load. Please try again.");

export async function readAdminUsers(client: Client, directory: EmailDirectory, filters: UserFilters): Promise<{ rows: AdminUserRow[]; count: number }> {
  const term = userSearchTerm(filters.search);
  let ids: string[] | undefined;
  if (term) {
    const [byName, byEmail] = await Promise.all([
      allBatches((s, e) => client.from("profiles").select("id").ilike("display_name", `%${term}%`).order("id").range(s, e)),
      directory.idsMatching(term),
    ]);
    ids = [...new Set([...byName.map(p => p.id), ...byEmail])];
    if (!ids.length) return { rows: [], count: 0 };
  }
  if (filters.role !== "ALL" && filters.role !== "PLATFORM_ADMIN") {
    const members = await allBatches((s, e) => client.from("clinic_members").select("user_id").eq("role", filters.role as Database["public"]["Enums"]["member_role"]).eq("status", "ACTIVE").order("id").range(s, e));
    const roleIds = new Set(members.map(m => m.user_id));
    ids = (ids ?? [...roleIds]).filter(id => roleIds.has(id));
    if (!ids.length) return { rows: [], count: 0 };
  }
  let query = client.from("profiles").select(projection, { count: "exact" });
  if (filters.role === "PLATFORM_ADMIN") query = query.eq("platform_role", "PLATFORM_ADMIN");
  if (filters.status === "ACTIVE") query = query.eq("status", "ACTIVE");
  if (filters.status === "INACTIVE") query = query.neq("status", "ACTIVE");
  if (ids) query = query.in("id", ids.slice(0, 1000));
  const result = await query.order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(filters.page * USER_PAGE_SIZE, (filters.page + 1) * USER_PAGE_SIZE - 1);
  if (result.error) throw failed();
  const profiles = result.data ?? [];
  const emails = await directory.emailsFor(profiles.map(p => p.id));
  return { rows: profiles.map(p => ({ ...p, email: emails.get(p.id) ?? null, memberships: p.memberships ?? [] })), count: result.count ?? 0 };
}

export async function serviceEmailDirectory(): Promise<EmailDirectory> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return {
    async emailsFor(ids) {
      const entries = await Promise.all(ids.map(async id => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(id);
        return [id, data.user?.email ?? null] as const;
      }));
      return new Map(entries);
    },
    async idsMatching(term) {
      const needle = term.toLowerCase();
      const matches: string[] = [];
      for (let page = 1; page <= 50; page++) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw failed();
        data.users.forEach(u => { if (u.email?.toLowerCase().includes(needle)) matches.push(u.id); });
        if (data.users.length < 1000) break;
      }
      return matches;
    },
  };
}
