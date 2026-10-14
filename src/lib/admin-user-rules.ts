import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const userRoleFilters = ["PLATFORM_ADMIN", "OWNER", "DOCTOR", "STAFF", "PATIENT"] as const;
export const userFiltersSchema = z.object({
  search: z.string().trim().max(120).default(""),
  role: z.enum(["ALL", ...userRoleFilters]).default("ALL"),
  status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).default("ALL"),
  page: z.number().int().min(0).max(100000).default(0),
});
export type UserFilters = z.infer<typeof userFiltersSchema>;
export const USER_PAGE_SIZE = 20;

type Enums = Database["public"]["Enums"];
export type UserMembership = {
  id: string; role: Enums["member_role"]; status: Enums["member_status"]; joined_at: string | null;
  clinic: { id: string; name: string; display_name: string; clinic_code: string } | null;
};
export type AdminUserRow = {
  id: string; display_name: string | null; created_at: string; platform_role: Enums["platform_role"]; status: string;
  email: string | null; memberships: UserMembership[];
};

export const memberRoleLabel: Record<Enums["member_role"], string> = { OWNER: "Clinic owner", DOCTOR: "Doctor", STAFF: "Staff", PATIENT: "Patient" };
export const memberStatusLabel: Record<Enums["member_status"], string> = { ACTIVE: "Active", INVITED: "Invited", SUSPENDED: "Suspended", REMOVED: "Removed" };

/** Strip PostgREST filter grammar so user input can't alter the query. */
export const userSearchTerm = (value: string) => value.replace(/[,()%_*\\"'`:]/g, " ").replace(/\s+/g, " ").trim();

/** User category derived only from stored roles and active memberships. */
export function userCategory(row: Pick<AdminUserRow, "platform_role" | "memberships">): string {
  if (row.platform_role === "PLATFORM_ADMIN") return "Platform admin";
  const roles = [...new Set(row.memberships.filter(m => m.status === "ACTIVE").map(m => m.role))];
  return roles.length ? roles.map(r => memberRoleLabel[r]).join(", ") : "No clinic role";
}
