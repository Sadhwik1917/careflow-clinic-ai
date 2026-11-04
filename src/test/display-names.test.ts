import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  resolveClinicMemberNameMap,
  readNameMap,
  readDoctors,
  readDoctor,
  readStaff,
  acceptInvitation,
} from "@/lib/team.server";
import { readDoctorNameMap, readAppointments } from "@/lib/appointments.server";

type Client = SupabaseClient<Database>;

function createMockDb(options: {
  clinicId?: string;
  rpcResult?: { data: any; error: any };
  clinicMembers?: Array<{ user_id: string; clinic_id: string; role?: string; status?: string }>;
  doctorProfiles?: Array<{ id: string; user_id: string; clinic_id: string; specialization?: string; status?: string }>;
  profiles?: Array<{ id: string; display_name: string | null }>;
  appointments?: Array<any>;
} = {}) {
  const clinicId = options.clinicId || "clinic-1";
  const clinicMembers = options.clinicMembers || [
    { user_id: "user-doc-1", clinic_id: clinicId, role: "DOCTOR", status: "ACTIVE" },
    { user_id: "user-staff-1", clinic_id: clinicId, role: "STAFF", status: "ACTIVE" },
  ];
  const doctorProfiles = options.doctorProfiles || [
    { id: "doc-1", user_id: "user-doc-1", clinic_id: clinicId, specialization: "Cardiology", status: "ACTIVE" },
  ];
  const profiles = options.profiles || [
    { id: "user-doc-1", display_name: "Dr. Evelyn Reed" },
    { id: "user-staff-1", display_name: "James FrontDesk" },
  ];
  const appointments = options.appointments || [];

  const calls: Array<[string, unknown[]]> = [];

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push([`rpc.${fn}`, [args]]);
    if (fn === "clinic_member_names") {
      if (options.rpcResult !== undefined) {
        return options.rpcResult;
      }
      return {
        data: [
          { user_id: "user-doc-1", display_name: "Dr. Evelyn Reed" },
          { user_id: "user-staff-1", display_name: "James FrontDesk" },
        ],
        error: null,
      };
    }
    if (fn === "clinic_is_operational") {
      return { data: true, error: null };
    }
    return { data: true, error: null };
  });

  const from = (table: string) => {
    const filters: Record<string, any> = {};
    let selectedCols = "*";

    const chain: Record<string, any> = {
      select: vi.fn((cols = "*") => {
        selectedCols = cols;
        calls.push([`${table}.select`, [cols]]);
        return chain;
      }),
      eq: vi.fn((col: string, val: any) => {
        filters[col] = val;
        calls.push([`${table}.eq`, [col, val]]);
        return chain;
      }),
      in: vi.fn((col: string, vals: any[]) => {
        filters[`${col}_in`] = vals;
        calls.push([`${table}.in`, [col, vals]]);
        return chain;
      }),
      or: vi.fn((expr: string) => {
        calls.push([`${table}.or`, [expr]]);
        return chain;
      }),
      order: vi.fn(() => chain),
      range: vi.fn(async () => {
        calls.push([`${table}.range`, []]);
        if (table === "doctor_profiles") {
          return { data: doctorProfiles, count: doctorProfiles.length, error: null };
        }
        if (table === "clinic_members") {
          return { data: clinicMembers, count: clinicMembers.length, error: null };
        }
        if (table === "appointments") {
          return { data: appointments, count: appointments.length, error: null };
        }
        return { data: [], count: 0, error: null };
      }),
      maybeSingle: vi.fn(async () => {
        calls.push([`${table}.maybeSingle`, []]);
        if (table === "profiles") {
          const found = profiles.find((p) => p.id === filters["id"]);
          return { data: found ?? null, error: null };
        }
        if (table === "doctor_profiles") {
          const found = doctorProfiles.find((d) => d.id === filters["id"]);
          return { data: found ?? null, error: null };
        }
        if (table === "clinics") {
          return { data: { id: clinicId, timezone: "Asia/Kolkata", status: "ACTIVE" }, error: null };
        }
        return { data: null, error: null };
      }),
      single: vi.fn(async () => {
        calls.push([`${table}.single`, []]);
        return { data: null, error: null };
      }),
      update: vi.fn((payload: any) => {
        calls.push([`${table}.update`, [payload]]);
        return chain;
      }),
      insert: vi.fn((payload: any) => {
        calls.push([`${table}.insert`, [payload]]);
        return chain;
      }),
      then: (resolve: (val: any) => any) => {
        if (table === "profiles") {
          let rows = profiles;
          if (filters["id_in"]) {
            rows = profiles.filter((p) => filters["id_in"].includes(p.id));
          }
          return Promise.resolve(resolve({ data: rows, error: null }));
        }
        if (table === "clinic_members") {
          return Promise.resolve(resolve({ data: clinicMembers, error: null }));
        }
        if (table === "doctor_profiles") {
          return Promise.resolve(resolve({ data: doctorProfiles, error: null }));
        }
        return Promise.resolve(resolve({ data: [], error: null }));
      },
    };

    return chain;
  };

  return {
    db: { from, rpc } as unknown as Client,
    calls,
  };
}

describe("Doctor and Staff Display Name Resolution", () => {
  const clinicId = "clinic-1";

  describe("resolveClinicMemberNameMap shared resolver", () => {
    it("resolves names from clinic_member_names RPC when available", async () => {
      const { db } = createMockDb({
        rpcResult: {
          data: [
            { user_id: "u-doc-1", display_name: "Dr. Evelyn Reed" },
            { user_id: "u-staff-1", display_name: "James FrontDesk" },
          ],
          error: null,
        },
      });

      const map = await resolveClinicMemberNameMap(db, clinicId);
      expect(map.get("u-doc-1")).toBe("Dr. Evelyn Reed");
      expect(map.get("u-staff-1")).toBe("James FrontDesk");
    });

    it("falls back to profiles table lookup when RPC fails or is unavailable (e.g. non-owner caller)", async () => {
      const { db } = createMockDb({
        rpcResult: {
          data: null,
          error: { message: "Team management is unavailable for this clinic.", code: "42501" },
        },
        clinicMembers: [
          { user_id: "u-staff-1", clinic_id: clinicId },
        ],
        doctorProfiles: [
          { id: "d1", user_id: "u-doc-1", clinic_id: clinicId },
        ],
        profiles: [
          { id: "u-doc-1", display_name: "Dr. Fallback Specialist" },
          { id: "u-staff-1", display_name: "Sarah Fallback Staff" },
        ],
      });

      const map = await resolveClinicMemberNameMap(db, clinicId);
      expect(map.get("u-doc-1")).toBe("Dr. Fallback Specialist");
      expect(map.get("u-staff-1")).toBe("Sarah Fallback Staff");
    });

    it("handles targetUserIds explicitly and strictly scopes queries to clinic", async () => {
      const { db } = createMockDb({
        rpcResult: { data: [], error: null },
        profiles: [
          { id: "u-doc-2", display_name: "Dr. Specific Query" },
        ],
      });

      const map = await resolveClinicMemberNameMap(db, clinicId, ["u-doc-2"]);
      expect(map.get("u-doc-2")).toBe("Dr. Specific Query");
    });

    it("leaves missing or null profile display_name safe without throwing or fabricating fake names", async () => {
      const { db } = createMockDb({
        rpcResult: { data: [{ user_id: "u-no-name", display_name: null }], error: null },
        profiles: [{ id: "u-no-name", display_name: null }],
      });

      const map = await resolveClinicMemberNameMap(db, clinicId, ["u-no-name"]);
      expect(map.get("u-no-name")).toBeUndefined();
    });
  });

  describe("Doctor Views Name Resolution", () => {
    it("readDoctors maps doctor display names accurately for directory view", async () => {
      const { db } = createMockDb({
        doctorProfiles: [
          { id: "d-1", user_id: "user-doc-1", clinic_id: clinicId, specialization: "Cardiology", status: "ACTIVE" },
        ],
        profiles: [
          { id: "user-doc-1", display_name: "Dr. Evelyn Reed" },
        ],
      });

      const res = await readDoctors(db, clinicId, { search: "", status: "ACTIVE", page: 0 });
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]?.display_name).toBe("Dr. Evelyn Reed");
    });

    it("readDoctor returns single doctor with resolved display name", async () => {
      const { db } = createMockDb({
        doctorProfiles: [
          { id: "d-1", user_id: "user-doc-1", clinic_id: clinicId, specialization: "Cardiology", status: "ACTIVE" },
        ],
        profiles: [
          { id: "user-doc-1", display_name: "Dr. Evelyn Reed" },
        ],
      });

      const res = await readDoctor(db, clinicId, "d-1");
      expect(res).not.toBeNull();
      expect(res?.display_name).toBe("Dr. Evelyn Reed");
    });

    it("returns null display_name when doctor has genuinely no name in profile", async () => {
      const { db } = createMockDb({
        rpcResult: { data: [], error: null },
        doctorProfiles: [
          { id: "d-anon", user_id: "u-anon", clinic_id: clinicId, specialization: "Dermatology", status: "ACTIVE" },
        ],
        profiles: [
          { id: "u-anon", display_name: null },
        ],
      });

      const res = await readDoctor(db, clinicId, "d-anon");
      expect(res?.display_name).toBeNull();
    });
  });

  describe("Staff Roster Name Resolution", () => {
    it("readStaff maps staff display names accurately for roster view", async () => {
      const { db } = createMockDb({
        clinicMembers: [
          { user_id: "user-staff-1", clinic_id: clinicId, role: "STAFF", status: "ACTIVE" },
        ],
        profiles: [
          { id: "user-staff-1", display_name: "James FrontDesk" },
        ],
      });

      const res = await readStaff(db, clinicId, { search: "", status: "ACTIVE", page: 0 });
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]?.display_name).toBe("James FrontDesk");
    });

    it("readStaff returns null display_name if staff member has no name set", async () => {
      const { db } = createMockDb({
        rpcResult: { data: [], error: null },
        clinicMembers: [
          { user_id: "user-anon-staff", clinic_id: clinicId, role: "STAFF", status: "ACTIVE" },
        ],
        profiles: [
          { id: "user-anon-staff", display_name: null },
        ],
      });

      const res = await readStaff(db, clinicId, { search: "", status: "ACTIVE", page: 0 });
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]?.display_name).toBeNull();
    });
  });

  describe("Appointment & Queue Doctor Name Resolution", () => {
    it("readDoctorNameMap delegates to shared resolver and returns doctor names", async () => {
      const { db } = createMockDb({
        rpcResult: {
          data: [{ user_id: "user-doc-1", display_name: "Dr. Evelyn Reed" }],
          error: null,
        },
      });

      const map = await readDoctorNameMap(db, clinicId);
      expect(map.get("user-doc-1")).toBe("Dr. Evelyn Reed");
    });

    it("readAppointments attaches doctor display_name correctly from nameMap", async () => {
      const { db } = createMockDb({
        rpcResult: {
          data: [{ user_id: "user-doc-1", display_name: "Dr. Evelyn Reed" }],
          error: null,
        },
        appointments: [
          {
            id: "appt-1",
            clinic_id: clinicId,
            scheduled_start: "2026-10-28T10:00:00Z",
            doctor: {
              id: "doc-1",
              specialization: "Cardiology",
              user_id: "user-doc-1",
            },
            patient: {
              id: "p1",
              patient_number: "P-100",
              first_name: "John",
              last_name: "Doe",
            },
          },
        ],
      });

      const res = await readAppointments(db, clinicId, { search: "", status: "ALL", page: 0, date: "", doctor_id: "" });
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]?.doctor?.display_name).toBe("Dr. Evelyn Reed");
    });

    it("readAppointments falls back to Doctor when doctor has no name", async () => {
      const { db } = createMockDb({
        rpcResult: { data: [], error: null },
        profiles: [{ id: "user-doc-noname", display_name: null }],
        appointments: [
          {
            id: "appt-2",
            clinic_id: clinicId,
            scheduled_start: "2026-10-28T10:00:00Z",
            doctor: {
              id: "doc-2",
              specialization: "Pediatrics",
              user_id: "user-doc-noname",
            },
          },
        ],
      });

      const res = await readAppointments(db, clinicId, { search: "", status: "ALL", page: 0, date: "", doctor_id: "" });
      expect(res.rows[0]?.doctor?.display_name).toBe("Doctor");
    });
  });

  describe("Doctor and Staff Invitation Acceptance Name Persistence", () => {
    it("persists onboarding displayName to profiles when accepting invitation via RPC", async () => {
      const { db, calls } = createMockDb();
      // Mock accept_clinic_invitation RPC returning success
      (db.rpc as any).mockImplementation(async (fn: string) => {
        if (fn === "accept_clinic_invitation") {
          return { data: { success: true, clinic_id: clinicId, role: "DOCTOR" }, error: null };
        }
        return { data: true, error: null };
      });

      const res = await acceptInvitation(
        db,
        "new-doc-user-id",
        "doc@careflow.test",
        "00000000-0000-0000-0000-000000000001",
        {
          doctorProfile: {
            displayName: "Dr. Newly Joined",
            specialization: "Neurology",
            department: "Neuro",
            qualification: "MD",
            experience_years: 5,
            license_number: "LIC-1234",
            consultation_fee: 500,
            bio: null,
          },
        }
      );

      expect(res.ok).toBe(true);
      expect(calls).toContainEqual([
        "profiles.update",
        [{ display_name: "Dr. Newly Joined" }],
      ]);
    });
  });
});
