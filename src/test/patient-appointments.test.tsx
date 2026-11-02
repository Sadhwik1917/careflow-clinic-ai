import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createPatientAppointment,
  createAppointment,
  readDoctorAvailability,
} from "@/lib/appointments.server";
import { PatientAppointmentsView } from "@/components/careflow/patient-appointments-view";
import { PatientAppointmentBookingDialog } from "@/components/careflow/patient-appointment-booking-dialog";
import { DOCTOR_SLOT_CAPACITY } from "@/lib/appointments";
import { toast } from "@/lib/toast";

afterEach(cleanup);

// Mock Link and useNavigate from @tanstack/react-router
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router"
  );
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
    useNavigate: () => vi.fn(),
  };
});

// Mock toast
vi.mock("@/lib/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const clinicId = "11111111-1111-4111-8111-111111111111";
const doctorId = "22222222-2222-4222-8222-222222222222";
const patientId = "33333333-3333-4333-8333-333333333333";
const otherPatientId = "33333333-3333-4333-8333-999999999999";
const userId = "44444444-4444-4444-8444-444444444444";
const otherUserId = "44444444-4444-4444-8444-888888888888";
const appointmentId = "55555555-5555-4555-8555-555555555555";

type FakeDbOptions = {
  profileStatus?: "ACTIVE" | "SUSPENDED";
  operational?: boolean;
  patientUserId?: string;
  patientStatus?: "ACTIVE" | "INACTIVE";
  patientExists?: boolean;
  doctorStatus?: "ACTIVE" | "INACTIVE" | "ON_LEAVE";
  doctorBusy?: boolean;
  doctorLeave?: boolean;
  closedDates?: string[];
  bookedCount?: number;
  hasPatientConflict?: boolean;
  concurrencyViolation?: boolean;
};

function createPatientMockDb(options: FakeDbOptions = {}) {
  const calls: [string, unknown[]][] = [];
  const auditLogs: unknown[] = [];
  const deletedAppointments: string[] = [];
  let countCallIndex = 0;

  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const neqFilters: Record<string, unknown> = {};

    let isDelete = false;
    const chain: Record<string, unknown> = {};
    for (const m of [
      "select",
      "insert",
      "update",
      "delete",
      "order",
      "or",
      "eq",
      "neq",
      "gte",
      "lte",
      "limit",
    ]) {
      chain[m] = (...args: unknown[]) => {
        calls.push([`${table}.${m}`, args]);
        if (m === "delete") {
          isDelete = true;
        }
        if (m === "eq") {
          filters[String(args[0])] = args[1];
          if (isDelete && table === "appointments" && args[0] === "id") {
            deletedAppointments.push(String(args[1]));
          }
        }
        if (m === "neq") neqFilters[String(args[0])] = args[1];
        if (m === "insert") {
          if (table === "audit_logs") auditLogs.push(args[0]);
        }
        return chain;
      };
    }

    chain["single"] = async () => {
      if (table === "appointments") {
        return {
          data: {
            id: appointmentId,
            clinic_id: clinicId,
            patient_id: filters["patient_id"] ?? patientId,
            doctor_profile_id: filters["doctor_profile_id"] ?? doctorId,
            scheduled_start: filters["scheduled_start"] ?? "2026-11-10T10:00:00.000Z",
            scheduled_end: filters["scheduled_end"] ?? "2026-11-10T11:00:00.000Z",
            status: "SCHEDULED",
            appointment_type: "CONSULTATION",
          },
          error: null,
        };
      }
      return { data: null, error: new Error("Not found") };
    };

    chain["maybeSingle"] = async () => {
      if (table === "profiles") {
        return {
          data: {
            platform_role: "USER",
            status: options.profileStatus ?? "ACTIVE",
          },
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
      if (table === "patients") {
        if (options.patientExists === false) {
          return { data: null, error: null };
        }
        return {
          data: {
            id: filters["id"] ?? patientId,
            clinic_id: clinicId,
            user_id: options.patientUserId ?? userId,
            status: options.patientStatus ?? "ACTIVE",
          },
          error: null,
        };
      }
      if (table === "doctor_profiles") {
        const avail: Record<string, unknown> = {};
        if (options.doctorBusy) {
          avail["daily_overrides"] = { "2026-11-10": "BUSY" };
        }
        if (options.doctorLeave) {
          avail["leaves"] = [{ date: "2026-11-10", status: "APPROVED" }];
        }

        return {
          data: {
            id: doctorId,
            clinic_id: clinicId,
            specialization: "General Medicine",
            status: options.doctorStatus ?? "ACTIVE",
            availability: avail,
            user_id: "doctor-user-id",
          },
          error: null,
        };
      }
      if (table === "appointments") {
        if (filters["scheduled_start"] && filters["patient_id"]) {
          if (options.hasPatientConflict) {
            return {
              data: {
                id: "conflict-appt-id",
                clinic_id: clinicId,
                patient_id: filters["patient_id"],
                scheduled_start: filters["scheduled_start"],
                status: "SCHEDULED",
              },
              error: null,
            };
          }
          return { data: null, error: null };
        }
        return { data: null, error: null };
      }
      return { data: null, error: null };
    };

    // For count operations (capacity checks)
    chain["then"] = (resolve: (val: any) => void) => {
      if (table === "appointments") {
        countCallIndex++;
        let count = options.bookedCount ?? 0;
        if (options.concurrencyViolation && countCallIndex > 1) {
          count = DOCTOR_SLOT_CAPACITY + 1;
        }
        resolve({ count, data: [], error: null });
        return;
      }
      resolve({ data: [], count: 0, error: null });
    };

    return chain;
  };

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    calls.push([`rpc.${fn}`, [args]]);
    if (fn === "clinic_is_operational") {
      return { data: options.operational !== false, error: null };
    }
    if (fn === "clinic_member_names") {
      return { data: [], error: null };
    }
    return { data: null, error: null };
  };

  return {
    db: { from, rpc } as unknown as SupabaseClient<Database>,
    calls,
    auditLogs,
    deletedAppointments,
  };
}

describe("Patient Appointment Creation — Authorization & Security (Server)", () => {
  it("rejects booking if caller profile is suspended or inactive", async () => {
    const { db } = createPatientMockDb({ profileStatus: "SUSPENDED" });

    await expect(
      createPatientAppointment(db, userId, clinicId, {
        doctor_profile_id: doctorId,
        scheduled_start: "2026-11-10T09:00:00.000Z",
        scheduled_end: "2026-11-10T10:00:00.000Z",
      })
    ).rejects.toThrow("Authentication required to schedule an appointment.");
  });

  it("rejects booking if clinic is not operational", async () => {
    const { db } = createPatientMockDb({ operational: false });

    await expect(
      createPatientAppointment(db, userId, clinicId, {
        doctor_profile_id: doctorId,
        scheduled_start: "2026-11-10T09:00:00.000Z",
        scheduled_end: "2026-11-10T10:00:00.000Z",
      })
    ).rejects.toThrow("Clinic is not currently operational.");
  });

  it("allows patient to book ONLY for their own patient profile", async () => {
    // Other patient profile owned by someone else
    const { db } = createPatientMockDb({ patientUserId: otherUserId });

    await expect(
      createPatientAppointment(db, userId, clinicId, {
        patient_id: otherPatientId,
        doctor_profile_id: doctorId,
        scheduled_start: "2026-11-10T09:00:00.000Z",
        scheduled_end: "2026-11-10T10:00:00.000Z",
      })
    ).rejects.toThrow("Patients may only book appointments for their own profile.");
  });

  it("rejects booking if patient profile is not found in the clinic", async () => {
    const { db } = createPatientMockDb({ patientExists: false });

    await expect(
      createPatientAppointment(db, userId, clinicId, {
        patient_id: patientId,
        doctor_profile_id: doctorId,
        scheduled_start: "2026-11-10T09:00:00.000Z",
        scheduled_end: "2026-11-10T10:00:00.000Z",
      })
    ).rejects.toThrow("Patient not found in this clinic.");
  });

  it("auto-resolves caller's patient profile when patient_id is not provided", async () => {
    const { db, auditLogs } = createPatientMockDb({ patientUserId: userId });

    const appt = await createPatientAppointment(db, userId, clinicId, {
      doctor_profile_id: doctorId,
      scheduled_start: "2026-11-10T09:00:00.000Z",
      scheduled_end: "2026-11-10T10:00:00.000Z",
      appointment_type: "CONSULTATION",
      reason: "General consultation",
    });

    expect(appt).toBeDefined();
    expect(appt.patient_id).toBe(patientId);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      action: "APPOINTMENT_CREATED",
      clinic_id: clinicId,
      user_id: userId,
    });
  });
});

describe("Patient Appointment Creation — Clinic & Doctor Validation (Server)", () => {
  it("rejects booking when clinic is closed on target date", async () => {
    const { db } = createPatientMockDb({ closedDates: ["2026-11-10"] });

    await expect(
      createPatientAppointment(db, userId, clinicId, {
        patient_id: patientId,
        doctor_profile_id: doctorId,
        scheduled_start: "2026-11-10T09:00:00.000Z",
        scheduled_end: "2026-11-10T10:00:00.000Z",
      })
    ).rejects.toThrow("Clinic is marked closed on this date.");
  });

  it("rejects booking when doctor is inactive or on leave", async () => {
    const { db: inactiveDb } = createPatientMockDb({ doctorStatus: "INACTIVE" });
    await expect(
      createPatientAppointment(inactiveDb, userId, clinicId, {
        patient_id: patientId,
        doctor_profile_id: doctorId,
        scheduled_start: "2026-11-10T09:00:00.000Z",
        scheduled_end: "2026-11-10T10:00:00.000Z",
      })
    ).rejects.toThrow("Doctor is currently inactive.");

    const { db: leaveDb } = createPatientMockDb({ doctorStatus: "ON_LEAVE" });
    await expect(
      createPatientAppointment(leaveDb, userId, clinicId, {
        patient_id: patientId,
        doctor_profile_id: doctorId,
        scheduled_start: "2026-11-10T09:00:00.000Z",
        scheduled_end: "2026-11-10T10:00:00.000Z",
      })
    ).rejects.toThrow("Doctor is currently on leave.");
  });

  it("rejects booking when doctor is marked BUSY on that date", async () => {
    const { db } = createPatientMockDb({ doctorBusy: true });

    await expect(
      createPatientAppointment(db, userId, clinicId, {
        patient_id: patientId,
        doctor_profile_id: doctorId,
        scheduled_start: "2026-11-10T09:00:00.000Z",
        scheduled_end: "2026-11-10T10:00:00.000Z",
      })
    ).rejects.toThrow("Doctor is marked busy on this date.");
  });

  it("rejects booking when doctor has approved leave on that date", async () => {
    const { db } = createPatientMockDb({ doctorLeave: true });

    await expect(
      createPatientAppointment(db, userId, clinicId, {
        patient_id: patientId,
        doctor_profile_id: doctorId,
        scheduled_start: "2026-11-10T09:00:00.000Z",
        scheduled_end: "2026-11-10T10:00:00.000Z",
      })
    ).rejects.toThrow("Doctor is on approved leave on this date.");
  });
});

describe("Patient Appointment Creation — Slot Capacity & Conflict Enforcement (Server)", () => {
  it("enforces slot capacity limit of 6 and rejects the 7th booking", async () => {
    const { db } = createPatientMockDb({ bookedCount: DOCTOR_SLOT_CAPACITY });

    await expect(
      createPatientAppointment(db, userId, clinicId, {
        patient_id: patientId,
        doctor_profile_id: doctorId,
        scheduled_start: "2026-11-10T09:00:00.000Z",
        scheduled_end: "2026-11-10T10:00:00.000Z",
      })
    ).rejects.toThrow(`maximum capacity (${DOCTOR_SLOT_CAPACITY} appointments)`);
  });

  it("rolls back appointment if concurrent requests exceed capacity after insert", async () => {
    const { db, deletedAppointments } = createPatientMockDb({
      bookedCount: 5,
      concurrencyViolation: true,
    });

    await expect(
      createPatientAppointment(db, userId, clinicId, {
        patient_id: patientId,
        doctor_profile_id: doctorId,
        scheduled_start: "2026-11-10T09:00:00.000Z",
        scheduled_end: "2026-11-10T10:00:00.000Z",
      })
    ).rejects.toThrow(`maximum capacity (${DOCTOR_SLOT_CAPACITY} appointments)`);

    expect(deletedAppointments).toContain(appointmentId);
  });

  it("strictly prevents conflicting double-booking for the same patient at the same time", async () => {
    const { db } = createPatientMockDb({ hasPatientConflict: true });

    await expect(
      createPatientAppointment(db, userId, clinicId, {
        patient_id: patientId,
        doctor_profile_id: doctorId,
        scheduled_start: "2026-11-10T09:00:00.000Z",
        scheduled_end: "2026-11-10T10:00:00.000Z",
      })
    ).rejects.toThrow("This patient already has an appointment booked at this time.");
  });

  it("allows successful appointment booking when slot is available and valid", async () => {
    const { db, auditLogs } = createPatientMockDb({ bookedCount: 2 });

    const appt = await createPatientAppointment(db, userId, clinicId, {
      patient_id: patientId,
      doctor_profile_id: doctorId,
      scheduled_start: "2026-11-10T09:00:00.000Z",
      scheduled_end: "2026-11-10T10:00:00.000Z",
      appointment_type: "CONSULTATION",
      reason: "Persistent fever",
      notes: "Previous allergy to penicillin",
    });

    expect(appt).toBeDefined();
    expect(appt.status).toBe("SCHEDULED");
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      action: "APPOINTMENT_CREATED",
      clinic_id: clinicId,
      user_id: userId,
    });
  });
});

describe("Patient Appointments View & Booking Dialog (Frontend UI)", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    vi.clearAllMocks();
  });

  it("renders header with Book Appointment action and tab controls", () => {
    render(
      <QueryClientProvider client={qc}>
        <PatientAppointmentsView userId={userId} clinicId={clinicId} />
      </QueryClientProvider>
    );

    expect(screen.getByText("My Appointments")).toBeDefined();
    expect(screen.getByRole("button", { name: /book appointment/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /upcoming/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /past visits/i })).toBeDefined();
  });

  it("renders empty state with Book an Appointment action when upcoming appointments are empty", () => {
    qc.setQueryData(["patient-appointments", clinicId], []);
    render(
      <QueryClientProvider client={qc}>
        <PatientAppointmentsView userId={userId} clinicId={clinicId} />
      </QueryClientProvider>
    );

    expect(screen.getByText("No upcoming appointments")).toBeDefined();
    expect(screen.getByRole("button", { name: /book an appointment/i })).toBeDefined();
  });

  it("opens booking dialog when Book Appointment button is clicked", async () => {
    render(
      <QueryClientProvider client={qc}>
        <PatientAppointmentsView userId={userId} clinicId={clinicId} />
      </QueryClientProvider>
    );

    const bookBtn = screen.getByRole("button", { name: /^book appointment$/i });
    fireEvent.click(bookBtn);

    await waitFor(() => {
      expect(screen.getByText("Book New Appointment")).toBeDefined();
      expect(screen.getByText("Select Doctor")).toBeDefined();
    });
  });

  it("renders booking dialog with locked patient profile and disabled confirm button before selection", () => {
    render(
      <QueryClientProvider client={qc}>
        <PatientAppointmentBookingDialog
          open={true}
          onOpenChange={vi.fn()}
          userId={userId}
          clinicId={clinicId}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText("Book New Appointment")).toBeDefined();
    expect(screen.getByText("Patient Profile")).toBeDefined();

    const confirmBtn = screen.getByRole("button", { name: /confirm booking/i });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
  });
});
