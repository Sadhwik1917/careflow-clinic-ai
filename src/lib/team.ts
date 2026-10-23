import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type DoctorProfile = Database["public"]["Tables"]["doctor_profiles"]["Row"];
export type DoctorRow = DoctorProfile & { display_name: string | null };
export type MemberRow = Database["public"]["Tables"]["clinic_members"]["Row"] & { display_name: string | null };
export type InvitationRow = Database["public"]["Tables"]["clinic_invitations"]["Row"];

export const TEAM_PAGE_SIZE = 20;
const search = z.string().trim().max(100).catch("").default("");
const page = z.coerce.number().int().min(0).max(100000).catch(0).default(0);
export const doctorFiltersSchema = z.object({ search, status: z.enum(["ALL", "ACTIVE", "INACTIVE", "ON_LEAVE"]).catch("ALL").default("ALL"), page });
export const staffFiltersSchema = z.object({ search, status: z.enum(["ALL", "ACTIVE", "INVITED", "SUSPENDED", "REMOVED"]).catch("ALL").default("ALL"), page });
export type DoctorFilters = z.infer<typeof doctorFiltersSchema>;
export type StaffFilters = z.infer<typeof staffFiltersSchema>;

const optionalText = (max: number) => z.string().trim().max(max).transform(v => v || null).optional();
/** Owner-editable doctor profile fields; clinic, account link and timestamps stay immutable. */
export const doctorFieldsSchema = z.object({
  specialization: z.string().trim().min(1, "Specialty is required.").max(120),
  department: optionalText(120),
  qualification: optionalText(200),
  experience_years: z.coerce.number().int("Enter whole years.").min(0, "Experience cannot be negative.").max(70, "Enter a realistic number of years."),
  license_number: optionalText(80),
  consultation_fee: z.union([z.literal(""), z.coerce.number().min(0, "Fee cannot be negative.").max(1000000, "Enter a realistic fee.")]).transform(v => v === "" ? null : v).optional(),
  bio: optionalText(2000),
  status: z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE"]),
}).strict();
export type DoctorFormValues = z.input<typeof doctorFieldsSchema>;

export const inviteSchema = z.object({
  email: z.string().trim().max(255).refine(v => z.string().email().safeParse(v).success, "Enter a valid email address.").transform(v => v.toLowerCase()),
  role: z.enum(["DOCTOR", "STAFF"]),
}).strict();

export const teamSearchTerm = (s: string) => s.replace(/[^\p{L}\p{N}\s_/-]/gu, "").trim().replace(/[_%]/g, "");
export function doctorSearchExpression(search: string) {
  const term = teamSearchTerm(search);
  return term ? `specialization.ilike.%${term}%,department.ilike.%${term}%,qualification.ilike.%${term}%` : undefined;
}

export const doctorStatusLabel: Record<Database["public"]["Enums"]["doctor_status"], string> = { ACTIVE: "Active", INACTIVE: "Inactive", ON_LEAVE: "On leave" };
export function invitationState(inv: Pick<InvitationRow, "status" | "expires_at">): { label: string; tone: "success" | "warning" | "info" | "neutral" } {
  if (inv.status === "PENDING") return new Date(inv.expires_at).getTime() <= Date.now() ? { label: "Expired", tone: "warning" } : { label: "Pending", tone: "info" };
  if (inv.status === "ACCEPTED") return { label: "Accepted", tone: "success" };
  if (inv.status === "CANCELLED") return { label: "Cancelled", tone: "neutral" };
  return { label: "Expired", tone: "warning" };
}
