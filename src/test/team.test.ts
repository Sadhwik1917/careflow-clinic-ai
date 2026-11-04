import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { doctorFieldsSchema, doctorSearchExpression, inviteSchema, teamSearchTerm, invitationState, staffDisplayNameSchema } from "@/lib/team";
import {
  assertTeamOwner,
  assertTeamDoctor,
  assertTeamStaff,
  assertDoctorOrOwner,
  readDoctors,
  readDoctor,
  editDoctor,
  readDoctorSelf,
  editDoctorSelf,
  readStaff,
  readStaffSelf,
  editStaffDisplayName,
  readInvitations,
  inviteMember,
  cancelInvitation,
  setMemberStatus,
} from "@/lib/team.server";

const doctor = { id: "d1", clinic_id: "c1", user_id: "u1", specialization: "Cardiology", department: "OPD", qualification: "MD", experience_years: 8, license_number: "LIC-1", consultation_fee: 500, bio: null, availability: {}, status: "ACTIVE", created_at: "2026-10-22T00:00:00Z", updated_at: "2026-10-22T00:00:00Z" };
const staffMember = { id: "m1", clinic_id: "c1", user_id: "u2", role: "STAFF", status: "ACTIVE", joined_at: "2026-10-22T00:00:00Z", created_at: "2026-10-22T00:00:00Z", updated_at: "2026-10-22T00:00:00Z" };
const invitation = { id: "i1", clinic_id: "c1", email: "new@example.com", role: "DOCTOR", status: "PENDING", invited_by: "u0", expires_at: "2026-10-29T00:00:00Z", created_at: "2026-10-22T00:00:00Z" };

function fakeDb(options: { role?: string; active?: boolean; operational?: boolean; admin?: boolean; stale?: boolean; memberNotFound?: boolean; invNotFound?: boolean; duplicatePending?: boolean; rpcError?: boolean; profileNotFound?: boolean; profileActive?: boolean } = {}) {
  const calls: [string, unknown[]][] = [];
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let updatePayload: Record<string, unknown> | null = null;
    const result = (single: boolean) => {
      if (table === "profiles") {
        if (options.profileNotFound) return { data: null, error: null };
        return { data: { id: filters['id'] ?? "u1", platform_role: options.admin ? "PLATFORM_ADMIN" : "USER", display_name: "Asha Rao", avatar_url: null, status: options.profileActive === false ? "SUSPENDED" : "ACTIVE" }, error: null };
      }
      if (table === "clinics") {
        return { data: { id: "c1", name: "Careflow Clinic", display_name: "Careflow Health", city: "Hyderabad", state: "Telangana", phone: "+91 9999999999", email: "clinic@careflow.test", status: "ACTIVE" }, error: null };
      }
      if (table === "clinic_members" && single) {
        if (options.memberNotFound) return { data: null, error: null };
        if (filters['user_id']) {
          return { data: filters['clinic_id'] === "c1" ? { ...staffMember, user_id: String(filters['user_id']), role: options.role ?? "OWNER", status: options.active === false ? "SUSPENDED" : "ACTIVE" } : null, error: null };
        }
        return { data: filters['clinic_id'] === "c1" ? { ...staffMember, role: "STAFF", status: options.active === false ? "SUSPENDED" : "ACTIVE" } : null, error: null };
      }
      if (table === "doctor_profiles") {
        const isStale = Boolean(options.stale && filters['updated_at'] !== undefined);
        const found = filters['clinic_id'] === doctor.clinic_id && (!filters['id'] || filters['id'] === doctor.id) && (!filters['user_id'] || filters['user_id'] === doctor.user_id) && !isStale;
        const returnedDoctor = updatePayload ? { ...doctor, ...updatePayload } : doctor;
        return { data: found ? returnedDoctor : null, count: found ? 1 : 0, error: null };
      }
      if (table === "clinic_members") {
        if (options.memberNotFound) return { data: null, count: 0, error: null };
        return { data: staffMember, count: 1, error: null };
      }
      if (table === "clinic_invitations") {
        if (options.invNotFound) return { data: null, count: 0, error: null };
        if (options.duplicatePending) return { data: invitation, count: 1, error: null };
        return { data: filters['status'] === "PENDING" && !options.duplicatePending ? null : invitation, count: 1, error: null };
      }
      return { data: null, count: 0, error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "update", "insert", "order", "or", "eq", "in", "limit"]) chain[method] = (...args: unknown[]) => {
      calls.push([`${table}.${method}`, args]);
      if (method === "eq") filters[String(args[0])] = args[1];
      if (method === "update") updatePayload = (args[0] as Record<string, unknown>) ?? null;
      return chain;
    };

    chain['maybeSingle'] = async () => result(true);
    chain['single'] = async () => ({ data: { id: "new-inv-1" }, error: null });
    chain['range'] = async (...args: unknown[]) => { calls.push([`${table}.range`, args]); const r = result(false); return { ...r, data: r.data ? [r.data] : [] }; };
    chain['then'] = (resolve: (v: unknown) => unknown) => { const r = result(false); return Promise.resolve(resolve({ ...r, data: r.data ? [r.data] : [] })); };
    return chain;
  };
  const rpc = vi.fn(async (fn: string) => {
    if (fn === "clinic_member_names") {
      return { data: [{ user_id: "u1", display_name: "Asha Rao" }, { user_id: "u2", display_name: "Ravi Kumar" }], error: null };
    }
    if (fn === "clinic_is_operational") {
      return { data: options.operational !== false, error: null };
    }
    if (options.rpcError) {
      return { data: null, error: { code: "42883", message: "function does not exist" } };
    }
    return { data: true, error: null };
  });
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
  it("sanitizes search terms", () => { expect(teamSearchTerm('a%,b_(c)"')).toBe("abc"); });
});

describe("doctor profile field validation edge cases", () => {
  it("rejects non-numeric and fractional experience years with clear messages", () => {
    const nonNumeric = doctorFieldsSchema.safeParse({ specialization: "Cardiology", experience_years: "abc", status: "ACTIVE" });
    expect(nonNumeric.success).toBe(false);
    if (!nonNumeric.success) {
      expect(nonNumeric.error.issues[0]?.message).toMatch(/valid number/);
    }

    const fractional = doctorFieldsSchema.safeParse({ specialization: "Cardiology", experience_years: "3.5", status: "ACTIVE" });
    expect(fractional.success).toBe(false);
    if (!fractional.success) {
      expect(fractional.error.issues[0]?.message).toMatch(/whole years/);
    }
  });

  it("rejects non-numeric and negative consultation fee with clear messages", () => {
    const nonNumeric = doctorFieldsSchema.safeParse({ specialization: "Cardiology", experience_years: 5, consultation_fee: "bad", status: "ACTIVE" });
    expect(nonNumeric.success).toBe(false);
    if (!nonNumeric.success) {
      expect(nonNumeric.error.issues[0]?.message).toMatch(/valid consultation fee/);
    }

    const negative = doctorFieldsSchema.safeParse({ specialization: "Cardiology", experience_years: 5, consultation_fee: "-100", status: "ACTIVE" });
    expect(negative.success).toBe(false);
    if (!negative.success) {
      expect(negative.error.issues[0]?.message).toMatch(/cannot be negative/);
    }
  });

  it("parses valid positive fee and coerces empty or null to null", () => {
    const valid = doctorFieldsSchema.parse({ specialization: "Cardiology", experience_years: 5, consultation_fee: "750", status: "ACTIVE" });
    expect(valid.consultation_fee).toBe(750);

    const empty = doctorFieldsSchema.parse({ specialization: "Cardiology", experience_years: 5, consultation_fee: "", status: "ACTIVE" });
    expect(empty.consultation_fee).toBeNull();
  });
});

describe("doctor profile updates and audit logging", () => {
  it("records an audit log entry when callerUserId is provided", async () => {
    const fields = { specialization: "Cardiology", experience_years: 8, status: "ACTIVE" as const };
    const { db, calls } = fakeDb();
    await editDoctor(db, "c1", "d1", doctor.updated_at, fields, "u-owner-1");

    expect(calls).toContainEqual([
      "audit_logs.insert",
      [
        expect.objectContaining({
          clinic_id: "c1",
          user_id: "u-owner-1",
          action: "DOCTOR_PROFILE_UPDATED",
          entity_type: "DOCTOR_PROFILE",
          entity_id: "d1",
          metadata: { changed_fields: ["specialization", "experience_years", "status"] },
        }),
      ],
    ]);
  });
});

describe("invitation and member status lifecycle", () => {
  it("enforces clinic Gmail connection before sending invitations", async () => {
    const { db } = fakeDb({ rpcError: true });
    await expect(
      inviteMember(db, "c1", "newstaff@careflow.test", "STAFF", "u-owner-1")
    ).rejects.toThrow("Gmail not connected.");
  });

  it("allows owner to invite a member and records audit log when email delivery is handled", async () => {
    const { db, calls } = fakeDb({ rpcError: true });
    const res = await inviteMember(db, "c1", "newstaff@careflow.test", "STAFF", "u-owner-1", { skipEmailDelivery: true });
    expect(res.ok).toBe(true);

    expect(calls).toContainEqual([
      "clinic_invitations.insert",
      [
        expect.objectContaining({
          clinic_id: "c1",
          email: "newstaff@careflow.test",
          role: "STAFF",
          invited_by: "u-owner-1",
          status: "PENDING",
        }),
      ],
    ]);
    expect(calls).toContainEqual([
      "audit_logs.insert",
      [
        expect.objectContaining({
          clinic_id: "c1",
          user_id: "u-owner-1",
          action: "MEMBER_INVITED",
          entity_type: "CLINIC_INVITATION",
          metadata: { role: "STAFF" },
        }),
      ],
    ]);
  });

  it("prevents duplicate pending invitations for the same email", async () => {
    const { db } = fakeDb({ rpcError: true, duplicatePending: true });
    await expect(
      inviteMember(db, "c1", "new@example.com", "DOCTOR", "u-owner-1", { skipEmailDelivery: true })
    ).rejects.toThrow("A pending invitation already exists for this email.");
  });

  it("refuses non-owner to invite members", async () => {
    const { db } = fakeDb({ role: "STAFF" });
    await expect(
      inviteMember(db, "c1", "test@example.com", "STAFF", "u-staff-1")
    ).rejects.toThrow("Team management is unavailable for this clinic.");
  });

  it("allows owner to cancel a pending invitation and records audit log", async () => {
    const { db, calls } = fakeDb({ rpcError: true });
    const res = await cancelInvitation(db, "c1", "i1", "u-owner-1");
    expect(res.ok).toBe(true);

    expect(calls).toContainEqual(["clinic_invitations.update", [{ status: "CANCELLED" }]]);
    expect(calls).toContainEqual([
      "audit_logs.insert",
      [
        expect.objectContaining({
          clinic_id: "c1",
          user_id: "u-owner-1",
          action: "MEMBER_INVITATION_CANCELLED",
          entity_type: "CLINIC_INVITATION",
          entity_id: "i1",
          metadata: { role: "DOCTOR" },
        }),
      ],
    ]);
  });

  it("refuses to cancel non-existent or foreign invitations", async () => {
    const { db } = fakeDb({ rpcError: true, invNotFound: true });
    await expect(
      cancelInvitation(db, "c1", "foreign-inv", "u-owner-1")
    ).rejects.toThrow("Invitation not found.");
  });

  it("allows owner to suspend, reactivate, or remove a member and records audit log", async () => {
    const { db, calls } = fakeDb({ rpcError: true });
    const res = await setMemberStatus(db, "c1", "m1", "SUSPENDED", "u-owner-1");
    expect(res.ok).toBe(true);

    expect(calls).toContainEqual([
      "clinic_members.update",
      [
        expect.objectContaining({
          status: "SUSPENDED",
        }),
      ],
    ]);
    expect(calls).toContainEqual([
      "audit_logs.insert",
      [
        expect.objectContaining({
          clinic_id: "c1",
          user_id: "u-owner-1",
          action: "MEMBER_STATUS_CHANGED",
          entity_type: "CLINIC_MEMBER",
          entity_id: "m1",
          metadata: { from: "ACTIVE", to: "SUSPENDED" },
        }),
      ],
    ]);
  });

  it("prevents owners from modifying their own membership status", async () => {
    const { db } = fakeDb({ rpcError: true });
    // staffMember has user_id: "u2"
    await expect(
      setMemberStatus(db, "c1", "m1", "SUSPENDED", "u2")
    ).rejects.toThrow("You cannot change your own membership.");
  });

  it("refuses non-owner to change member status", async () => {
    const { db } = fakeDb({ role: "STAFF" });
    await expect(
      setMemberStatus(db, "c1", "m1", "SUSPENDED", "u-staff-1")
    ).rejects.toThrow("Team management is unavailable for this clinic.");
  });
});

describe("doctor and staff role authorization guards", () => {
  it("allows an active doctor in an operational clinic", async () => {
    const { db } = fakeDb({ role: "DOCTOR" });
    await expect(assertTeamDoctor(db, "u1", "c1")).resolves.toBeUndefined();
  });

  it.each(["OWNER", "STAFF", "PATIENT"])("refuses %s in doctor authorization guard", async role => {
    const { db } = fakeDb({ role });
    await expect(assertTeamDoctor(db, "u1", "c1")).rejects.toThrow("Doctor workspace is unavailable");
  });

  it("refuses doctor when membership is suspended or clinic is not operational", async () => {
    await expect(assertTeamDoctor(fakeDb({ role: "DOCTOR", active: false }).db, "u1", "c1")).rejects.toThrow("Doctor workspace is unavailable");
    await expect(assertTeamDoctor(fakeDb({ role: "DOCTOR", operational: false }).db, "u1", "c1")).rejects.toThrow("Doctor workspace is unavailable");
  });

  it("allows an active staff member in an operational clinic", async () => {
    const { db } = fakeDb({ role: "STAFF" });
    await expect(assertTeamStaff(db, "u2", "c1")).resolves.toBeUndefined();
  });

  it.each(["OWNER", "DOCTOR", "PATIENT"])("refuses %s in staff authorization guard", async role => {
    const { db } = fakeDb({ role });
    await expect(assertTeamStaff(db, "u2", "c1")).rejects.toThrow("Staff workspace is unavailable");
  });

  it("refuses staff when membership is suspended or clinic is not operational", async () => {
    await expect(assertTeamStaff(fakeDb({ role: "STAFF", active: false }).db, "u2", "c1")).rejects.toThrow("Staff workspace is unavailable");
    await expect(assertTeamStaff(fakeDb({ role: "STAFF", operational: false }).db, "u2", "c1")).rejects.toThrow("Staff workspace is unavailable");
  });

  it("allows clinic owner to access any doctor in the clinic", async () => {
    const { db } = fakeDb({ role: "OWNER" });
    await expect(assertDoctorOrOwner(db, "u-owner", "c1", "d1")).resolves.toBeUndefined();
  });

  it("allows doctor to access their own doctor profile", async () => {
    const { db } = fakeDb({ role: "DOCTOR" });
    await expect(assertDoctorOrOwner(db, "u1", "c1", "d1")).resolves.toBeUndefined();
  });

  it("refuses doctor accessing another doctor's profile", async () => {
    const { db } = fakeDb({ role: "DOCTOR" });
    // doctor d1 has user_id: "u1"; user "u-other-doc" should be refused
    await expect(assertDoctorOrOwner(db, "u-other-doc", "c1", "d1")).rejects.toThrow("unavailable");
  });

  it("refuses staff or patient accessing doctor profiles via doctorOrOwner", async () => {
    await expect(assertDoctorOrOwner(fakeDb({ role: "STAFF" }).db, "u2", "c1", "d1")).rejects.toThrow("unavailable");
  });
});

describe("doctor self-profile management", () => {
  it("reads own doctor profile with resolved display name", async () => {
    const { db } = fakeDb({ role: "DOCTOR" });
    const profile = await readDoctorSelf(db, "c1", "u1");
    expect(profile).not.toBeNull();
    expect(profile?.specialization).toBe("Cardiology");
    expect(profile?.display_name).toBe("Asha Rao");
  });

  it("refuses non-doctors from reading doctor self profile", async () => {
    const { db } = fakeDb({ role: "STAFF" });
    await expect(readDoctorSelf(db, "c1", "u2")).rejects.toThrow("Doctor workspace is unavailable");
  });

  it("edits own doctor profile, records audit log, and optionally updates display name", async () => {
    const { db, calls } = fakeDb({ role: "DOCTOR" });
    const fields = { specialization: "Interventional Cardiology", experience_years: 12, status: "ACTIVE" as const };
    const result = await editDoctorSelf(db, "c1", "u1", doctor.updated_at, fields, "Dr. Asha Rao-Dev");

    expect(result.specialization).toBe("Interventional Cardiology");
    expect(result.display_name).toBe("Dr. Asha Rao-Dev");

    expect(calls).toContainEqual([
      "audit_logs.insert",
      [
        expect.objectContaining({
          clinic_id: "c1",
          user_id: "u1",
          action: "DOCTOR_PROFILE_UPDATED",
          entity_type: "DOCTOR_PROFILE",
          entity_id: "d1",
        }),
      ],
    ]);
  });

  it("fails closed on doctor self update when profile is stale", async () => {
    const { db } = fakeDb({ role: "DOCTOR", stale: true });
    const fields = { specialization: "Neurology", experience_years: 10, status: "ACTIVE" as const };
    await expect(editDoctorSelf(db, "c1", "u1", doctor.updated_at, fields)).rejects.toThrow("Reload");
  });
});

describe("staff self-profile management", () => {
  it("reads staff self profile with membership and clinic details", async () => {
    const { db } = fakeDb({ role: "STAFF" });
    const data = await readStaffSelf(db, "c1", "u2");
    expect(data.member.role).toBe("STAFF");
    expect(data.profile.display_name).toBe("Asha Rao");
    expect(data.clinic?.name).toBe("Careflow Clinic");
  });

  it("refuses non-staff from reading staff self profile", async () => {
    const { db } = fakeDb({ role: "DOCTOR" });
    await expect(readStaffSelf(db, "c1", "u1")).rejects.toThrow("Staff workspace is unavailable");
  });

  it("allows staff to edit display name and records audit log", async () => {
    const { db, calls } = fakeDb({ role: "STAFF" });
    const result = await editStaffDisplayName(db, "c1", "u2", "Ravi Kumar Staff");
    expect(result.ok).toBe(true);
    expect(result.displayName).toBe("Ravi Kumar Staff");

    expect(calls).toContainEqual([
      "audit_logs.insert",
      [
        expect.objectContaining({
          clinic_id: "c1",
          user_id: "u2",
          action: "STAFF_PROFILE_UPDATED",
          entity_type: "CLINIC_MEMBER",
          entity_id: "u2",
          metadata: { changed_fields: ["display_name"] },
        }),
      ],
    ]);
  });

  it("rejects empty or whitespace display name in staffDisplayNameSchema", () => {
    expect(staffDisplayNameSchema.safeParse({ displayName: "" }).success).toBe(false);
    expect(staffDisplayNameSchema.safeParse({ displayName: "   " }).success).toBe(false);
    expect(staffDisplayNameSchema.safeParse({ displayName: "A".repeat(121) }).success).toBe(false);
    expect(staffDisplayNameSchema.safeParse({ displayName: "Valid Staff Name" }).success).toBe(true);
  });
});

