import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  calculateDoctorSlots,
  findAlternativeSlots,
  formatQueueNumber,
  isValidQueueTransition,
  createAppointmentSchema,
  getClinicLocalDate,
  formatTime12h,
  formatSlotLabel12h,
  clinicLocalToUtc,
  getClinicDayUtcRange,
  DOCTOR_SLOT_CAPACITY,
  getAppointmentRescheduleInfo,
  type DoctorAvailabilityConfig,
  type ClinicWorkingHoursConfig,
} from "@/lib/appointments";
import {
  assertClinicMemberWithRoles,
  readAppointments,
  readAppointment,
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
  checkInPatient,
  transitionQueueEntry,
  callNextPatient,
  consultActivePatient,
  updateClinicWorkingHours,
  setClinicDateOpenStatus,
  setDoctorDailyAvailability,
  requestDoctorLeave,
  reviewDoctorLeave,
} from "@/lib/appointments.server";

const clinicId = "11111111-1111-4111-8111-111111111111";
const doctorId = "22222222-2222-4222-8222-222222222222";
const doctorBId = "22222222-2222-4222-8222-333333333333";
const patientId = "33333333-3333-4333-8333-333333333333";
const appointmentId = "44444444-4444-4444-8444-444444444444";
const queueId = "55555555-5555-4555-8555-555555555555";
const queue2Id = "55555555-5555-4555-8555-666666666666";
const userId = "66666666-6666-4666-8666-666666666666";

describe("Timezone & Date Handling (Phases 2 & 10)", () => {
  it("uses the clinic's local timezone and does not shift to yesterday", () => {
    // 2026-10-28 01:30 AM in Asia/Kolkata (+05:30) is 2026-10-27 20:00:00 UTC
    const dateAtNightUtc = new Date("2026-10-27T20:00:00.000Z");
    const localDate = getClinicLocalDate(dateAtNightUtc, "Asia/Kolkata");
    expect(localDate).toBe("2026-10-28"); // Crucial: must be Oct 28, not shifted to Oct 27
  });

  it("calculates exact UTC day range for clinic local date", () => {
    const range = getClinicDayUtcRange("2026-10-28", "Asia/Kolkata");
    // Oct 28 00:00 in IST (+05:30) is Oct 27 18:30:00Z
    expect(range.start).toBe("2026-10-27T18:30:00.000Z");
    // Oct 28 23:59:59.999 in IST is Oct 28 18:29:59.999Z
    expect(range.end).toBe("2026-10-28T18:29:59.999Z");
  });

  it("converts clinic-local time to UTC accurately", () => {
    const utcDate = clinicLocalToUtc("2026-10-28", "09:00", "Asia/Kolkata");
    // 09:00 AM IST on 2026-10-28 = 03:30:00.000Z on 2026-10-28
    expect(utcDate.toISOString()).toBe("2026-10-28T03:30:00.000Z");
  });
});

describe("12-Hour Time Display Formatting (Phase 9)", () => {
  it("formats 24h string into 12h AM/PM string correctly", () => {
    expect(formatTime12h("09:00")).toBe("09:00 AM");
    expect(formatTime12h("10:00")).toBe("10:00 AM");
    expect(formatTime12h("12:00")).toBe("12:00 PM");
    expect(formatTime12h("13:00")).toBe("01:00 PM");
    expect(formatTime12h("18:00")).toBe("06:00 PM");
    expect(formatTime12h("00:00")).toBe("12:00 AM");
  });

  it("formats 1-hour slot labels in 12h AM/PM format", () => {
    expect(formatSlotLabel12h("09:00", "10:00")).toBe("09:00 AM - 10:00 AM");
    expect(formatSlotLabel12h("13:00", "14:00")).toBe("01:00 PM - 02:00 PM");
  });
});

describe("Doctor Availability & 1-Hour Slot Calculation (Phases 4, 5, 6, 7, 8)", () => {
  const defaultWorkingHours: ClinicWorkingHoursConfig = {
    opening_time: "09:00",
    closing_time: "18:00",
    break_enabled: true,
    break_start: "13:00",
    break_end: "14:00",
    closed_dates: [],
  };

  it("generates 1-hour slots from clinic opening to closing, excluding break window", () => {
    // 09:00 to 18:00 is 9 hours. Excluding 13:00-14:00 break leaves 8 slots.
    const slots = calculateDoctorSlots(
      "2026-10-28",
      null,
      "ACTIVE",
      [],
      new Date("2026-10-28T00:00:00Z"),
      "UTC",
      defaultWorkingHours
    );

    expect(slots.length).toBe(8);
    expect(slots[0]?.timeLabel).toBe("09:00 AM - 10:00 AM");
    expect(slots[0]?.slotStart).toBe("09:00");
    expect(slots[0]?.slotEnd).toBe("10:00");
    expect(slots[0]?.available).toBe(true);

    // Slot 13:00 - 14:00 must NOT exist because break is enabled
    const breakSlot = slots.find((s) => s.slotStart === "13:00");
    expect(breakSlot).toBeUndefined();

    // After break is 14:00 - 15:00
    const afterBreak = slots.find((s) => s.slotStart === "14:00");
    expect(afterBreak).toBeDefined();
    expect(afterBreak?.timeLabel).toBe("02:00 PM - 03:00 PM");
  });

  it("omits past time frames for current date strictly earlier than now() (Requirement C)", () => {
    // Current time is 11:30 AM
    const now = new Date("2026-10-28T11:30:00Z");
    const slots = calculateDoctorSlots(
      "2026-10-28",
      null,
      "ACTIVE",
      [],
      now,
      defaultWorkingHours,
      "UTC",
      { omitPast: true }
    );

    // 09:00 - 10:00 (end 10:00 <= 11:30) is past -> must be omitted
    // 10:00 - 11:00 (end 11:00 <= 11:30) is past -> must be omitted
    // 11:00 - 12:00 (start 11:00 <= 11:30) is in-progress/past -> must be omitted
    const slot0900 = slots.find((s) => s.slotStart === "09:00");
    expect(slot0900).toBeUndefined();
    const slot1000 = slots.find((s) => s.slotStart === "10:00");
    expect(slot1000).toBeUndefined();

    // 12:00 - 13:00 (start 12:00 > 11:30) is future -> must be included
    const slot1200 = slots.find((s) => s.slotStart === "12:00");
    expect(slot1200).toBeDefined();
    expect(slot1200?.available).toBe(true);
  });

  it("blocks all slots if clinic is marked Closed for that date (Phase 6 & 7)", () => {
    const closedConfig: ClinicWorkingHoursConfig = {
      ...defaultWorkingHours,
      closed_dates: ["2026-10-28"],
    };

    const slots = calculateDoctorSlots(
      "2026-10-28",
      null,
      "ACTIVE",
      [],
      new Date("2026-10-28T00:00:00Z"),
      closedConfig,
      "UTC"
    );

    expect(slots).toHaveLength(0);
  });

  it("distinguishes active clinic membership from doctor daily availability (Phase 4)", () => {
    // Doctor membership is ACTIVE, but daily override is marked BUSY
    const busyAvail: DoctorAvailabilityConfig = {
      daily_overrides: {
        "2026-10-28": "BUSY",
      },
    };

    const slots = calculateDoctorSlots(
      "2026-10-28",
      busyAvail,
      "ACTIVE",
      [],
      new Date("2026-10-28T00:00:00Z"),
      defaultWorkingHours,
      "UTC"
    );

    expect(slots).toHaveLength(0);
  });

  it("blocks doctor slots when doctor has approved leave for that date (Phase 7)", () => {
    const leaveAvail: DoctorAvailabilityConfig = {
      leaves: [
        {
          id: "leave-1",
          date: "2026-10-28",
          reason: "Medical conference",
          status: "APPROVED",
          created_at: new Date().toISOString(),
        },
      ],
    };

    const slots = calculateDoctorSlots(
      "2026-10-28",
      leaveAvail,
      "ACTIVE",
      [],
      new Date("2026-10-28T00:00:00Z"),
      defaultWorkingHours,
      "UTC"
    );

    expect(slots).toHaveLength(0);
  });

  it("enforces doctor-specific slot capacity of 6 and makes full slots unselectable (Phase 8 & Req A)", () => {
    // 6 existing bookings for 10:00 - 11:00
    const existing = Array.from({ length: 6 }).map((_, i) => ({
      scheduled_start: "2026-10-28T10:00:00.000Z",
      scheduled_end: "2026-10-28T11:00:00.000Z",
      status: "CONFIRMED",
    }));

    const slots = calculateDoctorSlots(
      "2026-10-28",
      null,
      "ACTIVE",
      existing,
      new Date("2026-10-28T00:00:00Z"),
      defaultWorkingHours,
      "UTC",
      { omitFull: true }
    );

    // 10:00 slot reached capacity 6 -> must NOT be offered in selectable slots
    const slot1000 = slots.find((s) => s.slotStart === "10:00");
    expect(slot1000).toBeUndefined();

    // 11:00 slot has 0 bookings -> available and bookable
    const slot1100 = slots.find((s) => s.slotStart === "11:00");
    expect(slot1100).toBeDefined();
    expect(slot1100?.available).toBe(true);
  });

  it("does not count cancelled appointments towards slot capacity", () => {
    // 5 confirmed + 1 cancelled = 5 active
    const existing = [
      ...Array.from({ length: 5 }).map(() => ({
        scheduled_start: "2026-10-28T10:00:00.000Z",
        scheduled_end: "2026-10-28T11:00:00.000Z",
        status: "CONFIRMED",
      })),
      {
        scheduled_start: "2026-10-28T10:00:00.000Z",
        scheduled_end: "2026-10-28T11:00:00.000Z",
        status: "CANCELLED",
      },
    ];

    const slots = calculateDoctorSlots(
      "2026-10-28",
      null,
      "ACTIVE",
      existing,
      new Date("2026-10-28T00:00:00Z"),
      defaultWorkingHours,
      "UTC",
      { omitFull: true }
    );

    const slot1000 = slots.find((s) => s.slotStart === "10:00");
    expect(slot1000).toBeDefined();
    expect(slot1000?.available).toBe(true);
  });
});

describe("Queue State Synchronization & Transitions (Phases 11 & 12)", () => {
  it("formats queue numbers with 3-digit padding", () => {
    expect(formatQueueNumber(1)).toBe("001");
    expect(formatQueueNumber(7)).toBe("007");
    expect(formatQueueNumber(24)).toBe("024");
    expect(formatQueueNumber(105)).toBe("105");
  });

  it("validates strict queue transition lifecycle", () => {
    expect(isValidQueueTransition("WAITING", "CALLED")).toBe(true);
    expect(isValidQueueTransition("CALLED", "IN_CONSULTATION")).toBe(true);
    expect(isValidQueueTransition("IN_CONSULTATION", "COMPLETED")).toBe(true);
    expect(isValidQueueTransition("CALLED", "SKIPPED")).toBe(true);
    expect(isValidQueueTransition("SKIPPED", "WAITING")).toBe(true);

    // Invalid transitions
    expect(isValidQueueTransition("WAITING", "COMPLETED")).toBe(false);
    expect(isValidQueueTransition("WAITING", "IN_CONSULTATION")).toBe(false);
    expect(isValidQueueTransition("COMPLETED", "WAITING")).toBe(false);
  });
});

describe("Appointment Creation Schema", () => {
  it("validates required fields with ISO datetime", () => {
    const valid = {
      clinic_id: clinicId,
      patient_id: patientId,
      doctor_profile_id: doctorId,
      appointment_type: "CONSULTATION",
      scheduled_start: "2026-10-28T09:00:00.000Z",
      scheduled_end: "2026-10-28T10:00:00.000Z",
      reason: "General checkup",
    };

    expect(createAppointmentSchema.safeParse(valid).success).toBe(true);
    expect(createAppointmentSchema.safeParse({ ...valid, patient_id: "not-uuid" }).success).toBe(false);
  });
});

// Mock Supabase DB Factory supporting doctor-specific capacity and queue operations
function makeFakeDb(options: {
  role?: "OWNER" | "STAFF" | "DOCTOR";
  operational?: boolean;
  active?: boolean;
  doctorStatus?: "ACTIVE" | "ON_LEAVE" | "INACTIVE";
  bookedCount?: number;
  existingActiveQueue?: boolean;
  appointmentStatus?: string;
  nextQueueNum?: number;
  hasActiveConsultation?: boolean;
  hasWaitingPatient?: boolean;
  hasPatientConflict?: boolean;
  doctorAvailability?: Record<string, unknown> | null;
  closedDates?: string[];
  existingConsultation?: { id: string; status: "DRAFT" | "COMPLETED" } | null;
} = {}) {
  const calls: [string, unknown[]][] = [];
  const auditLogs: unknown[] = [];
  const queueStatuses: Record<string, string> = {
    [queueId]: options.hasActiveConsultation ? "IN_CONSULTATION" : "WAITING",
    [queue2Id]: "WAITING",
  };

  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const neqFilters: Record<string, unknown> = {};
    let pendingUpdate: Record<string, unknown> | null = null;

    const applyPendingUpdate = () => {
      if (pendingUpdate && table === "queue_entries") {
        if (typeof pendingUpdate["status"] === "string") {
          const targetId = filters["id"] ? String(filters["id"]) : queueId;
          queueStatuses[targetId] = String(pendingUpdate["status"]);
        }
      }
    };

    const chain: Record<string, unknown> = {};
    for (const m of [
      "select",
      "insert",
      "update",
      "order",
      "or",
      "eq",
      "neq",
      "lt",
      "gt",
      "gte",
      "lte",
      "in",
      "limit",
    ]) {
      chain[m] = (...args: unknown[]) => {
        calls.push([`${table}.${m}`, args]);
        if (m === "eq") {
          filters[String(args[0])] = args[1];
          applyPendingUpdate();
        }
        if (m === "neq") {
          neqFilters[String(args[0])] = args[1];
        }
        if (m === "insert") {
          if (table === "audit_logs") auditLogs.push(args[0]);
        }
        if (m === "update") {
          pendingUpdate = args[0] as Record<string, unknown>;
          applyPendingUpdate();
        }
        return chain;
      };
    }

    chain["maybeSingle"] = async () => {
      applyPendingUpdate();
      if (table === "profiles") {
        return {
          data: { platform_role: "USER", status: options.active === false ? "SUSPENDED" : "ACTIVE" },
          error: null,
        };
      }
      if (table === "clinic_members") {
        return {
          data: { role: options.role ?? "OWNER", status: options.active === false ? "SUSPENDED" : "ACTIVE" },
          error: null,
        };
      }
      if (table === "clinics") {
        return {
          data: {
            id: clinicId,
            timezone: "Asia/Kolkata",
            working_hours: {
              opening_time: "09:00",
              closing_time: "18:00",
              break_enabled: false,
              break_start: "13:00",
              break_end: "14:00",
              closed_dates: options.closedDates ?? [],
            },
          },
          error: null,
        };
      }
      if (table === "doctor_profiles") {
        return {
          data: {
            id: doctorId,
            clinic_id: clinicId,
            specialization: "General Medicine",
            status: options.doctorStatus ?? "ACTIVE",
            availability: options.doctorAvailability ?? null,
            user_id: userId,
          },
          error: null,
        };
      }
      if (table === "patients") {
        return { data: { id: patientId, clinic_id: clinicId }, error: null };
      }
      if (table === "appointments") {
        if (filters["scheduled_start"] && filters["patient_id"]) {
          if (options.hasPatientConflict) {
            return {
              data: {
                id: "conflict-appt-id",
                clinic_id: clinicId,
                patient_id: patientId,
                scheduled_start: String(filters["scheduled_start"]),
              },
              error: null,
            };
          }
          return { data: null, error: null };
        }
        if (options.hasPatientConflict && filters["patient_id"]) {
          return {
            data: {
              id: "conflict-appt-id",
              clinic_id: clinicId,
              patient_id: patientId,
              scheduled_start: "2026-10-28T14:00:00.000Z",
            },
            error: null,
          };
        }
        if (neqFilters["id"] === appointmentId) {
          return { data: null, error: null };
        }
        return {
          data: {
            id: appointmentId,
            clinic_id: clinicId,
            patient_id: patientId,
            doctor_profile_id: doctorId,
            status: options.appointmentStatus ?? "CONFIRMED",
            scheduled_start: "2026-10-28T09:00:00.000Z",
            scheduled_end: "2026-10-28T10:00:00.000Z",
          },
          error: null,
        };
      }
      if (table === "queue_entries") {
        if (filters["appointment_id"]) {
          if (options.existingActiveQueue) {
            return {
              data: {
                id: queueId,
                clinic_id: clinicId,
                appointment_id: appointmentId,
                doctor_profile_id: doctorId,
                patient_id: patientId,
                queue_number: 1,
                status: queueStatuses[queueId] ?? "WAITING",
              },
              error: null,
            };
          }
          return { data: null, error: null };
        }

        if (filters["status"] === "IN_CONSULTATION") {
          if (queueStatuses[queueId] === "IN_CONSULTATION") {
            return {
              data: {
                id: queueId,
                clinic_id: clinicId,
                appointment_id: appointmentId,
                doctor_profile_id: doctorId,
                patient_id: patientId,
                queue_number: 1,
                status: "IN_CONSULTATION",
              },
              error: null,
            };
          }
          return { data: null, error: null };
        }

        if (filters["status"] === "WAITING") {
          if (options.hasWaitingPatient && queueStatuses[queue2Id] === "WAITING") {
            return {
              data: {
                id: queue2Id,
                clinic_id: clinicId,
                appointment_id: "appt-next",
                doctor_profile_id: doctorId,
                patient_id: "pat-next",
                queue_number: 2,
                status: "WAITING",
              },
              error: null,
            };
          }
          return { data: null, error: null };
        }

        const targetId = filters["id"] ? String(filters["id"]) : queueId;
        const status = queueStatuses[targetId] ?? "WAITING";

        return {
          data: {
            id: targetId,
            clinic_id: clinicId,
            appointment_id: appointmentId,
            doctor_profile_id: doctorId,
            patient_id: patientId,
            queue_number: targetId === queue2Id ? 2 : options.nextQueueNum ?? 1,
            status,
          },
          error: null,
        };
      }
      if (table === "consultations") {
        return { data: options.existingConsultation ?? null, error: null };
      }
      return { data: null, error: null };
    };

    chain["single"] = async () => {
      applyPendingUpdate();
      if (table === "clinics") {
        return {
          data: {
            id: clinicId,
            timezone: "Asia/Kolkata",
            working_hours: {
              opening_time: "09:00",
              closing_time: "18:00",
              break_enabled: false,
              break_start: "13:00",
              break_end: "14:00",
              closed_dates: [],
            },
          },
          error: null,
        };
      }
      if (table === "appointments") {
        return {
          data: {
            id: appointmentId,
            clinic_id: clinicId,
            patient_id: patientId,
            doctor_profile_id: doctorId,
            status: (pendingUpdate?.["status"] as any) ?? "CONFIRMED",
            scheduled_start: (pendingUpdate?.["scheduled_start"] as any) ?? "2026-10-28T09:00:00.000Z",
            scheduled_end: (pendingUpdate?.["scheduled_end"] as any) ?? "2026-10-28T10:00:00.000Z",
            notes: (pendingUpdate?.["notes"] as any) ?? null,
          },
          error: null,
        };
      }
      if (table === "queue_entries") {
        const targetId = filters["id"] ? String(filters["id"]) : queueId;
        const status = queueStatuses[targetId] ?? "WAITING";
        return {
          data: {
            id: targetId,
            clinic_id: clinicId,
            appointment_id: appointmentId,
            doctor_profile_id: doctorId,
            patient_id: patientId,
            queue_number: targetId === queue2Id ? 2 : options.nextQueueNum ?? 1,
            status,
          },
          error: null,
        };
      }
      return { data: { id: "res1" }, error: null };
    };

    chain["then"] = (resolve: (v: unknown) => unknown) => {
      if (table === "appointments") {
        const count = options.bookedCount ?? 0;
        const fakeAppts = Array.from({ length: count }).map((_, i) => ({
          id: `appt-existing-${i}`,
          doctor_profile_id: doctorId,
        }));
        return Promise.resolve(resolve({ count, data: fakeAppts, error: null }));
      }
      if (table === "queue_entries" && calls.some(([c]) => c === "queue_entries.order")) {
        const highestNum = options.nextQueueNum ? options.nextQueueNum - 1 : 0;
        return Promise.resolve(resolve({ data: [{ queue_number: highestNum }], error: null }));
      }
      return Promise.resolve(resolve({ data: [], error: null }));
    };

    return chain;
  };

  const rpc = vi.fn(async (fn: string) => {
    if (fn === "clinic_is_operational") {
      return { data: options.operational !== false, error: null };
    }
    if (fn === "clinic_member_names") {
      return { data: [{ user_id: userId, display_name: "Dr. Asha Rao" }], error: null };
    }
    return { data: true, error: null };
  });

  return {
    db: { from, rpc } as unknown as SupabaseClient<Database>,
    calls,
    auditLogs,
    rpc,
  };
}

describe("Doctor-Specific Capacity Backend Enforcement (Phase 8)", () => {
  it("allows up to 6 bookings for a doctor slot and rejects the 7th booking", async () => {
    // 6 existing bookings for Doctor A
    const { db: fullDb } = makeFakeDb({ bookedCount: 6 });
    await expect(
      createAppointment(fullDb, userId, clinicId, {
        clinic_id: clinicId,
        patient_id: patientId,
        doctor_profile_id: doctorId,
        appointment_type: "CONSULTATION",
        scheduled_start: "2026-10-28T09:00:00.000Z",
        scheduled_end: "2026-10-28T10:00:00.000Z",
      })
    ).rejects.toThrow("reached maximum capacity (6 appointments)");
  });

  it("allows booking for Doctor A when capacity is under 6", async () => {
    const { db: openDb, auditLogs } = makeFakeDb({ bookedCount: 3 });
    const appt = await createAppointment(openDb, userId, clinicId, {
      clinic_id: clinicId,
      patient_id: patientId,
      doctor_profile_id: doctorId,
      appointment_type: "CONSULTATION",
      scheduled_start: "2026-10-28T09:00:00.000Z",
      scheduled_end: "2026-10-28T10:00:00.000Z",
    });

    expect(appt.id).toBe(appointmentId);
    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        action: "APPOINTMENT_CREATED",
      })
    );
  });
});

describe("Queue Date Generation Bug Fix (Phase 10)", () => {
  it("derives queue date from appointment's clinic-local scheduled date, not UTC now", async () => {
    const { db, calls } = makeFakeDb();
    await checkInPatient(db, userId, clinicId, appointmentId);

    // Verify insert call on queue_entries
    const insertCall = calls.find(([c]) => c === "queue_entries.insert");
    expect(insertCall).toBeDefined();
    const insertedRecord = (insertCall?.[1]?.[0] as any) || {};

    // For appointment on 2026-10-28 09:00 UTC in Asia/Kolkata timezone:
    // Local date is 2026-10-28!
    expect(insertedRecord.queue_date).toBe("2026-10-28");
  });
});

describe("Consulted Button & Queue Transitions (Phases 11 & 12)", () => {
  it("completes active consultation and auto-calls the next waiting patient", async () => {
    const { db, auditLogs } = makeFakeDb({
      hasActiveConsultation: true,
      hasWaitingPatient: true,
    });

    const result = await consultActivePatient(
      db,
      userId,
      clinicId,
      doctorId,
      queueId,
      { clinical_notes: "Patient advised to rest" }
    );

    expect(result.completed.id).toBe(queueId);
    expect(result.completed.status).toBe("COMPLETED");
    expect(result.next?.id).toBe(queue2Id);
    expect(result.next?.status).toBe("CALLED");

    // Audit logs verify consultation completed
    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        action: "QUEUE_STATUS_TRANSITION",
        metadata: expect.objectContaining({
          new_status: "COMPLETED",
        }),
      })
    );
  });

  it("completes active consultation and leaves Currently with Doctor empty if no waiting patient", async () => {
    const { db } = makeFakeDb({
      hasActiveConsultation: true,
      hasWaitingPatient: false,
    });

    const result = await consultActivePatient(db, userId, clinicId, doctorId, queueId);
    expect(result.completed.status).toBe("COMPLETED");
    expect(result.next).toBeNull();
  });

  it("rejects Call Next when doctor already has a patient in consultation (Phase 11)", async () => {
    const { db } = makeFakeDb({
      hasActiveConsultation: true,
    });

    await expect(callNextPatient(db, userId, clinicId, doctorId)).rejects.toThrow(
      "currently in consultation"
    );
  });

  it("does not insert duplicate consultation if one already exists when completing queue entry", async () => {
    const { db, calls } = makeFakeDb({
      hasActiveConsultation: true,
      existingConsultation: { id: "existing-consult-id", status: "COMPLETED" },
    });

    const result = await transitionQueueEntry(
      db as unknown as SupabaseClient<Database>,
      userId,
      clinicId,
      queueId,
      "COMPLETED",
      {
        clinical_notes: "Patient is recovering well",
        assessment: "Stable",
      }
    );

    expect(result.status).toBe("COMPLETED");

    // Must NOT have called consultations.insert
    const insertCall = calls.find(([name]) => name === "consultations.insert");
    expect(insertCall).toBeUndefined();

    // Must NOT have called consultations.update since it was already COMPLETED
    const updateCall = calls.find(([name]) => name === "consultations.update");
    expect(updateCall).toBeUndefined();
  });

  it("updates existing draft consultation when completing queue entry with notes", async () => {
    const { db, calls } = makeFakeDb({
      hasActiveConsultation: true,
      existingConsultation: { id: "existing-consult-id", status: "DRAFT" },
    });

    const result = await transitionQueueEntry(
      db as unknown as SupabaseClient<Database>,
      userId,
      clinicId,
      queueId,
      "COMPLETED",
      {
        clinical_notes: "Updated notes",
        assessment: "Improving",
      }
    );

    expect(result.status).toBe("COMPLETED");

    const insertCall = calls.find(([name]) => name === "consultations.insert");
    expect(insertCall).toBeUndefined();

    const updateCall = calls.find(([name]) => name === "consultations.update");
    expect(updateCall).toBeDefined();
    expect(updateCall?.[1]?.[0]).toMatchObject({
      status: "COMPLETED",
      clinical_notes: "Updated notes",
      assessment: "Improving",
    });
  });
});

describe("Appointments Security, Isolation & Lifecycle Operations", () => {
  it("authorizes active clinic members with required roles", async () => {
    const { db: ownerDb } = makeFakeDb({ role: "OWNER" });
    await expect(assertClinicMemberWithRoles(ownerDb, userId, clinicId, ["OWNER", "STAFF"])).resolves.toEqual({
      role: "OWNER",
    });

    const { db: staffDb } = makeFakeDb({ role: "STAFF" });
    await expect(assertClinicMemberWithRoles(staffDb, userId, clinicId, ["OWNER", "STAFF"])).resolves.toEqual({
      role: "STAFF",
    });

    const { db: doctorDb } = makeFakeDb({ role: "DOCTOR" });
    await expect(assertClinicMemberWithRoles(doctorDb, userId, clinicId, ["OWNER", "STAFF", "DOCTOR"])).resolves.toEqual({
      role: "DOCTOR",
    });
  });

  it("refuses unauthorized roles, non-operational clinics, and suspended memberships", async () => {
    const { db: doctorDb } = makeFakeDb({ role: "DOCTOR" });
    // Refuses DOCTOR when only OWNER and STAFF are allowed
    await expect(assertClinicMemberWithRoles(doctorDb, userId, clinicId, ["OWNER", "STAFF"])).rejects.toThrow(
      "Access is unavailable"
    );

    // Refuses when clinic is not operational
    const { db: nonOpDb } = makeFakeDb({ role: "STAFF", operational: false });
    await expect(assertClinicMemberWithRoles(nonOpDb, userId, clinicId, ["OWNER", "STAFF"])).rejects.toThrow(
      "Clinic is not currently operational"
    );

    // Refuses when membership is suspended
    const { db: suspendedDb } = makeFakeDb({ role: "OWNER", active: false });
    await expect(assertClinicMemberWithRoles(suspendedDb, userId, clinicId, ["OWNER", "STAFF"])).rejects.toThrow(
      "Access is unavailable"
    );
  });

  it("rejects appointment creation if doctor is on leave or inactive", async () => {
    const { db: leaveDb } = makeFakeDb({ doctorStatus: "ON_LEAVE" });
    await expect(
      createAppointment(leaveDb, userId, clinicId, {
        clinic_id: clinicId,
        patient_id: patientId,
        doctor_profile_id: doctorId,
        appointment_type: "CONSULTATION",
        scheduled_start: "2026-10-28T09:00:00.000Z",
        scheduled_end: "2026-10-28T10:00:00.000Z",
      })
    ).rejects.toThrow("on leave");

    const { db: inactiveDb } = makeFakeDb({ doctorStatus: "INACTIVE" });
    await expect(
      createAppointment(inactiveDb, userId, clinicId, {
        clinic_id: clinicId,
        patient_id: patientId,
        doctor_profile_id: doctorId,
        appointment_type: "CONSULTATION",
        scheduled_start: "2026-10-28T09:00:00.000Z",
        scheduled_end: "2026-10-28T10:00:00.000Z",
      })
    ).rejects.toThrow("inactive");
  });

  it("reschedules appointment to new slot, updates status to CONFIRMED, and records audit log", async () => {
    const { db, calls, auditLogs } = makeFakeDb();
    const result = await rescheduleAppointment(
      db,
      userId,
      clinicId,
      appointmentId,
      "2026-10-28T14:00:00.000Z",
      "2026-10-28T15:00:00.000Z",
      "Patient requested afternoon"
    );

    expect(result.status).toBe("CONFIRMED");
    expect(calls).toContainEqual(["appointments.update", [expect.objectContaining({
      scheduled_start: "2026-10-28T14:00:00.000Z",
      scheduled_end: "2026-10-28T15:00:00.000Z",
      notes: expect.stringContaining("[Rescheduled from"),
    })]]);

    const info = getAppointmentRescheduleInfo(result.notes);
    expect(info.isRescheduled).toBe(true);
    expect(info.reason).toBe("Patient requested afternoon");
    expect(info.originalSchedule).toBeDefined();

    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        action: "APPOINTMENT_RESCHEDULED",
        entity_id: appointmentId,
        metadata: expect.objectContaining({
          reason: "Patient requested afternoon",
        }),
      })
    );
  });

  it("rejects rescheduling when doctor slot has reached capacity of 6", async () => {
    const { db: fullDb } = makeFakeDb({ bookedCount: 6 });
    await expect(
      rescheduleAppointment(
        fullDb,
        userId,
        clinicId,
        appointmentId,
        "2026-10-28T14:00:00.000Z",
        "2026-10-28T15:00:00.000Z"
      )
    ).rejects.toThrow("reached maximum capacity (6 appointments)");
  });

  it("rejects rescheduling when clinic is marked closed on the target date", async () => {
    const { db: closedDb } = makeFakeDb({ closedDates: ["2026-10-28"] });
    await expect(
      rescheduleAppointment(
        closedDb,
        userId,
        clinicId,
        appointmentId,
        "2026-10-28T14:00:00.000Z",
        "2026-10-28T15:00:00.000Z"
      )
    ).rejects.toThrow("Clinic is marked closed on this date");
  });

  it("rejects rescheduling when doctor is on leave or inactive", async () => {
    const { db: leaveDb } = makeFakeDb({ doctorStatus: "ON_LEAVE" });
    await expect(
      rescheduleAppointment(
        leaveDb,
        userId,
        clinicId,
        appointmentId,
        "2026-10-28T14:00:00.000Z",
        "2026-10-28T15:00:00.000Z"
      )
    ).rejects.toThrow("on leave");

    const { db: inactiveDb } = makeFakeDb({ doctorStatus: "INACTIVE" });
    await expect(
      rescheduleAppointment(
        inactiveDb,
        userId,
        clinicId,
        appointmentId,
        "2026-10-28T14:00:00.000Z",
        "2026-10-28T15:00:00.000Z"
      )
    ).rejects.toThrow("inactive");
  });

  it("rejects rescheduling when doctor is marked BUSY on that date", async () => {
    const { db: busyDb } = makeFakeDb({
      doctorAvailability: { daily_overrides: { "2026-10-28": "BUSY" } },
    });
    await expect(
      rescheduleAppointment(
        busyDb,
        userId,
        clinicId,
        appointmentId,
        "2026-10-28T14:00:00.000Z",
        "2026-10-28T15:00:00.000Z"
      )
    ).rejects.toThrow("Doctor is marked busy on this date");
  });

  it("rejects rescheduling when patient has a conflicting double booking", async () => {
    const { db: conflictDb } = makeFakeDb({ hasPatientConflict: true });
    await expect(
      rescheduleAppointment(
        conflictDb,
        userId,
        clinicId,
        appointmentId,
        "2026-10-28T14:00:00.000Z",
        "2026-10-28T15:00:00.000Z"
      )
    ).rejects.toThrow("This patient already has an appointment booked at this time");
  });

  it("rejects rescheduling to the exact same slot", async () => {
    const { db } = makeFakeDb();
    await expect(
      rescheduleAppointment(
        db,
        userId,
        clinicId,
        appointmentId,
        "2026-10-28T09:00:00.000Z",
        "2026-10-28T10:00:00.000Z"
      )
    ).rejects.toThrow("Appointment is already scheduled for this time slot");
  });

  it("cancels linked active queue entries when a checked-in appointment is rescheduled", async () => {
    const { db, calls } = makeFakeDb({
      appointmentStatus: "CHECKED_IN",
      existingActiveQueue: true,
    });
    const result = await rescheduleAppointment(
      db,
      userId,
      clinicId,
      appointmentId,
      "2026-10-28T14:00:00.000Z",
      "2026-10-28T15:00:00.000Z"
    );

    expect(result.status).toBe("CONFIRMED");
    expect(calls).toContainEqual(["queue_entries.update", [{ status: "CANCELLED" }]]);
  });

  it("rejects rescheduling an already COMPLETED, CANCELLED, or IN_PROGRESS appointment", async () => {
    const { db: completedDb } = makeFakeDb({ appointmentStatus: "COMPLETED" });
    await expect(
      rescheduleAppointment(
        completedDb,
        userId,
        clinicId,
        appointmentId,
        "2026-10-28T14:00:00.000Z",
        "2026-10-28T15:00:00.000Z"
      )
    ).rejects.toThrow("Cannot reschedule an appointment that is already completed");

    const { db: cancelledDb } = makeFakeDb({ appointmentStatus: "CANCELLED" });
    await expect(
      rescheduleAppointment(
        cancelledDb,
        userId,
        clinicId,
        appointmentId,
        "2026-10-28T14:00:00.000Z",
        "2026-10-28T15:00:00.000Z"
      )
    ).rejects.toThrow("Cannot reschedule an appointment that is already cancelled");

    const { db: inProgDb } = makeFakeDb({ appointmentStatus: "IN_PROGRESS" });
    await expect(
      rescheduleAppointment(
        inProgDb,
        userId,
        clinicId,
        appointmentId,
        "2026-10-28T14:00:00.000Z",
        "2026-10-28T15:00:00.000Z"
      )
    ).rejects.toThrow("Cannot reschedule an appointment that is currently in consultation");
  });

  it("correctly parses multi-event rescheduling history from notes", () => {
    const singleNote = "[Rescheduled from 2026-10-28 (09:00 AM - 10:00 AM): Patient fever]";
    const parsedSingle = getAppointmentRescheduleInfo(singleNote);
    expect(parsedSingle.isRescheduled).toBe(true);
    expect(parsedSingle.originalSchedule).toBe("2026-10-28 (09:00 AM - 10:00 AM)");
    expect(parsedSingle.reason).toBe("Patient fever");
    expect(parsedSingle.history).toHaveLength(1);

    const multiNote = `Existing clinical comment\n[Rescheduled from 2026-10-28 (09:00 AM - 10:00 AM): Doctor delayed]\n[Rescheduled from 2026-10-29 (11:00 AM - 12:00 PM): Patient request]`;
    const parsedMulti = getAppointmentRescheduleInfo(multiNote);
    expect(parsedMulti.isRescheduled).toBe(true);
    expect(parsedMulti.originalSchedule).toBe("2026-10-29 (11:00 AM - 12:00 PM)");
    expect(parsedMulti.reason).toBe("Patient request");
    expect(parsedMulti.history).toHaveLength(2);
    expect(parsedMulti.history[0]?.originalSchedule).toBe("2026-10-28 (09:00 AM - 10:00 AM)");
  });

  it("cancels appointment with reason, releases slot, and cancels linked queue entries", async () => {
    const { db, calls, auditLogs } = makeFakeDb({ existingActiveQueue: true });
    const result = await cancelAppointment(db, userId, clinicId, appointmentId, "Patient emergency");

    expect(result).toBeDefined();
    expect(calls).toContainEqual(["appointments.update", [expect.objectContaining({
      status: "CANCELLED",
      notes: "Cancellation reason: Patient emergency",
    })]]);

    // Cancels waiting/called queue entries associated with appointment
    expect(calls).toContainEqual(["queue_entries.update", [{ status: "CANCELLED" }]]);

    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        action: "APPOINTMENT_CANCELLED",
        entity_id: appointmentId,
        metadata: { reason: "Patient emergency" },
      })
    );
  });
});

