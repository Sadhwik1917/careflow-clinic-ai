import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { doctorFieldsSchema, doctorSearchExpression, inviteSchema, teamSearchTerm, invitationState } from "@/lib/team";
import { assertTeamOwner, readDoctors, readDoctor, editDoctor, readStaff, readInvitations } from "@/lib/team.server";

const doctor = { id: "d1", clinic_id: "c1", user_id: "u1", specialization: "Cardiology", department: "OPD", qualification: "MD", experience_years: 8, license_number: "LIC-1", consultation_fee: 500, bio: null, availability: {}, status: "ACTIVE", created_at: "2026-10-22T00:00:00Z", updated_at: "2026-10-22T00:00:00Z" };
const staffMember = { id: "m1", clinic_id: "c1", user_id: "u2", role: "STAFF", status: "ACTIVE", joined_at: "2026-10-22T00:00:00Z", created_at: "2026-10-22T00:00:00Z", updated_at: "2026-10-22T00:00:00Z" };
const invitation = { id: "i1", clinic_id: "c1", email: "new@example.com", role: "DOCTOR", status: "PENDING", invited_by: "u0", expires_at: "2026-10-29T00:00:00Z", created_at: "2026-10-22T00:00:00Z" };

function fakeDb(options: { role?: string; active?: boolean; operational?: boolean; admin?: boolean; stale?: boolean } = {}) {
  const calls: [string, unknown[]][] = [];
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const result = (single: boolean) => {
      if (table === "profiles") return { data: { platform_role: options.admin ? "PLATFORM_ADMIN" : "USER", status: "ACTIVE" }, error: null };
      if (table === "clinic_members" && single) return { data: filters['clinic_id'] === "c1" ? { role: options.role ?? "OWNER", status: options.active === false ? "SUSPENDED" : "ACTIVE" } : null, error: null };
      if (table === "doctor_profiles") {
        const found = filters['clinic_id'] === doctor.clinic_id && (!filters['id'] || filters['id'] === doctor.id) && !options.stale;
        return { data: found ? doctor : null, count: found ? 1 : 0, error: null };
      }
      if (table === "clinic_members") return { data: staffMember, count: 1, error: null };
      return { data: invitation, count: 1, error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "update", "order", "or", "eq", "in", "limit"]) chain[method] = (...args: unknown[]) => { calls.push([`${table}.${method}`, args]); if (method === "eq") filters[String(args[0])] = args[1]; return chain; };
    chain['maybeSingle'] = async () => result(true);
    chain['range'] = async (...args: unknown[]) => { calls.push([`${table}.range`, args]); const r = result(false); return { ...r, data: r.data ? [r.data] : [] }; };
    chain['then'] = (resolve: (v: unknown) => unknown) => { const r = result(false); return Promise.resolve(resolve({ ...r, data: r.data ? [r.data] : [] })); };
    return chain;
  };
  const rpc = vi.fn(async (fn: string) => fn === "clinic_member_names"
    ? { data: [{ user_id: "u1", display_name: "Asha Rao" }, { user_id: "u2", display_name: "Ravi Kumar" }], error: null }
    : { data: options.operational !== false, error: null });
  return { db: { from, rpc } as unknown as SupabaseClient<Database>, calls, rpc };
}

describe("doctor profile rules", () => {
  it("requires a specialty and realistic numbers", () => {
    expect(doctorFieldsSchema.safeParse({ specialization: " ", experience_years: 5, status: "ACTIVE" }).success).toBe(false);
    expect(doctorFieldsSchema.safeParse({ specialization: "Cardiology", experience_years: -1, status: "ACTIVE" }).success).toBe(false);
    expect(doctorFieldsSchema.safeParse({ specialization: "Cardiology", experience_years: 500, status: "ACTIVE" }).success).toBe(false);
  });
  it("rejects identifiers, account links, clinic and availability in edits", () => {
    const base = { specialization: "Cardiology", experience_years: 5, status: "ACTIVE" };
    for (const patch of [{ id: "d2" }, { clinic_id: "c2" }, { user_id: "u9" }, { availability: {} }, { created_at: "x" }]) expect(doctorFieldsSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });
  it("normalizes blanks and an empty fee to null", () => {
    expect(doctorFieldsSchema.parse({ specialization: " Cardiology ", department: " ", experience_years: "8", consultation_fee: "", status: "ON_LEAVE" })).toMatchObject({ specialization: "Cardiology", department: null, experience_years: 8, consultation_fee: null });
  });
});

describe("invitation rules", () => {
  it("accepts only doctor or staff roles and valid emails", () => {
    expect(inviteSchema.parse({ email: " New@Example.COM ", role: "DOCTOR" })).toEqual({ email: "new@example.com", role: "DOCTOR" });
    expect(inviteSchema.safeParse({ email: "bad", role: "STAFF" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "a@b.co", role: "OWNER" }).success).toBe(false);
  });
});

describe("team owner authorization", () => {
  it("allows an active owner of an operational clinic", async () => { await expect(assertTeamOwner(fakeDb().db, "u", "c1")).resolves.toBeUndefined(); });
  it.each(["DOCTOR", "STAFF", "PATIENT"])("refuses %s on the team workflow", async role => { await expect(assertTeamOwner(fakeDb({ role }).db, "u", "c1")).rejects.toThrow("unavailable"); });
  it("refuses unrelated clinics, suspended members, non-operational clinics and platform admins", async () => {
    await expect(assertTeamOwner(fakeDb().db, "u", "c2")).rejects.toThrow("unavailable");
    for (const o of [{ active: false }, { operational: false }, { admin: true }]) await expect(assertTeamOwner(fakeDb(o).db, "u", "c1")).rejects.toThrow("unavailable");
  });
});

describe("scoped team data", () => {
  it("lists doctors with exact count, clinic scope, status filter and pagination", async () => {
    const { db, calls } = fakeDb(); const r = await readDoctors(db, "c1", { search: "", status: "ACTIVE", page: 2 });
    expect(r.count).toBe(1); expect(r.rows[0]?.display_name).toBe("Asha Rao");
    expect(calls).toContainEqual(["doctor_profiles.eq", ["clinic_id", "c1"]]);
    expect(calls).toContainEqual(["doctor_profiles.eq", ["status", "ACTIVE"]]);
    expect(calls).toContainEqual(["doctor_profiles.range", [40, 59]]);
  });
  it("searches specialty fields and member names without filter injection", async () => {
    expect(doctorSearchExpression('a),clinic_id.eq.c2%"')).not.toMatch(/[()"\\]/);
    expect(doctorSearchExpression("")).toBeUndefined();
    const { db, calls } = fakeDb(); await readDoctors(db, "c1", { search: "asha", status: "ALL", page: 0 });
    expect(calls).toContainEqual(["doctor_profiles.or", ["specialization.ilike.%asha%,department.ilike.%asha%,qualification.ilike.%asha%,user_id.in.(u1)"]]);
  });
  it("returns only a matching doctor's clinic profile", async () => {
    expect((await readDoctor(fakeDb().db, "c1", "d1"))?.display_name).toBe("Asha Rao");
    expect(await readDoctor(fakeDb().db, "c2", "d1")).toBeNull();
  });
  it("edits only permitted fields and requires clinic, id and version", async () => {
    const fields = { specialization: "Neurology", experience_years: 10, status: "ACTIVE" };
    const { db, calls } = fakeDb(); await editDoctor(db, "c1", "d1", doctor.updated_at, fields);
    expect(calls).toContainEqual(["doctor_profiles.update", [doctorFieldsSchema.parse(fields)]]);
    for (const f of [["clinic_id", "c1"], ["id", "d1"], ["updated_at", doctor.updated_at]]) expect(calls).toContainEqual(["doctor_profiles.eq", f]);
  });
  it("does not accept cross-clinic edits or overwrite stale profiles", async () => {
    const fields = { specialization: "Neurology", experience_years: 10, status: "ACTIVE" };
    await expect(editDoctor(fakeDb().db, "c2", "d1", doctor.updated_at, fields)).rejects.toThrow("Reload");
    await expect(editDoctor(fakeDb({ stale: true }).db, "c1", "d1", doctor.updated_at, fields)).rejects.toThrow("Reload");
  });
  it("lists staff scoped to the clinic and staff role, matching names only", async () => {
    const { db, calls } = fakeDb(); const r = await readStaff(db, "c1", { search: "ravi", status: "ALL", page: 0 });
    expect(r.rows[0]?.display_name).toBe("Ravi Kumar");
    expect(calls).toContainEqual(["clinic_members.eq", ["clinic_id", "c1"]]);
    expect(calls).toContainEqual(["clinic_members.eq", ["role", "STAFF"]]);
    expect(calls).toContainEqual(["clinic_members.in", ["user_id", ["u2"]]]);
  });
  it("returns no staff when the search matches no member name", async () => {
    const { db, calls } = fakeDb(); const r = await readStaff(db, "c1", { search: "nobody", status: "ALL", page: 0 });
    expect(r.rows).toEqual([]); expect(r.count).toBe(0);
    expect(calls.filter(([m]) => m.startsWith("clinic_members.select"))).toEqual([]);
  });
  it("lists invitations scoped to the clinic", async () => {
    const { db, calls } = fakeDb(); const rows = await readInvitations(db, "c1");
    expect(rows[0]?.email).toBe("new@example.com");
    expect(calls).toContainEqual(["clinic_invitations.eq", ["clinic_id", "c1"]]);
  });
});

describe("invitation display states", () => {
  it("labels pending, expired, accepted and cancelled invitations", () => {
    expect(invitationState({ status: "PENDING", expires_at: new Date(Date.now() + 86400000).toISOString() }).label).toBe("Pending");
    expect(invitationState({ status: "PENDING", expires_at: new Date(Date.now() - 1000).toISOString() }).label).toBe("Expired");
    expect(invitationState({ status: "ACCEPTED", expires_at: "" }).label).toBe("Accepted");
    expect(invitationState({ status: "CANCELLED", expires_at: "" }).label).toBe("Cancelled");
  });
  it("sanitizes search terms", () => { expect(teamSearchTerm('a%,b_(c)"')).toBe("ab(c)"); });
});
