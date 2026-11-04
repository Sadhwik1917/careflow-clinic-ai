import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  formatQueueNumber,
  isValidQueueTransition,
  getClinicLocalDate,
  formatTime12h,
  formatSlotLabel12h,
  type QueueEntryWithDetails,
  type QueueStatus,
} from "@/lib/appointments";
import {
  assertClinicMemberWithRoles,
  checkInPatient,
  transitionQueueEntry,
  reassignQueueDoctor,
  readQueueEntries,
} from "@/lib/appointments.server";

const clinicAId = "11111111-1111-4111-8111-111111111111";
const clinicBId = "99999999-9999-4999-8999-999999999999";
const doctor1Id = "22222222-2222-4222-8222-111111111111";
const doctor2Id = "22222222-2222-4222-8222-222222222222";
const diffSpecialtyDoctorId = "22222222-2222-4222-8222-444444444444";
const inactiveDoctorId = "22222222-2222-4222-8222-333333333333";
const receptionistUserId = "66666666-6666-4666-8666-receptionist";
const ownerUserId = "66666666-6666-4666-8666-owner";
const outsiderUserId = "66666666-6666-4666-8666-outsider";
const patientId = "33333333-3333-4333-8333-333333333333";
const appointmentId = "44444444-4444-4444-8444-444444444444";
const queue1Id = "55555555-5555-4555-8555-000000000001";

interface MockDbOptions {
  userRole?: "OWNER" | "STAFF" | "DOCTOR";
  userProfileStatus?: "ACTIVE" | "SUSPENDED";
  membershipStatus?: "ACTIVE" | "INACTIVE";
  operational?: boolean;
  memberClinicId?: string;
  initialQueueStatus?: QueueStatus;
  hasAppointment?: boolean;
  appointmentStatus?: string;
  nextQueueNumDoctor2?: number;
}

function makeMockSupabase(options: MockDbOptions = {}) {
  const auditLogs: Array<Record<string, unknown>> = [];
  const calls: Array<[string, unknown[]]> = [];
  let currentQueueStatus: QueueStatus = options.initialQueueStatus ?? "WAITING";
  let currentDoctorId = doctor1Id;
  let currentQueueNum = 1;

  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let pendingUpdate: Record<string, unknown> | null = null;
    let hasLimit = false;

    const chain: Record<string, any> = {
      select: vi.fn((...args) => {
        calls.push([`${table}.select`, args]);
        return chain;
      }),
      eq: vi.fn((col: string, val: unknown) => {
        filters[col] = val;
        calls.push([`${table}.eq:${col}`, [val]]);
        return chain;
      }),
      in: vi.fn((col: string, vals: unknown[]) => {
        filters[`in:${col}`] = vals;
        calls.push([`${table}.in:${col}`, vals]);
        return chain;
      }),
      order: vi.fn((...args) => {
        calls.push([`${table}.order`, args]);
        return chain;
      }),
      limit: vi.fn((...args) => {
        hasLimit = true;
        calls.push([`${table}.limit`, args]);
        return chain;
      }),
      insert: vi.fn((payload) => {
        calls.push([`${table}.insert`, [payload]]);
        if (table === "audit_logs") {
          auditLogs.push(payload);
        }
        return chain;
      }),
      update: vi.fn((payload) => {
        calls.push([`${table}.update`, [payload]]);
        pendingUpdate = payload;
        if (table === "queue_entries") {
          if (payload.status) currentQueueStatus = payload.status;
          if (payload.doctor_profile_id) currentDoctorId = payload.doctor_profile_id;
          if (payload.queue_number) currentQueueNum = payload.queue_number;
        }
        return chain;
      }),
    };

    chain["maybeSingle"] = async () => {
      if (table === "profiles") {
        return {
          data: {
            platform_role: "USER",
            status: options.userProfileStatus ?? "ACTIVE",
          },
          error: null,
        };
      }

      if (table === "clinic_members") {
        const uId = filters["user_id"];
        const cId = filters["clinic_id"];
        if (uId === outsiderUserId || (options.memberClinicId && cId !== options.memberClinicId)) {
          return { data: null, error: null };
        }
        return {
          data: {
            user_id: uId,
            clinic_id: cId,
            role: options.userRole ?? "STAFF",
            status: options.membershipStatus ?? "ACTIVE",
          },
          error: null,
        };
      }

      if (table === "clinics") {
        return {
          data: {
            id: clinicAId,
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
        if (options.hasAppointment === false) return { data: null, error: null };
        return {
          data: {
            id: appointmentId,
            clinic_id: clinicAId,
            patient_id: patientId,
            doctor_profile_id: currentDoctorId,
            scheduled_start: "2026-10-28T09:00:00.000Z",
            scheduled_end: "2026-10-28T10:00:00.000Z",
            appointment_type: "CONSULTATION",
            status: options.appointmentStatus ?? "CONFIRMED",
            reason: "Routine checkup",
            notes: "Patient prefers morning slot",
            created_at: "2026-10-28T08:00:00.000Z",
            updated_at: "2026-10-28T08:00:00.000Z",
          },
          error: null,
        };
      }

      if (table === "queue_entries") {
        // Active queue check by appointment_id returns null when creating a new queue entry
        if (filters["appointment_id"]) {
          return { data: null, error: null };
        }
        return {
          data: {
            id: queue1Id,
            clinic_id: clinicAId,
            patient_id: patientId,
            doctor_profile_id: currentDoctorId,
            appointment_id: appointmentId,
            queue_date: "2026-10-28",
            queue_number: currentQueueNum,
            status: currentQueueStatus,
            checked_in_at: "2026-10-28T08:50:00.000Z",
          },
          error: null,
        };
      }

      if (table === "doctor_profiles") {
        const docId = filters["id"];
        if (docId === inactiveDoctorId) {
          return {
            data: { id: inactiveDoctorId, clinic_id: clinicAId, status: "INACTIVE", specialization: "General Physician", department: "Internal Medicine" },
            error: null,
          };
        }
        if (docId === diffSpecialtyDoctorId) {
          return {
            data: { id: diffSpecialtyDoctorId, clinic_id: clinicAId, status: "ACTIVE", specialization: "Dermatology", department: "Skin Care" },
            error: null,
          };
        }
        if (docId === doctor2Id) {
          return {
            data: { id: doctor2Id, clinic_id: clinicAId, status: "ACTIVE", specialization: "General Physician", department: "Internal Medicine" },
            error: null,
          };
        }
        return {
          data: { id: doctor1Id, clinic_id: clinicAId, status: "ACTIVE", specialization: "General Physician", department: "Internal Medicine" },
          error: null,
        };
      }

      return { data: null, error: null };
    };

    chain["single"] = async () => {
      if (table === "queue_entries") {
        return {
          data: {
            id: queue1Id,
            clinic_id: clinicAId,
            patient_id: patientId,
            doctor_profile_id: currentDoctorId,
            appointment_id: appointmentId,
            queue_date: "2026-10-28",
            queue_number: currentQueueNum,
            status: currentQueueStatus,
            checked_in_at: "2026-10-28T08:50:00.000Z",
            ...(pendingUpdate ?? {}),
          },
          error: null,
        };
      }
      if (table === "appointments") {
        return {
          data: {
            id: appointmentId,
            clinic_id: clinicAId,
            status: (pendingUpdate ? pendingUpdate["status"] : undefined) ?? "CHECKED_IN",
            doctor_profile_id: currentDoctorId,
          },
          error: null,
        };
      }
      return { data: { id: "record-1" }, error: null };
    };

    chain["then"] = (resolve: (v: unknown) => unknown) => {
      if (table === "queue_entries" && hasLimit) {
        const nextNum = options.nextQueueNumDoctor2 ? options.nextQueueNumDoctor2 - 1 : 0;
        return Promise.resolve(resolve({ data: [{ queue_number: nextNum }], error: null }));
      }
      if (table === "queue_entries") {
        return Promise.resolve(
          resolve({
            data: [
              {
                id: queue1Id,
                clinic_id: clinicAId,
                patient_id: patientId,
                doctor_profile_id: currentDoctorId,
                appointment_id: appointmentId,
                queue_date: "2026-10-28",
                queue_number: currentQueueNum,
                status: currentQueueStatus,
                checked_in_at: "2026-10-28T08:50:00.000Z",
                patient: {
                  id: patientId,
                  patient_number: "P-101",
                  first_name: "Rahul",
                  last_name: "Sharma",
                  phone: "+919876543210",
                  gender: "Male",
                  date_of_birth: "1988-04-15",
                  email: "rahul.sharma@example.com",
                  emergency_contact_name: "Pooja Sharma",
                  emergency_contact_phone: "+919876543211",
                },
                doctor: {
                  id: currentDoctorId,
                  specialization: "General Physician",
                  department: "Internal Medicine",
                  user_id: "doc-user-1",
                },
                appointment: {
                  id: appointmentId,
                  scheduled_start: "2026-10-28T09:00:00.000Z",
                  scheduled_end: "2026-10-28T10:00:00.000Z",
                  appointment_type: "CONSULTATION",
                  status: "CHECKED_IN",
                  reason: "Routine checkup",
                  notes: "Patient prefers morning slot",
                },
              },
            ],
            error: null,
          })
        );
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
      return { data: [{ user_id: "doc-user-1", display_name: "Dr. Asha Rao" }], error: null };
    }
    return { data: true, error: null };
  });

  return {
    db: { from, rpc } as unknown as SupabaseClient<Database>,
    auditLogs,
    calls,
    rpc,
  };
}

describe("Receptionist Queue Parity: Role-Based Access & Clinic Scoping", () => {
  it("authorizes active STAFF members for their assigned clinic queue", async () => {
    const { db } = makeMockSupabase({ userRole: "STAFF", operational: true });
    const access = await assertClinicMemberWithRoles(db, receptionistUserId, clinicAId, [
      "OWNER",
      "STAFF",
    ]);
    expect(access.role).toBe("STAFF");
  });

  it("authorizes active OWNER members for clinic queue", async () => {
    const { db } = makeMockSupabase({ userRole: "OWNER", operational: true });
    const access = await assertClinicMemberWithRoles(db, ownerUserId, clinicAId, [
      "OWNER",
      "STAFF",
    ]);
    expect(access.role).toBe("OWNER");
  });

  it("prevents cross-clinic access when receptionist attempts to query an unassigned clinic", async () => {
    const { db } = makeMockSupabase({ memberClinicId: clinicAId });
    // Receptionist is assigned to clinicAId, not clinicBId
    await expect(
      assertClinicMemberWithRoles(db, receptionistUserId, clinicBId, ["OWNER", "STAFF"])
    ).rejects.toThrow("Access is unavailable for this clinic.");
  });

  it("fails closed when clinic is suspended or pending verification", async () => {
    const { db } = makeMockSupabase({ userRole: "STAFF", operational: false });
    await expect(
      assertClinicMemberWithRoles(db, receptionistUserId, clinicAId, ["OWNER", "STAFF"])
    ).rejects.toThrow("Clinic is not currently operational.");
  });

  it("fails closed when user membership is INACTIVE", async () => {
    const { db } = makeMockSupabase({ userRole: "STAFF", membershipStatus: "INACTIVE" });
    await expect(
      assertClinicMemberWithRoles(db, receptionistUserId, clinicAId, ["OWNER", "STAFF"])
    ).rejects.toThrow("Access is unavailable for this clinic.");
  });
});

describe("Receptionist Queue Parity: Supported Queue Actions", () => {
  it("allows receptionist to check in a scheduled patient, issuing sequential queue number and audit log", async () => {
    const { db, auditLogs, calls } = makeMockSupabase({
      userRole: "STAFF",
      appointmentStatus: "CONFIRMED",
    });

    const res = await checkInPatient(db, receptionistUserId, clinicAId, appointmentId);
    expect(res.queueEntry).toBeDefined();
    expect(res.queueEntry.status).toBe("WAITING");

    // Verify appointment was updated to CHECKED_IN
    const apptUpdate = calls.find(([c]) => c === "appointments.update");
    expect(apptUpdate).toBeDefined();

    // Verify audit log recorded
    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        action: "PATIENT_CHECKED_IN",
        clinic_id: clinicAId,
        user_id: receptionistUserId,
      })
    );
  });

  it("allows receptionist to reassign waiting patient to another doctor in the clinic", async () => {
    const { db, auditLogs } = makeMockSupabase({
      userRole: "STAFF",
      initialQueueStatus: "WAITING",
      nextQueueNumDoctor2: 4,
    });

    const updated = await reassignQueueDoctor(
      db,
      receptionistUserId,
      clinicAId,
      queue1Id,
      doctor2Id
    );

    expect(updated.doctor_profile_id).toBe(doctor2Id);
    expect(updated.queue_number).toBe(4);

    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        action: "QUEUE_DOCTOR_REASSIGNED",
        clinic_id: clinicAId,
        user_id: receptionistUserId,
        metadata: expect.objectContaining({
          old_doctor_id: doctor1Id,
          new_doctor_id: doctor2Id,
          new_queue_number: 4,
        }),
      })
    );
  });

  it("allows receptionist to reassign skipped patient to another active doctor", async () => {
    const { db, auditLogs } = makeMockSupabase({
      userRole: "STAFF",
      initialQueueStatus: "SKIPPED",
      nextQueueNumDoctor2: 1,
    });

    const updated = await reassignQueueDoctor(
      db,
      receptionistUserId,
      clinicAId,
      queue1Id,
      doctor2Id
    );

    expect(updated.doctor_profile_id).toBe(doctor2Id);
    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        action: "QUEUE_DOCTOR_REASSIGNED",
      })
    );
  });

  it("rejects doctor reassignment if patient is currently IN_CONSULTATION or COMPLETED", async () => {
    const { db } = makeMockSupabase({
      userRole: "STAFF",
      initialQueueStatus: "IN_CONSULTATION",
    });

    await expect(
      reassignQueueDoctor(db, receptionistUserId, clinicAId, queue1Id, doctor2Id)
    ).rejects.toThrow("Cannot reassign doctor for queue entry with status IN_CONSULTATION");
  });

  it("rejects doctor reassignment if chosen doctor is INACTIVE", async () => {
    const { db } = makeMockSupabase({
      userRole: "STAFF",
      initialQueueStatus: "WAITING",
    });

    await expect(
      reassignQueueDoctor(db, receptionistUserId, clinicAId, queue1Id, inactiveDoctorId)
    ).rejects.toThrow("Selected doctor is not active");
  });

  it("rejects doctor reassignment if chosen doctor has a different specialization or department", async () => {
    const { db } = makeMockSupabase({
      userRole: "STAFF",
      initialQueueStatus: "WAITING",
    });

    await expect(
      reassignQueueDoctor(db, receptionistUserId, clinicAId, queue1Id, diffSpecialtyDoctorId)
    ).rejects.toThrow("Patients can only be reassigned to doctors with the same specialization");
  });

  it("allows receptionist to transition queue entry WAITING -> CALLED", async () => {
    const { db, auditLogs } = makeMockSupabase({
      userRole: "STAFF",
      initialQueueStatus: "WAITING",
    });

    const updated = await transitionQueueEntry(
      db,
      receptionistUserId,
      clinicAId,
      queue1Id,
      "CALLED"
    );

    expect(updated.status).toBe("CALLED");
    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        action: "QUEUE_STATUS_TRANSITION",
        metadata: expect.objectContaining({
          old_status: "WAITING",
          new_status: "CALLED",
        }),
      })
    );
  });

  it("allows receptionist to skip a called patient (CALLED -> SKIPPED)", async () => {
    const { db, auditLogs } = makeMockSupabase({
      userRole: "STAFF",
      initialQueueStatus: "CALLED",
    });

    const updated = await transitionQueueEntry(
      db,
      receptionistUserId,
      clinicAId,
      queue1Id,
      "SKIPPED"
    );

    expect(updated.status).toBe("SKIPPED");
  });

  it("allows receptionist to return a skipped patient back to waiting (SKIPPED -> WAITING)", async () => {
    const { db, auditLogs } = makeMockSupabase({
      userRole: "STAFF",
      initialQueueStatus: "SKIPPED",
    });

    const updated = await transitionQueueEntry(
      db,
      receptionistUserId,
      clinicAId,
      queue1Id,
      "WAITING"
    );

    expect(updated.status).toBe("WAITING");
  });

  it("allows receptionist to mark a patient as NO_SHOW (CANCELLED), updating linked appointment", async () => {
    const { db, calls } = makeMockSupabase({
      userRole: "STAFF",
      initialQueueStatus: "CALLED",
    });

    const updated = await transitionQueueEntry(
      db,
      receptionistUserId,
      clinicAId,
      queue1Id,
      "CANCELLED"
    );

    expect(updated.status).toBe("CANCELLED");

    // Verify appointment updated to NO_SHOW
    const apptUpdate = calls.find(([c]) => c === "appointments.update");
    expect(apptUpdate).toBeDefined();
    expect(apptUpdate?.[1]?.[0]).toMatchObject({ status: "NO_SHOW" });
  });

  it("disallows invalid queue transitions (e.g. WAITING -> COMPLETED directly)", async () => {
    const { db } = makeMockSupabase({
      userRole: "STAFF",
      initialQueueStatus: "WAITING",
    });

    await expect(
      transitionQueueEntry(db, receptionistUserId, clinicAId, queue1Id, "COMPLETED")
    ).rejects.toThrow("Cannot transition queue from WAITING to COMPLETED");
  });
});

describe("Receptionist Queue Parity: Data Visibility & Demographic Columns", () => {
  it("loads queue entries with complete patient demographics, appointment slot, and doctor details", async () => {
    const { db } = makeMockSupabase({ userRole: "STAFF" });

    const entries = await readQueueEntries(db, clinicAId, "2026-10-28");
    expect(entries).toHaveLength(1);

    const first = entries[0]!;
    expect(first.patient).toBeDefined();
    expect(first.patient?.first_name).toBe("Rahul");
    expect(first.patient?.last_name).toBe("Sharma");
    expect(first.patient?.patient_number).toBe("P-101");
    expect(first.patient?.phone).toBe("+919876543210");
    expect(first.patient?.gender).toBe("Male");
    expect(first.patient?.date_of_birth).toBe("1988-04-15");
    expect(first.patient?.email).toBe("rahul.sharma@example.com");
    expect(first.patient?.emergency_contact_name).toBe("Pooja Sharma");
    expect(first.doctor?.display_name).toBe("Dr. Asha Rao");
    expect(first.appointment?.scheduled_start).toBe("2026-10-28T09:00:00.000Z");
  });
});

describe("Receptionist Queue Parity: Search, Filter & Sort Logic", () => {
  const sampleEntries: QueueEntryWithDetails[] = [
    {
      id: "q-1",
      clinic_id: clinicAId,
      patient_id: "pat-1",
      doctor_profile_id: doctor1Id,
      appointment_id: "appt-1",
      queue_date: "2026-10-28",
      queue_number: 1,
      status: "COMPLETED",
      checked_in_at: "2026-10-28T08:30:00.000Z",
      called_at: "2026-10-28T09:00:00.000Z",
      consultation_started_at: "2026-10-28T09:05:00.000Z",
      completed_at: "2026-10-28T09:30:00.000Z",
      created_at: "2026-10-28T08:30:00.000Z",
      updated_at: "2026-10-28T09:30:00.000Z",
      patient: {
        id: "pat-1",
        first_name: "Aarav",
        last_name: "Patel",
        patient_number: "P-001",
        phone: "+919111111111",
        gender: "Male",
      },
      doctor: {
        id: doctor1Id,
        specialization: "General Physician",
        department: "Internal Medicine",
        user_id: "u-1",
        display_name: "Dr. Asha Rao",
      },
    },
    {
      id: "q-2",
      clinic_id: clinicAId,
      patient_id: "pat-2",
      doctor_profile_id: doctor1Id,
      appointment_id: "appt-2",
      queue_date: "2026-10-28",
      queue_number: 2,
      status: "WAITING",
      checked_in_at: "2026-10-28T09:15:00.000Z",
      called_at: null,
      consultation_started_at: null,
      completed_at: null,
      created_at: "2026-10-28T09:15:00.000Z",
      updated_at: "2026-10-28T09:15:00.000Z",
      patient: {
        id: "pat-2",
        first_name: "Deepa",
        last_name: "Kulkarni",
        patient_number: "P-042",
        phone: "+919222222222",
        gender: "Female",
      },
      doctor: {
        id: doctor1Id,
        specialization: "General Physician",
        department: "Internal Medicine",
        user_id: "u-1",
        display_name: "Dr. Asha Rao",
      },
    },
    {
      id: "q-3",
      clinic_id: clinicAId,
      patient_id: "pat-3",
      doctor_profile_id: doctor2Id,
      appointment_id: "appt-3",
      queue_date: "2026-10-28",
      queue_number: 3,
      status: "CALLED",
      checked_in_at: "2026-10-28T09:10:00.000Z",
      called_at: "2026-10-28T09:40:00.000Z",
      consultation_started_at: null,
      completed_at: null,
      created_at: "2026-10-28T09:10:00.000Z",
      updated_at: "2026-10-28T09:40:00.000Z",
      patient: {
        id: "pat-3",
        first_name: "Zoya",
        last_name: "Akhtar",
        patient_number: "P-099",
        phone: "+919333333333",
        gender: "Female",
      },
      doctor: {
        id: doctor2Id,
        specialization: "Pediatrics",
        department: "Child Health",
        user_id: "u-2",
        display_name: "Dr. Rohit Gupta",
      },
    },
  ];

  it("filters queue entries by patient name", () => {
    const term = "Deepa";
    const filtered = sampleEntries.filter((e) =>
      `${e.patient?.first_name} ${e.patient?.last_name}`.toLowerCase().includes(term.toLowerCase())
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.patient?.first_name).toBe("Deepa");
  });

  it("filters queue entries by patient ID", () => {
    const term = "P-042";
    const filtered = sampleEntries.filter((e) =>
      e.patient?.patient_number?.toLowerCase().includes(term.toLowerCase())
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe("q-2");
  });

  it("filters queue entries by queue number", () => {
    const term = "003";
    const filtered = sampleEntries.filter((e) =>
      formatQueueNumber(e.queue_number).includes(term)
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe("q-3");
  });

  it("filters queue entries by status WAITING", () => {
    const filtered = sampleEntries.filter((e) => e.status === "WAITING");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe("q-2");
  });

  it("sorts queue entries by check-in time earliest first", () => {
    const sorted = [...sampleEntries].sort(
      (a, b) =>
        new Date(a.checked_in_at!).getTime() - new Date(b.checked_in_at!).getTime()
    );
    expect(sorted[0]!.id).toBe("q-1"); // 08:30
    expect(sorted[1]!.id).toBe("q-3"); // 09:10
    expect(sorted[2]!.id).toBe("q-2"); // 09:15
  });

  it("sorts queue entries by patient name alphabetically", () => {
    const sorted = [...sampleEntries].sort((a, b) =>
      (a.patient?.first_name ?? "").localeCompare(b.patient?.first_name ?? "")
    );
    expect(sorted[0]!.patient?.first_name).toBe("Aarav");
    expect(sorted[1]!.patient?.first_name).toBe("Deepa");
    expect(sorted[2]!.patient?.first_name).toBe("Zoya");
  });
});
