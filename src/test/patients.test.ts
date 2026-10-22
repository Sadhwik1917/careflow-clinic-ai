import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { emptyPatientForm, patientFieldsSchema, registrationSchema, patientSearchExpression } from "@/lib/patients";
import { assertPatientOwner, readPatients, readPatient, insertPatient, editPatient } from "@/lib/patients.server";

const fields = { ...emptyPatientForm, patient_number: "P-0042", first_name: " Meera ", phone: "+91 98765-43210", email: " MEERA@EXAMPLE.COM " };
const row = { id: "p1", clinic_id: "c1", ...registrationSchema.parse(fields), user_id: null, status: "ACTIVE", created_at: "2026-10-22T00:00:00Z", updated_at: "2026-10-22T00:00:00Z" };
function fakeDb(options: { role?: string; active?: boolean; operational?: boolean; admin?: boolean; error?: { code: string }; stale?: boolean } = {}) {
  const calls: [string, unknown[]][] = [];
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const result = () => {
      if (table === "profiles") return { data: { platform_role: options.admin ? "PLATFORM_ADMIN" : "USER", status: "ACTIVE" }, error: null };
      if (table === "clinic_members") return { data: filters['clinic_id'] === "c1" ? { role: options.role ?? "OWNER", status: options.active === false ? "SUSPENDED" : "ACTIVE" } : null, error: null };
      if (options.error) return { data: null, error: options.error };
      const found = filters['clinic_id'] === row.clinic_id && (!filters['id'] || filters['id'] === row.id) && !options.stale;
      return { data: found ? row : null, count: found ? 1 : 0, error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "insert", "update", "order", "or", "eq"]) chain[method] = (...args: unknown[]) => { calls.push([`${table}.${method}`, args]); if (method === "eq") filters[String(args[0])] = args[1]; if (method === "insert") filters['clinic_id'] = (args[0] as { clinic_id: string }).clinic_id; return chain; };
    chain['maybeSingle'] = async () => result(); chain['single'] = async () => result();
    chain['range'] = async (...args: unknown[]) => { calls.push([`${table}.range`, args]); const r = result(); return { ...r, data: r.data ? [r.data] : [] }; };
    return chain;
  };
  const rpc = vi.fn(async () => ({ data: options.operational !== false, error: null }));
  return { db: { from, rpc } as unknown as SupabaseClient<Database>, calls, rpc };
}
describe("patient registration rules", () => {
  it("requires the schema's first name and patient number", () => {
    expect(registrationSchema.safeParse({ ...fields, first_name: " " }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...fields, patient_number: "" }).success).toBe(false);
  });
  it("normalizes contact fields and optional blanks", () => {
    expect(registrationSchema.parse(fields)).toMatchObject({ first_name: "Meera", phone: "+919876543210", email: "meera@example.com", last_name: null, date_of_birth: null });
  });
  it("rejects invalid contacts, invalid dates and future births", () => {
    for (const patch of [{ phone: "abc" }, { email: "bad" }, { date_of_birth: "2026-02-30" }, { date_of_birth: "2999-01-01" }]) expect(registrationSchema.safeParse({ ...fields, ...patch }).success).toBe(false);
  });
  it("rejects identifiers, account links, status and clinical fields in edits", () => {
    const { patient_number, ...editable } = fields;
    for (const patch of [{ patient_number }, { clinic_id: "c2" }, { user_id: "u2" }, { id: "p2" }, { status: "INACTIVE" }, { allergies: "unknown" }]) expect(patientFieldsSchema.safeParse({ ...editable, ...patch }).success).toBe(false);
  });
});
describe("patient owner authorization", () => {
  it("allows an active owner of an operational clinic", async () => { await expect(assertPatientOwner(fakeDb().db, "u", "c1")).resolves.toBeUndefined(); });
  it.each(["DOCTOR", "STAFF", "PATIENT"])("refuses %s on the owner workflow", async role => { await expect(assertPatientOwner(fakeDb({ role }).db, "u", "c1")).rejects.toThrow("access"); });
  it("refuses unrelated clinics, suspended members, non-operational clinics and platform admins", async () => {
    await expect(assertPatientOwner(fakeDb().db, "u", "c2")).rejects.toThrow("access");
    for (const o of [{ active: false }, { operational: false }, { admin: true }]) await expect(assertPatientOwner(fakeDb(o).db, "u", "c1")).rejects.toThrow("access");
  });
});
describe("scoped patient data", () => {
  it("lists real query results with exact count, clinic scope and pagination", async () => {
    const { db, calls } = fakeDb(); const r = await readPatients(db, "c1", { search: "Meera", page: 2 });
    expect(r.count).toBe(1); expect(r.rows[0]?.id).toBe("p1");
    expect(calls).toContainEqual(["patients.eq", ["clinic_id", "c1"]]);
    expect(calls).toContainEqual(["patients.range", [40, 59]]);
    expect(calls).toContainEqual(["patients.or", ["first_name.ilike.%Meera%,last_name.ilike.%Meera%,patient_number.ilike.%Meera%"]]);
  });
  it("searches name and number without filter injection", () => {
    expect(patientSearchExpression("P-0042")).toContain("patient_number.ilike.%P-0042%");
    expect(patientSearchExpression('a),clinic_id.eq.c2%"')).not.toMatch(/[()"\\]/);
    expect(patientSearchExpression("")).toBeUndefined();
  });
  it("returns only a matching patient's clinic profile", async () => {
    expect((await readPatient(fakeDb().db, "c1", "p1"))?.id).toBe("p1");
    expect(await readPatient(fakeDb().db, "c2", "p1")).toBeNull();
  });
  it("registration supplies verified clinic and no account link", async () => {
    const { db, calls } = fakeDb(); await insertPatient(db, "c1", fields);
    expect(calls).toContainEqual(["patients.insert", [{ ...registrationSchema.parse(fields), clinic_id: "c1", user_id: null, status: "ACTIVE" }]]);
  });
  it("maps the existing unique-constraint failure to a duplicate error", async () => { await expect(insertPatient(fakeDb({ error: { code: "23505" } }).db, "c1", fields)).rejects.toThrow("already registered"); });
  it("edits only permitted fields and requires clinic, id and version", async () => {
    const { patient_number, ...editable } = fields;
    const { db, calls } = fakeDb(); await editPatient(db, "c1", "p1", row.updated_at, editable);
    expect(calls).toContainEqual(["patients.update", [patientFieldsSchema.parse(editable)]]);
    for (const f of [["clinic_id", "c1"], ["id", "p1"], ["updated_at", row.updated_at]]) expect(calls).toContainEqual(["patients.eq", f]);
  });
  it("does not accept cross-clinic edits or overwrite stale profiles", async () => {
    const { patient_number, ...editable } = fields;
    await expect(editPatient(fakeDb().db, "c2", "p1", row.updated_at, editable)).rejects.toThrow("Reload");
    await expect(editPatient(fakeDb({ stale: true }).db, "c1", "p1", row.updated_at, editable)).rejects.toThrow("Reload");
  });
});