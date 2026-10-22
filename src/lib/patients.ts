import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type Patient = Database["public"]["Tables"]["patients"]["Row"];
export const PATIENT_PAGE_SIZE = 20;
const optionalText = (max: number) => z.string().trim().max(max).transform(v => v || null);
const phone = z.string().trim().max(25).transform(v => v.replace(/[\s().-]/g, "")).refine(v => !v || /^\+?[0-9]{7,15}$/.test(v), "Enter a valid phone number (7–15 digits).").transform(v => v || null);
const dob = z.string().refine(v => {
  if (!v) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v && v <= new Date().toISOString().slice(0, 10);
}, "Enter a valid date of birth that is not in the future.").transform(v => v || null);
export const patientFieldsSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required.").max(100),
  last_name: optionalText(100), date_of_birth: dob, gender: optionalText(40), phone,
  email: z.string().trim().max(255).refine(v => !v || z.string().email().safeParse(v).success, "Enter a valid email address.").transform(v => v ? v.toLowerCase() : null),
  address: optionalText(1000), emergency_contact_name: optionalText(100), emergency_contact_phone: phone,
  notes: optionalText(5000),
}).strict();
export const registrationSchema = patientFieldsSchema.extend({ patient_number: z.string().trim().min(1, "Patient number is required.").max(100).regex(/^[\p{L}\p{N}_/-]+$/u, "Use letters, numbers, dashes, slashes or underscores.") }).strict();
export const patientFiltersSchema = z.object({ search: z.string().trim().max(100).catch("").default(""), page: z.coerce.number().int().min(0).max(100000).catch(0).default(0) });
export type PatientFilters = z.infer<typeof patientFiltersSchema>;
export type PatientFormValues = z.input<typeof registrationSchema>;
export const emptyPatientForm: PatientFormValues = { patient_number: "", first_name: "", last_name: "", date_of_birth: "", gender: "", phone: "", email: "", address: "", emergency_contact_name: "", emergency_contact_phone: "", notes: "" };
export const patientSearchTerm = (s: string) => s.replace(/[^\p{L}\p{N}\s_/-]/gu, "").trim().replace(/[_%]/g, "");
export function patientSearchExpression(search: string) {
  const term = patientSearchTerm(search);
  return term ? `first_name.ilike.%${term}%,last_name.ilike.%${term}%,patient_number.ilike.%${term}%` : undefined;
}
export function patientStatus(status: string) { return status === "ACTIVE" ? "Active" : status === "INACTIVE" ? "Inactive" : status.replace(/_/g, " "); }