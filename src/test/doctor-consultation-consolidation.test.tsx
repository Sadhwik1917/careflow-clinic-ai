import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { navigation, pageMetadata } from "@/lib/navigation";
import { routeTree } from "@/routeTree.gen";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  isValidQueueTransition,
  formatQueueNumber,
  getClinicLocalDate,
} from "@/lib/appointments";
import {
  callNextPatient,
  setDoctorDailyAvailability,
  requestDoctorLeave,
  assertClinicMemberWithRoles,
} from "@/lib/appointments.server";
import { DoctorDashboardView } from "@/components/careflow/doctor-dashboard-view";

afterEach(cleanup);

// Mock Link from tanstack router to render plain <a> elements for checking hrefs
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

const clinicId = "11111111-1111-4111-8111-111111111111";
const doctorId = "22222222-2222-4222-8222-222222222222";
const queueId = "44444444-4444-4444-8444-444444444444";
const userId = "66666666-6666-4666-8666-666666666666";

function makeMockDb(options: {
  role?: "OWNER" | "DOCTOR" | "STAFF";
  queueEntries?: any[];
  activePatient?: any;
  nextPatient?: any;
  leaveRow?: any;
} = {}) {
  const role = options.role ?? "DOCTOR";

  const db: any = {
    rpc: vi.fn(async (name: string) => {
      if (name === "clinic_is_operational") {
        return { data: true, error: null };
      }
      return { data: null, error: null };
    }),
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: userId,
                  platform_role: "USER",
                  status: "ACTIVE",
                },
                error: null,
              })),
              single: vi.fn(async () => ({
                data: {
                  id: userId,
                  platform_role: "USER",
                  status: "ACTIVE",
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
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    user_id: userId,
                    clinic_id: clinicId,
                    role,
                    status: "ACTIVE",
                  },
                  error: null,
                })),
                single: vi.fn(async () => ({
                  data: {
                    user_id: userId,
                    clinic_id: clinicId,
                    role,
                    status: "ACTIVE",
                  },
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      if (table === "clinics") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: clinicId,
                  name: "CareFlow Clinic",
                  status: "ACTIVE",
                },
                error: null,
              })),
              single: vi.fn(async () => ({
                data: {
                  id: clinicId,
                  name: "CareFlow Clinic",
                  status: "ACTIVE",
                },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "doctor_profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: doctorId,
                    clinic_id: clinicId,
                    user_id: userId,
                    specialization: "General Physician",
                    status: "ACTIVE",
                    availability: {},
                  },
                  error: null,
                })),
                single: vi.fn(async () => ({
                  data: {
                    id: doctorId,
                    clinic_id: clinicId,
                    user_id: userId,
                    specialization: "General Physician",
                    status: "ACTIVE",
                    availability: {},
                  },
                  error: null,
                })),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }

      if (table === "queue_entries") {
        return {
          select: vi.fn(() => {
            const builder: any = {
              eq: vi.fn(() => builder),
              order: vi.fn(() => builder),
              limit: vi.fn(() => builder),
              maybeSingle: vi.fn(async () => {
                if (options.activePatient) {
                  return { data: options.activePatient, error: null };
                }
                if (options.nextPatient) {
                  return { data: options.nextPatient, error: null };
                }
                return { data: null, error: null };
              }),
            };
            return builder;
          }),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: queueId,
                    status: "IN_CONSULTATION",
                    queue_number: 1,
                  },
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      if (table === "audit_logs") {
        return {
          insert: vi.fn(async () => ({ data: null, error: null })),
        };
      }

      if (table === "doctor_daily_availability") {
        return {
          upsert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  clinic_id: clinicId,
                  doctor_profile_id: doctorId,
                  date: "2026-10-30",
                  status: "AVAILABLE",
                },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "doctor_leaves") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: "leave-1",
                  clinic_id: clinicId,
                  doctor_profile_id: doctorId,
                  leave_date: "2026-11-05",
                  reason: "Attending medical symposium",
                  status: "PENDING",
                },
                error: null,
              })),
            })),
          })),
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    }),
  };

  return { db };
}

describe("Doctor Consultation and Queue Consolidation", () => {
  describe("Navigation Configuration", () => {
    it("removes /doctor/queue from Doctor navigation and preserves /doctor/consultations", () => {
      const doctorNav = navigation.DOCTOR;
      const paths = doctorNav.map((item) => item.path);

      expect(paths).not.toContain("/doctor/queue");
      expect(paths).toContain("/doctor/consultations");

      const consultItem = doctorNav.find((item) => item.path === "/doctor/consultations");
      expect(consultItem?.title).toBe("Consultations");

      // Verify the consolidated list of Doctor destinations
      expect(paths).toEqual([
        "/doctor/dashboard",
        "/doctor/appointments",
        "/doctor/patients",
        "/doctor/consultations",
        "/doctor/prescriptions",
        "/doctor/profile",
      ]);
    });

    it("preserves Queue navigation for clinic OWNER and STAFF roles", () => {
      const ownerPaths = navigation.OWNER.map((item) => item.path);
      const staffPaths = navigation.STAFF.map((item) => item.path);

      expect(ownerPaths).toContain("/clinic/queue");
      expect(staffPaths).toContain("/staff/queue");
    });

    it("provides accurate page metadata for the consolidated Consultations workspace", () => {
      const meta = pageMetadata("Consultations", "DOCTOR");
      expect(meta.meta[0]?.title).toBe("Consultations · Doctor — CAREFLOW AI");
      expect(meta.meta[1]?.content).toBe("CAREFLOW AI doctor consultations workspace.");
    });
  });

  describe("TanStack Route Tree Integration", () => {
    it("successfully matches /doctor/consultations route", () => {
      const router = createRouter({
        routeTree,
        context: { queryClient: new QueryClient() },
      });

      const matches = router.matchRoutes("/doctor/consultations");
      expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
      expect(matches.at(-1)?.routeId).toBe("/_authenticated/doctor/consultations");
    });

    it("does not match /doctor/queue route in the generated route tree", () => {
      const router = createRouter({
        routeTree,
        context: { queryClient: new QueryClient() },
      });

      const matches = router.matchRoutes("/doctor/queue");
      expect(matches.at(-1)?.routeId).not.toBe("/_authenticated/doctor/queue");
    });
  });

  describe("Doctor Dashboard View Consolidated Routing", () => {
    it("links header action, clinical shortcuts, and queue card to /doctor/consultations without any /doctor/queue links", () => {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
      });

      const todayStr = getClinicLocalDate(new Date(), "Asia/Kolkata");
      qc.setQueryData(["doctor-self-profile", clinicId], {
        id: doctorId,
        specialization: "Cardiology",
      });
      qc.setQueryData(["appointments", clinicId, todayStr], {
        rows: [],
        count: 0,
      });
      qc.setQueryData(["queue-entries", clinicId, todayStr], []);
      qc.setQueryData(["clinic-hours", clinicId], {
        timezone: "Asia/Kolkata",
      });

      render(
        <QueryClientProvider client={qc}>
          <DoctorDashboardView userId={userId} clinicId={clinicId} />
        </QueryClientProvider>
      );

      // Verify header button links to /doctor/consultations
      const consultButtons = screen.getAllByRole("link", { name: /consultation/i });
      expect(consultButtons.length).toBeGreaterThan(0);
      consultButtons.forEach((link) => {
        expect(link.getAttribute("href")).toBe("/doctor/consultations");
      });

      // Verify all rendered anchor tags: none must link to /doctor/queue
      const allLinks = screen.getAllByRole("link");
      const hrefs = allLinks.map((l) => l.getAttribute("href"));
      expect(hrefs).not.toContain("/doctor/queue");
      expect(hrefs).toContain("/doctor/consultations");
      expect(hrefs).toContain("/doctor/appointments");
      expect(hrefs).toContain("/doctor/prescriptions");
    });
  });

  describe("Doctor Queue and Consultation Progression Transitions", () => {
    it("allows valid forward queue status transitions for active clinical workflow", () => {
      // WAITING -> CALLED
      expect(isValidQueueTransition("WAITING", "CALLED")).toBe(true);
      // CALLED -> IN_CONSULTATION
      expect(isValidQueueTransition("CALLED", "IN_CONSULTATION")).toBe(true);
      // IN_CONSULTATION -> COMPLETED
      expect(isValidQueueTransition("IN_CONSULTATION", "COMPLETED")).toBe(true);
      // CALLED -> SKIPPED
      expect(isValidQueueTransition("CALLED", "SKIPPED")).toBe(true);
      // SKIPPED -> WAITING (return to queue)
      expect(isValidQueueTransition("SKIPPED", "WAITING")).toBe(true);
      // SKIPPED -> CALLED (call skipped patient)
      expect(isValidQueueTransition("SKIPPED", "CALLED")).toBe(true);
      // CALLED -> CANCELLED (no-show)
      expect(isValidQueueTransition("CALLED", "CANCELLED")).toBe(true);
    });

    it("disallows invalid or regressive queue status transitions", () => {
      // Cannot jump from WAITING straight to COMPLETED
      expect(isValidQueueTransition("WAITING", "COMPLETED")).toBe(false);
      // Cannot reopen COMPLETED queue entries
      expect(isValidQueueTransition("COMPLETED", "WAITING")).toBe(false);
      expect(isValidQueueTransition("COMPLETED", "IN_CONSULTATION")).toBe(false);
      // Cannot reopen CANCELLED entries
      expect(isValidQueueTransition("CANCELLED", "WAITING")).toBe(false);
    });

    it("formats sequential queue token numbers with standard 3-digit padding", () => {
      expect(formatQueueNumber(1)).toBe("001");
      expect(formatQueueNumber(25)).toBe("025");
      expect(formatQueueNumber(100)).toBe("100");
    });
  });

  describe("Server Actions Scoped to Doctor Profile", () => {
    it("verifies doctor role and active status in assertClinicMemberWithRoles", async () => {
      const { db } = makeMockDb({ role: "DOCTOR" });
      const member = await assertClinicMemberWithRoles(db, userId, clinicId, ["DOCTOR"]);
      expect(member.role).toBe("DOCTOR");
    });

    it("allows doctor to set daily appointment availability (Available / Busy)", async () => {
      const { db } = makeMockDb({ role: "DOCTOR" });
      const res = await setDoctorDailyAvailability(
        db,
        userId,
        clinicId,
        doctorId,
        "2026-10-30",
        "AVAILABLE"
      );
      expect(res.status).toBe("AVAILABLE");
      expect(res.date).toBe("2026-10-30");
    });

    it("allows doctor to submit planned leave request to clinic owner", async () => {
      const { db } = makeMockDb({ role: "DOCTOR" });
      const res = await requestDoctorLeave(
        db,
        userId,
        clinicId,
        doctorId,
        "2026-11-05",
        "Attending medical symposium"
      );
      expect(res.status).toBe("PENDING");
      expect(res.date).toBe("2026-11-05");
      expect(res.reason).toBe("Attending medical symposium");
    });

    it("prevents calling next patient when another patient is already in consultation", async () => {
      const activePatient = {
        id: queueId,
        clinic_id: clinicId,
        doctor_profile_id: doctorId,
        status: "IN_CONSULTATION",
        queue_number: 1,
      };

      const { db } = makeMockDb({
        role: "DOCTOR",
        activePatient,
      });

      await expect(
        callNextPatient(db, userId, clinicId, doctorId, "2026-10-30")
      ).rejects.toThrow("Please complete the current consultation before calling the next patient");
    });
  });
});
