import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { PATIENT_PAGE_SIZE, patientFieldsSchema, registrationSchema, patientSearchExpression, type PatientFilters } from "./patients";
type Client = SupabaseClient<Database>;
const denied = () => new Error("Patient access is unavailable for this clinic.");
export async function assertPatientOwner(db: Client, userId: string, clinicId: string) {
  const [p, m, op] = await Promise.all([
    db.from("profiles").select("platform_role,status").eq("id", userId).maybeSingle(),
    db.from("clinic_members").select("role,status").eq("user_id", userId).eq("clinic_id", clinicId).maybeSingle(),
    db.rpc("clinic_is_operational", { p_clinic: clinicId }),
  ]);
  if (p.error || m.error || op.error || p.data?.status !== "ACTIVE" || p.data.platform_role !== "USER" || m.data?.role !== "OWNER" || m.data.status !== "ACTIVE" || op.data !== true) throw denied();
}
// Every read/write uses the authenticated caller's RLS client and an explicitly verified clinic.
export async function readPatients(db: Client, clinicId: string, filters: PatientFilters) {
  let q = db.from("patients").select("*", { count: "exact" }).eq("clinic_id", clinicId);
  // AND the name tokens, while each token may match first name, last name or number.
  for (const token of filters.search.trim().split(/\s+/).filter(Boolean)) {
    const expression = patientSearchExpression(token);
    if (expression) q = q.or(expression);
  }
  const { data, count, error } = await q.order("created_at", { ascending: false }).order("id").range(filters.page * PATIENT_PAGE_SIZE, (filters.page + 1) * PATIENT_PAGE_SIZE - 1);
  if (error) throw new Error("Patients couldn't load. Please try again.");
  return { rows: data ?? [], count: count ?? 0 };
}
export async function readPatient(db: Client, clinicId: string, patientId: string) {
  const { data, error } = await db.from("patients").select("*").eq("clinic_id", clinicId).eq("id", patientId).maybeSingle();
  if (error) throw new Error("Patient couldn't load. Please try again.");
  return data;
}
export async function insertPatient(db: Client, clinicId: string, input: unknown) {
  const fields = registrationSchema.parse(input);
  // The existing clinic+patient-number unique constraint is the authoritative duplicate guard,
  // including concurrent submissions. Phone/email are not unique (families may share contacts).
  const result = await db.from("patients").insert({ ...fields, clinic_id: clinicId, user_id: null, status: "ACTIVE" }).select("*").single();
  if (result.error?.code === "23505") throw new Error("This patient number is already registered in this clinic. Open the existing patient or use a different number.");
  if (result.error || !result.data) throw new Error("Patient wasn't registered. Please try again.");
  return result.data;
}
export async function editPatient(db: Client, clinicId: string, patientId: string, updatedAt: string, input: unknown) {
  const fields = patientFieldsSchema.parse(input);
  const { data, error } = await db.from("patients").update(fields).eq("clinic_id", clinicId).eq("id", patientId).eq("updated_at", updatedAt).select("*").maybeSingle();
  if (error) throw new Error("Patient changes weren't saved. Please try again.");
  if (!data) throw new Error("This patient changed or is no longer available. Reload the profile before editing.");
  return data;
}