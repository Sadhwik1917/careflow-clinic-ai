import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  markDoctorAbsent,
  recordAttendance,
  readAttendanceForDate,
  readAttendanceAnalytics,
} from "@/lib/attendance.server";
import {
  markDoctorAbsentSchema,
  recordAttendanceSchema,
  attendanceAnalyticsSchema,
} from "@/lib/attendance";

const clinicId = "11111111-1111-4111-8111-111111111111";
const otherClinicId = "99999999-9999-4999-8999-999999999999";
const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const doctorUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const doctorProfileId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const staffUserId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const staffMemberId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const strangerUserId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

interface FakeDbOptions {
  callerRole?: "OWNER" | "DOCTOR" | "STAFF" | "STRANGER";
  operational?: boolean;
  active?: boolean;
  initialAttendance?: Array<{
    id: string;
    clinic_id: string;
    user_id: string;
    role: "DOCTOR" | "STAFF";
    date: string;
    status: "PRESENT" | "ABSENT";
    reason: string | null;
    recorded_by: string;
    created_at: string;
    updated_at: string;
  }>;
  existingAppointments?: Array<{
    id: string;
    clinic_id: string;
    doctor_profile_id: string;
    scheduled_start: string;
    status: string;
    patient: { id: string; first_name: string; last_name: string | null; patient_number: string; phone: string | null; gender: string | null };
  }>;
}

function makeFakeAttendanceDb(options: FakeDbOptions = {}) {
  const callerRole = options.callerRole ?? "OWNER";
  const operational = options.operational ?? true;
  const active = options.active ?? true;

  const attendanceRecords = [...(options.initialAttendance ?? [])];
  const auditLogs: Array<Record<string, unknown>> = [];
  const doctorAvailabilities: Record<string, any> = {
    [doctorProfileId]: { daily_overrides: {} },
  };

  const appointments = options.existingAppointments ?? [];

  const db = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "clinic_is_operational") {
        if (args["p_clinic"] === otherClinicId) return { data: false, error: null };
        return { data: operational, error: null };
      }
      if (fn === "clinic_member_names") {
        return {
          data: [
            { user_id: doctorUserId, display_name: "Dr. Aarthi Reddy" },
            { user_id: staffUserId, display_name: "Ramesh Kumar" },
          ],
          error: null,
        };
      }
      return { data: null, error: null };
    }),

    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      let gteDate: string | undefined;
      let lteDate: string | undefined;
      let inStatuses: string[] | undefined;
      let neqStatus: string | undefined;

      const builder: any = {
        select: vi.fn((_columns?: string, _opts?: any) => builder),
        eq: vi.fn((col: string, val: unknown) => {
          filters[col] = val;
          return builder;
        }),
        in: vi.fn((col: string, vals: string[]) => {
          if (col === "status") inStatuses = vals;
          return builder;
        }),
        neq: vi.fn((col: string, val: string) => {
          if (col === "status") neqStatus = val;
          return builder;
        }),
        gte: vi.fn((col: string, val: string) => {
          if (col === "date" || col === "scheduled_start") gteDate = val;
          return builder;
        }),
        lte: vi.fn((col: string, val: string) => {
          if (col === "date" || col === "scheduled_start") lteDate = val;
          return builder;
        }),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => {
          if (table === "profiles") {
            const uid = filters["id"];
            if (uid === strangerUserId) {
              return { data: null, error: null };
            }
            return {
              data: {
                id: uid,
                platform_role: "USER",
                status: active ? "ACTIVE" : "SUSPENDED",
              },
              error: null,
            };
          }

          if (table === "clinics") {
            return {
              data: {
                id: clinicId,
                timezone: "Asia/Kolkata",
                working_hours: { opening_time: "09:00", closing_time: "18:00" },
              },
              error: null,
            };
          }

          if (table === "clinic_members") {
            const uid = filters["user_id"];
            const cid = filters["clinic_id"];
            if (cid !== clinicId) return { data: null, error: null };

            if (uid === ownerId) {
              return { data: { role: callerRole, status: active ? "ACTIVE" : "SUSPENDED" }, error: null };
            }
            if (uid === doctorUserId) {
              return { data: { id: "doc-member", role: "DOCTOR", status: "ACTIVE" }, error: null };
            }
            if (uid === staffUserId) {
              return { data: { id: staffMemberId, role: "STAFF", status: "ACTIVE" }, error: null };
            }
            return { data: null, error: null };
          }

          if (table === "doctor_profiles") {
            const cid = filters["clinic_id"];
            const did = filters["id"];
            const uid = filters["user_id"];
            if (cid !== clinicId) return { data: null, error: null };
            if ((did && did === doctorProfileId) || (uid && uid === doctorUserId)) {
              return {
                data: {
                  id: doctorProfileId,
                  clinic_id: clinicId,
                  user_id: doctorUserId,
                  specialization: "General Physician",
                  status: "ACTIVE",
                  availability: doctorAvailabilities[doctorProfileId] || { daily_overrides: {} },
                },
                error: null,
              };
            }
            return { data: null, error: null };
          }

          if (table === "clinic_attendance") {
            const cid = filters["clinic_id"];
            const uid = filters["user_id"];
            const d = filters["date"];
            const found = attendanceRecords.find(
              (r) => r.clinic_id === cid && r.user_id === uid && r.date === d
            );
            return { data: found ? { ...found } : null, error: null };
          }

          return { data: null, error: null };
        }),

        single: vi.fn(async () => {
          return builder.maybeSingle();
        }),

        insert: vi.fn((payload: any) => {
          if (table === "clinic_attendance") {
            const id = "att-" + (attendanceRecords.length + 1);
            const newRow = {
              id,
              clinic_id: payload.clinic_id,
              user_id: payload.user_id,
              role: payload.role,
              date: payload.date,
              status: payload.status,
              reason: payload.reason ?? null,
              recorded_by: payload.recorded_by,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            attendanceRecords.push(newRow);
            return {
              select: () => ({
                single: async () => ({ data: { ...newRow }, error: null }),
              }),
            };
          }

          if (table === "audit_logs") {
            auditLogs.push(payload);
            return Promise.resolve({ data: payload, error: null });
          }

          return Promise.resolve({ data: null, error: null });
        }),

        update: vi.fn((payload: any) => {
          if (table === "clinic_attendance") {
            return {
              eq: (field: string, val: string) => {
                if (field === "id") {
                  const target = attendanceRecords.find((r) => r.id === val);
                  if (target) {
                    if (payload.status) target.status = payload.status;
                    if (payload.reason !== undefined) target.reason = payload.reason;
                    if (payload.recorded_by) target.recorded_by = payload.recorded_by;
                    target.updated_at = payload.updated_at || new Date().toISOString();
                  }
                  return {
                    select: () => ({
                      single: async () => ({ data: target ? { ...target } : null, error: null }),
                    }),
                  };
                }
                return builder;
              },
            };
          }

          if (table === "doctor_profiles") {
            return {
              eq: (_f1: string, _v1: string) => ({
                eq: (_f2: string, v2: string) => {
                  doctorAvailabilities[v2] = payload.availability;
                  return Promise.resolve({ error: null });
                },
              }),
            };
          }

          return Promise.resolve({ data: null, error: null });
        }),

        then: (resolve: any) => {
          if (table === "doctor_profiles") {
            const rows = [
              {
                id: doctorProfileId,
                clinic_id: clinicId,
                user_id: doctorUserId,
                specialization: "General Physician",
                status: "ACTIVE",
              },
            ];
            resolve({ data: rows, count: rows.length, error: null });
            return;
          }

          if (table === "clinic_members") {
            const rows = [
              {
                id: staffMemberId,
                clinic_id: clinicId,
                user_id: staffUserId,
                role: "STAFF",
                status: "ACTIVE",
              },
            ];
            resolve({ data: rows, count: rows.length, error: null });
            return;
          }

          if (table === "clinic_attendance") {
            let res = attendanceRecords.filter((r) => r.clinic_id === filters["clinic_id"]);
            if (filters["date"]) {
              res = res.filter((r) => r.date === filters["date"]);
            }
            if (gteDate) {
              res = res.filter((r) => r.date >= gteDate!);
            }
            if (lteDate) {
              res = res.filter((r) => r.date <= lteDate!);
            }
            resolve({ data: res, count: res.length, error: null });
            return;
          }

          if (table === "appointments") {
            let res = appointments.filter((a) => a.clinic_id === filters["clinic_id"]);
            if (filters["doctor_profile_id"]) {
              res = res.filter((a) => a.doctor_profile_id === filters["doctor_profile_id"]);
            }
            if (neqStatus) {
              res = res.filter((a) => a.status !== neqStatus);
            }
            resolve({ data: res, error: null });
            return;
          }

          resolve({ data: [], count: 0, error: null });
        },
      };

      return builder;
    },
  };

  return {
    db: db as unknown as SupabaseClient<Database>,
    attendanceRecords,
    auditLogs,
    doctorAvailabilities,
  };
}

describe("CAREFLOW AI — Attendance and Absence Management (Phase 1)", () => {
  describe("Zod Validation Schemas", () => {
    it("validates markDoctorAbsentSchema input correctly", () => {
      const valid = {
        clinicId,
        doctorProfileId,
        date: "2026-11-05",
        reason: "Emergency family leave",
      };
      expect(markDoctorAbsentSchema.parse(valid)).toEqual(valid);

      // Invalid date format
      expect(() =>
        markDoctorAbsentSchema.parse({ ...valid, date: "05-11-2026" })
      ).toThrow();

      // Empty/invalid UUID
      expect(() =>
        markDoctorAbsentSchema.parse({ ...valid, clinicId: "not-uuid" })
      ).toThrow();
    });

    it("validates recordAttendanceSchema input for doctors and staff", () => {
      const validDoc = {
        clinicId,
        userId: doctorUserId,
        role: "DOCTOR" as const,
        date: "2026-11-05",
        status: "PRESENT" as const,
      };
      expect(recordAttendanceSchema.parse(validDoc)).toMatchObject(validDoc);

      const validStaff = {
        clinicId,
        userId: staffUserId,
        role: "STAFF" as const,
        date: "2026-11-05",
        status: "ABSENT" as const,
        reason: "Unwell",
      };
      expect(recordAttendanceSchema.parse(validStaff)).toMatchObject(validStaff);
    });

    it("validates attendanceAnalyticsSchema range filters", () => {
      expect(attendanceAnalyticsSchema.parse({ clinicId, range: "today" })).toMatchObject({
        clinicId,
        range: "today",
      });
      expect(attendanceAnalyticsSchema.parse({ clinicId, range: "7d" })).toMatchObject({
        clinicId,
        range: "7d",
      });
      expect(attendanceAnalyticsSchema.parse({ clinicId, range: "30d" })).toMatchObject({
        clinicId,
        range: "30d",
      });
    });
  });

  describe("Owner Attendance Management (Requirement 1)", () => {
    it("allows a clinic owner to mark a doctor absent for a specific date without a prior leave request", async () => {
      const { db, attendanceRecords, auditLogs, doctorAvailabilities } = makeFakeAttendanceDb();

      const result = await markDoctorAbsent(db, ownerId, {
        clinicId,
        doctorProfileId,
        date: "2026-11-05",
        reason: "Emergency absence - doctor notified clinic by phone",
      });

      expect(result.record.status).toBe("ABSENT");
      expect(result.record.reason).toBe("Emergency absence - doctor notified clinic by phone");
      expect(result.record.role).toBe("DOCTOR");
      expect(result.isCorrection).toBe(false);

      // Verifies attendance is stored in database
      expect(attendanceRecords).toHaveLength(1);
      expect(attendanceRecords[0]!.user_id).toBe(doctorUserId);
      expect(attendanceRecords[0]!.date).toBe("2026-11-05");
      expect(attendanceRecords[0]!.status).toBe("ABSENT");

      // Verifies doctor availability override is set to BUSY to block new appointments
      expect(doctorAvailabilities[doctorProfileId]?.daily_overrides["2026-11-05"]).toBe("BUSY");

      // Verifies audit trail was recorded
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]!["action"]).toBe("DOCTOR_MARKED_ABSENT");
      expect(auditLogs[0]!["user_id"]).toBe(ownerId);
      expect(auditLogs[0]!["clinic_id"]).toBe(clinicId);
    });

    it("detects and reports affected appointments when marking a doctor absent", async () => {
      const { db } = makeFakeAttendanceDb({
        existingAppointments: [
          {
            id: "appt-1",
            clinic_id: clinicId,
            doctor_profile_id: doctorProfileId,
            scheduled_start: "2026-11-05T04:30:00.000Z",
            status: "CONFIRMED",
            patient: {
              id: "pat-1",
              first_name: "Sneha",
              last_name: "Sharma",
              patient_number: "P-101",
              phone: "9876543210",
              gender: "Female",
            },
          },
        ],
      });

      const result = await markDoctorAbsent(db, ownerId, {
        clinicId,
        doctorProfileId,
        date: "2026-11-05",
        reason: "Doctor did not show up",
      });

      expect(result.affectedAppointments).toHaveLength(1);
      expect(result.affectedAppointments[0]!.patient_name).toBe("Sneha Sharma");
    });

    it("prevents duplicate attendance records for the same person, clinic, and date (idempotent correction)", async () => {
      const initialRecord = {
        id: "att-existing-1",
        clinic_id: clinicId,
        user_id: doctorUserId,
        role: "DOCTOR" as const,
        date: "2026-11-05",
        status: "PRESENT" as const,
        reason: null,
        recorded_by: ownerId,
        created_at: "2026-11-05T04:00:00Z",
        updated_at: "2026-11-05T04:00:00Z",
      };

      const { db, attendanceRecords, auditLogs } = makeFakeAttendanceDb({
        initialAttendance: [initialRecord],
      });

      // Owner marks doctor absent for the same date that already had an attendance record
      const result = await markDoctorAbsent(db, ownerId, {
        clinicId,
        doctorProfileId,
        date: "2026-11-05",
        reason: "Doctor had to leave midday due to emergency",
      });

      // Must NOT create a second record; must update existing record
      expect(attendanceRecords).toHaveLength(1);
      expect(attendanceRecords[0]!.id).toBe("att-existing-1");
      expect(attendanceRecords[0]!.status).toBe("ABSENT");
      expect(result.isCorrection).toBe(true);

      // Audit log records correction
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]!["action"]).toBe("ATTENDANCE_CORRECTED");
    });

    it("allows correction of attendance from ABSENT back to PRESENT and restores availability", async () => {
      const absentRecord = {
        id: "att-existing-2",
        clinic_id: clinicId,
        user_id: doctorUserId,
        role: "DOCTOR" as const,
        date: "2026-11-05",
        status: "ABSENT" as const,
        reason: "Reported sick",
        recorded_by: ownerId,
        created_at: "2026-11-05T04:00:00Z",
        updated_at: "2026-11-05T04:00:00Z",
      };

      const { db, attendanceRecords, doctorAvailabilities, auditLogs } = makeFakeAttendanceDb({
        initialAttendance: [absentRecord],
      });
      doctorAvailabilities[doctorProfileId] = { daily_overrides: { "2026-11-05": "BUSY" } };

      // Owner corrects attendance to PRESENT
      const res = await recordAttendance(db, ownerId, {
        clinicId,
        userId: doctorUserId,
        role: "DOCTOR",
        date: "2026-11-05",
        status: "PRESENT",
        reason: "Doctor arrived and resumed duty",
      });

      expect(res.isCorrection).toBe(true);
      expect(res.record.status).toBe("PRESENT");
      expect(attendanceRecords[0]!.status).toBe("PRESENT");

      // Verifies doctor availability override is cleared
      expect(doctorAvailabilities[doctorProfileId]?.daily_overrides["2026-11-05"]).toBeUndefined();

      // Audit log confirms correction
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]!["action"]).toBe("ATTENDANCE_CORRECTED");
      expect((auditLogs[0]!["metadata"] as any).previous_status).toBe("ABSENT");
      expect((auditLogs[0]!["metadata"] as any).status).toBe("PRESENT");
    });

    it("allows owner to record and correct staff attendance", async () => {
      const { db, attendanceRecords, auditLogs } = makeFakeAttendanceDb();

      // Record staff present
      const res = await recordAttendance(db, ownerId, {
        clinicId,
        userId: staffUserId,
        role: "STAFF",
        date: "2026-11-05",
        status: "PRESENT",
      });

      expect(res.isCorrection).toBe(false);
      expect(res.record.status).toBe("PRESENT");
      expect(res.record.role).toBe("STAFF");
      expect(attendanceRecords).toHaveLength(1);

      // Correct staff to absent
      const corr = await recordAttendance(db, ownerId, {
        clinicId,
        userId: staffUserId,
        role: "STAFF",
        date: "2026-11-05",
        status: "ABSENT",
        reason: "Emergency leave",
      });

      expect(corr.isCorrection).toBe(true);
      expect(corr.record.status).toBe("ABSENT");
      expect(attendanceRecords).toHaveLength(1);
      expect(auditLogs).toHaveLength(2);
      expect(auditLogs[1]!["action"]).toBe("ATTENDANCE_CORRECTED");
    });
  });

  describe("Attendance Analytics (Requirement 2)", () => {
    it("reports honest attendance counts and does NOT auto-classify missing records as absent", async () => {
      // 1 doctor and 1 staff active in clinic.
      // Doctor has attendance record (PRESENT). Staff has NO attendance record.
      const { db } = makeFakeAttendanceDb({
        initialAttendance: [
          {
            id: "att-doc-1",
            clinic_id: clinicId,
            user_id: doctorUserId,
            role: "DOCTOR",
            date: "2026-11-05",
            status: "PRESENT",
            reason: null,
            recorded_by: ownerId,
            created_at: "2026-11-05T00:00:00Z",
            updated_at: "2026-11-05T00:00:00Z",
          },
        ],
      });

      const summary = await readAttendanceForDate(db, ownerId, clinicId, "2026-11-05");

      // Doctor counts
      expect(summary.doctors.total).toBe(1);
      expect(summary.doctors.present).toBe(1);
      expect(summary.doctors.absent).toBe(0);
      expect(summary.doctors.unrecorded).toBe(0);

      // Staff counts: Staff has NO record, so absent MUST be 0 and unrecorded MUST be 1!
      expect(summary.staff.total).toBe(1);
      expect(summary.staff.present).toBe(0);
      expect(summary.staff.absent).toBe(0); // CRITICAL: Missing record is NOT auto-classified as absent
      expect(summary.staff.unrecorded).toBe(1);

      expect(summary.staffRows[0]!.status).toBe("UNRECORDED");
      expect(summary.doctorRows[0]!.status).toBe("PRESENT");
    });

    it("aggregates date range analytics across 7 days with daily breakdown", async () => {
      const { db } = makeFakeAttendanceDb({
        initialAttendance: [
          {
            id: "att-1",
            clinic_id: clinicId,
            user_id: doctorUserId,
            role: "DOCTOR",
            date: "2026-10-30",
            status: "PRESENT",
            reason: null,
            recorded_by: ownerId,
            created_at: "2026-10-30T00:00:00Z",
            updated_at: "2026-10-30T00:00:00Z",
          },
          {
            id: "att-2",
            clinic_id: clinicId,
            user_id: doctorUserId,
            role: "DOCTOR",
            date: "2026-10-29",
            status: "ABSENT",
            reason: "Emergency leave",
            recorded_by: ownerId,
            created_at: "2026-10-29T00:00:00Z",
            updated_at: "2026-10-29T00:00:00Z",
          },
          {
            id: "att-3",
            clinic_id: clinicId,
            user_id: staffUserId,
            role: "STAFF",
            date: "2026-10-30",
            status: "PRESENT",
            reason: null,
            recorded_by: ownerId,
            created_at: "2026-10-30T00:00:00Z",
            updated_at: "2026-10-30T00:00:00Z",
          },
        ],
      });

      const analytics = await readAttendanceAnalytics(
        db,
        ownerId,
        clinicId,
        "7d",
        "2026-10-24",
        "2026-10-30"
      );

      expect(analytics.range).toBe("7d");
      expect(analytics.totalDays).toBe(7);
      expect(analytics.doctors.totalPresentCount).toBe(1);
      expect(analytics.doctors.totalAbsentCount).toBe(1);
      expect(analytics.staff.totalPresentCount).toBe(1);
      expect(analytics.staff.totalAbsentCount).toBe(0);

      // Verify daily breakdown exists for each day in range
      expect(analytics.dailyTrends).toHaveLength(7);
      const day29 = analytics.dailyTrends.find((t) => t.date === "2026-10-29");
      expect(day29?.doctorsAbsent).toBe(1);
      expect(day29?.doctorsPresent).toBe(0);

      const day30 = analytics.dailyTrends.find((t) => t.date === "2026-10-30");
      expect(day30?.doctorsPresent).toBe(1);
      expect(day30?.staffPresent).toBe(1);
    });
  });

  describe("Security, Isolation & RBAC (Requirement 3)", () => {
    it("denies non-owner (e.g. staff or doctor) from marking doctor absent", async () => {
      const { db } = makeFakeAttendanceDb({ callerRole: "STAFF" });

      await expect(
        markDoctorAbsent(db, staffUserId, {
          clinicId,
          doctorProfileId,
          date: "2026-11-05",
          reason: "Unauthorized attempt",
        })
      ).rejects.toThrow("unavailable");
    });

    it("denies marking attendance for another clinic (clinic boundary enforcement)", async () => {
      const { db } = makeFakeAttendanceDb();

      await expect(
        markDoctorAbsent(db, ownerId, {
          clinicId: otherClinicId,
          doctorProfileId,
          date: "2026-11-05",
          reason: "Cross-clinic attempt",
        })
      ).rejects.toThrow("unavailable");
    });

    it("denies access if clinic is suspended / non-operational", async () => {
      const { db } = makeFakeAttendanceDb({ operational: false });

      await expect(
        markDoctorAbsent(db, ownerId, {
          clinicId,
          doctorProfileId,
          date: "2026-11-05",
          reason: "Emergency leave",
        })
      ).rejects.toThrow("unavailable");
    });

    it("denies access if owner account is suspended", async () => {
      const { db } = makeFakeAttendanceDb({ active: false });

      await expect(
        markDoctorAbsent(db, ownerId, {
          clinicId,
          doctorProfileId,
          date: "2026-11-05",
          reason: "Emergency leave",
        })
      ).rejects.toThrow("unavailable");
    });

    it("denies stranger without clinic membership from viewing attendance", async () => {
      const { db } = makeFakeAttendanceDb();

      await expect(
        readAttendanceForDate(db, strangerUserId, clinicId, "2026-11-05")
      ).rejects.toThrow("unavailable");
    });
  });
});

