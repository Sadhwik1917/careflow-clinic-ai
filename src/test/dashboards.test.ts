import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  listPatientAppointments,
  getPatientProfileSummary,
  listPatientInvoices,
} from "@/lib/clinical.server";
import {
  assertClinicMemberWithRoles,
  getCallerDoctorProfile,
  readAppointments,
} from "@/lib/appointments.server";

const clinicAId = "11111111-1111-4111-8111-111111111111";
const clinicBId = "22222222-2222-4222-8222-222222222222";
const doctorUserId = "33333333-3333-4333-8333-333333333333";
const doctorProfileId = "44444444-4444-4444-8444-444444444444";
const patientUserId = "55555555-5555-4555-8555-555555555555";
const patientRecordId = "66666666-6666-4666-8666-666666666666";
const otherPatientRecordId = "77777777-7777-4777-8777-777777777777";
const staffUserId = "88888888-8888-4888-8888-888888888888";
const ownerUserId = "99999999-9999-4999-8999-999999999999";

function createMockDb(options: {
  role?: "OWNER" | "DOCTOR" | "STAFF" | "USER";
  isOperational?: boolean;
  profileStatus?: string;
  memberStatus?: string;
  doctorProfile?: any;
  patientRecords?: any[];
  appointments?: any[];
  invoices?: any[];
}) {
  const role = options.role ?? "OWNER";
  const isOperational = options.isOperational ?? true;
  const profileStatus = options.profileStatus ?? "ACTIVE";
  const memberStatus = options.memberStatus ?? "ACTIVE";

  const db: any = {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((field: string, val: string) => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: val,
                  platform_role: "USER",
                  status: profileStatus,
                  display_name: "Mock User",
                  phone: "+919876543210",
                },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "clinic_members") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((f1: string, v1: string) => ({
              eq: vi.fn((f2: string, v2: string) => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    user_id: v1,
                    clinic_id: v2,
                    role,
                    status: memberStatus,
                  },
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      if (table === "doctor_profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_f1: string, _v1: string) => ({
              eq: vi.fn((_f2: string, _v2: string) => ({
                maybeSingle: vi.fn(async () => ({
                  data: options.doctorProfile ?? {
                    id: doctorProfileId,
                    clinic_id: clinicAId,
                    user_id: doctorUserId,
                    specialization: "Cardiology",
                    department: "Cardiovascular Care",
                    status: "ACTIVE",
                  },
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      if (table === "patients") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_field: string, val: string) => ({
              eq: vi.fn((_f2: string, _v2: string) => Promise.resolve({
                data: (options.patientRecords ?? [
                  {
                    id: patientRecordId,
                    clinic_id: clinicAId,
                    user_id: val,
                    patient_number: "P-1001",
                    first_name: "Jane",
                    last_name: "Doe",
                    phone: "+919876500000",
                    gender: "Female",
                    date_of_birth: "1990-01-01",
                  },
                ]),
                error: null,
              })),
              then: (resolve: any) =>
                resolve({
                  data: (options.patientRecords ?? [
                    {
                      id: patientRecordId,
                      clinic_id: clinicAId,
                      user_id: val,
                      patient_number: "P-1001",
                      first_name: "Jane",
                      last_name: "Doe",
                      phone: "+919876500000",
                      gender: "Female",
                      date_of_birth: "1990-01-01",
                    },
                  ]),
                  error: null,
                }),
            })),
          })),
        };
      }

      if (table === "appointments") {
        return {
          select: vi.fn(() => ({
            in: vi.fn((_field: string, ids: string[]) => ({
              order: vi.fn(() => Promise.resolve({
                data: (options.appointments ?? [
                  {
                    id: "appt-1",
                    clinic_id: clinicAId,
                    patient_id: patientRecordId,
                    doctor_profile_id: doctorProfileId,
                    scheduled_start: "2026-10-28T09:00:00Z",
                    scheduled_end: "2026-10-28T10:00:00Z",
                    appointment_type: "CONSULTATION",
                    status: "SCHEDULED",
                    clinic: { id: clinicAId, name: "CareFlow Clinic A", phone: "+919876543210", address: "123 Health Ave" },
                    doctor: { id: doctorProfileId, specialization: "Cardiology", department: "Cardio", user_id: doctorUserId },
                  },
                ]).filter((a: any) => ids.includes(a.patient_id)),
                error: null,
              })),
            })),
            eq: vi.fn((_f1: string, _v1: string) => ({
              order: vi.fn(() => ({
                order: vi.fn(() => ({
                  range: vi.fn(async () => ({
                    data: options.appointments ?? [],
                    count: options.appointments?.length ?? 0,
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        };
      }

      if (table === "invoices") {
        return {
          select: vi.fn(() => ({
            in: vi.fn((_field: string, ids: string[]) => ({
              order: vi.fn(() => Promise.resolve({
                data: (options.invoices ?? [
                  {
                    id: "inv-1",
                    clinic_id: clinicAId,
                    patient_id: patientRecordId,
                    invoice_number: "INV-2026-001",
                    status: "ISSUED",
                    total_amount: 500,
                    amount_paid: 0,
                    amount_due: 500,
                    issued_at: "2026-10-28T09:30:00Z",
                  },
                ]).filter((i: any) => ids.includes(i.patient_id)),
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "invoice_items") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        };
      }

      if (table === "payments") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        };
      }

      if (table === "clinics") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { timezone: "Asia/Kolkata", working_hours: null },
                error: null,
              })),
            })),
          })),
        };
      }

      return {};
    }),
    rpc: vi.fn((fnName: string) => {
      if (fnName === "clinic_is_operational") {
        return Promise.resolve({ data: isOperational, error: null });
      }
      if (fnName === "clinic_member_names") {
        return Promise.resolve({
          data: [{ user_id: doctorUserId, display_name: "Dr. Mock Cardiologist" }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  };

  return db as unknown as SupabaseClient<Database>;
}

describe("Dashboard Role Authorization & Data Scoping", () => {
  describe("Clinic Owner Dashboard", () => {
    it("permits OWNER to access clinic appointments with active operational clinic", async () => {
      const db = createMockDb({ role: "OWNER", isOperational: true });
      const member = await assertClinicMemberWithRoles(db, ownerUserId, clinicAId, ["OWNER", "STAFF", "DOCTOR"]);
      expect(member.role).toBe("OWNER");
    });

    it("rejects access if clinic is not operational (e.g. suspended)", async () => {
      const db = createMockDb({ role: "OWNER", isOperational: false });
      await expect(
        assertClinicMemberWithRoles(db, ownerUserId, clinicAId, ["OWNER"])
      ).rejects.toThrow("Clinic is not currently operational.");
    });
  });

  describe("Doctor Dashboard", () => {
    it("correctly identifies doctor profile for authorized DOCTOR caller", async () => {
      const db = createMockDb({ role: "DOCTOR" });
      const profile = await getCallerDoctorProfile(db, doctorUserId, clinicAId);
      expect(profile).not.toBeNull();
      expect(profile?.id).toBe(doctorProfileId);
      expect(profile?.specialization).toBe("Cardiology");
    });

    it("restricts DOCTOR-only roles from unauthorized staff access", async () => {
      const db = createMockDb({ role: "STAFF" });
      await expect(
        assertClinicMemberWithRoles(db, staffUserId, clinicAId, ["DOCTOR"])
      ).rejects.toThrow("Access is unavailable for this clinic.");
    });
  });

  describe("Receptionist (Staff) Dashboard", () => {
    it("allows STAFF to access appointments and queue management", async () => {
      const db = createMockDb({ role: "STAFF" });
      const member = await assertClinicMemberWithRoles(db, staffUserId, clinicAId, ["OWNER", "STAFF"]);
      expect(member.role).toBe("STAFF");
    });

    it("does not allow unauthorized patient users to access staff clinic queue", async () => {
      const db = createMockDb({ role: "USER" });
      await expect(
        assertClinicMemberWithRoles(db, patientUserId, clinicAId, ["OWNER", "STAFF"])
      ).rejects.toThrow("Access is unavailable for this clinic.");
    });
  });

  describe("Patient Dashboard", () => {
    it("retrieves only appointments linked to authenticated patient's user_id", async () => {
      const db = createMockDb({
        patientRecords: [
          { id: patientRecordId, clinic_id: clinicAId, user_id: patientUserId },
        ],
        appointments: [
          {
            id: "appt-1",
            clinic_id: clinicAId,
            patient_id: patientRecordId,
            doctor_profile_id: doctorProfileId,
            scheduled_start: "2026-10-28T09:00:00Z",
            scheduled_end: "2026-10-28T10:00:00Z",
            appointment_type: "CONSULTATION",
            status: "SCHEDULED",
            clinic: { id: clinicAId, name: "CareFlow Clinic A" },
            doctor: { id: doctorProfileId, specialization: "Cardiology", user_id: doctorUserId },
          },
          {
            id: "appt-other",
            clinic_id: clinicAId,
            patient_id: otherPatientRecordId, // other patient!
            doctor_profile_id: doctorProfileId,
            scheduled_start: "2026-10-28T11:00:00Z",
            scheduled_end: "2026-10-28T12:00:00Z",
            appointment_type: "CONSULTATION",
            status: "SCHEDULED",
          },
        ],
      });

      const appts = await listPatientAppointments(db, patientUserId);
      expect(appts).toHaveLength(1);
      expect(appts[0]!.id).toBe("appt-1");
      expect(appts[0]!.patient_id).toBe(patientRecordId);
      expect(appts[0]!.doctor?.display_name).toBe("Dr. Mock Cardiologist");
    });

    it("returns empty array when user has no linked patient records", async () => {
      const db = createMockDb({ patientRecords: [] });
      const appts = await listPatientAppointments(db, "unlinked-user-id");
      expect(appts).toEqual([]);
    });

    it("loads caller's patient profile summary securely", async () => {
      const db = createMockDb({
        patientRecords: [
          {
            id: patientRecordId,
            clinic_id: clinicAId,
            user_id: patientUserId,
            patient_number: "P-1001",
            first_name: "Jane",
            last_name: "Doe",
            phone: "+919876500000",
          },
        ],
      });

      const summary = await getPatientProfileSummary(db, patientUserId);
      expect(summary.profile.id).toBe(patientUserId);
      expect(summary.patientRecords).toHaveLength(1);
      expect(summary.patientRecords[0]!.patient_number).toBe("P-1001");
    });

    it("retrieves only invoices belonging to caller's patient records", async () => {
      const db = createMockDb({
        patientRecords: [
          { id: patientRecordId, clinic_id: clinicAId, user_id: patientUserId },
        ],
        invoices: [
          {
            id: "inv-mine",
            clinic_id: clinicAId,
            patient_id: patientRecordId,
            invoice_number: "INV-001",
            status: "ISSUED",
            total_amount: 500,
            amount_paid: 0,
            amount_due: 500,
          },
          {
            id: "inv-other",
            clinic_id: clinicAId,
            patient_id: otherPatientRecordId, // other patient!
            invoice_number: "INV-002",
            status: "ISSUED",
            total_amount: 1000,
            amount_paid: 1000,
            amount_due: 0,
          },
        ],
      });

      const invs = await listPatientInvoices(db, patientUserId);
      expect(invs).toHaveLength(1);
      expect(invs[0]!.id).toBe("inv-mine");
      expect(invs[0]!.patient_id).toBe(patientRecordId);
    });
  });
});
