import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReceptionistDashboardView } from "@/components/careflow/receptionist-dashboard-view";
import { createClinicAppointment } from "@/lib/appointments.functions";
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

const mockCreateAppointmentFn = vi.fn();

// Mock useServerFn
vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return {
    ...actual,
    useServerFn: (fn: any) => {
      if (fn === createClinicAppointment) return mockCreateAppointmentFn;
      return vi.fn();
    },
  };
});

const clinicId = "clinic-staff-1111";
const userId = "staff-user-2222";

let mockAppointmentsData = {
  rows: [] as any[],
  count: 0,
};

const mockDoctor = {
  id: "doc-1",
  clinic_id: clinicId,
  user_id: "doc-user-1",
  display_name: "Dr. Sarah Jenkins",
  specialization: "General Practice",
  department: "Outpatient",
  status: "ACTIVE",
};

const mockPatient = {
  id: "patient-1",
  clinic_id: clinicId,
  patient_number: "P-042",
  first_name: "Aarav",
  last_name: "Sharma",
  phone: "+919876543210",
  gender: "male",
  status: "ACTIVE",
};

const mockSlot = {
  start: "2026-11-02T10:00:00+05:30",
  end: "2026-11-02T11:00:00+05:30",
  timeLabel: "10:00 AM - 11:00 AM",
  available: true,
  booked_count: 0,
  capacity: 1,
};

vi.mock("@/lib/appointment-queries", () => ({
  appointmentsQuery: (_userId: string, clinicId: string, filters: any) => ({
    queryKey: ["appointments", clinicId, filters],
    queryFn: () => mockAppointmentsData,
  }),
  queueEntriesQuery: (_userId: string, clinicId: string, date: string) => ({
    queryKey: ["queue-entries", clinicId, date],
    queryFn: () => [],
  }),
  clinicHoursQuery: (_userId: string, clinicId: string) => ({
    queryKey: ["clinic-hours", clinicId],
    queryFn: () => ({ timezone: "Asia/Kolkata", working_hours: null }),
  }),
  clinicQueueDoctorsQuery: (_userId: string, clinicId: string, filters: any) => ({
    queryKey: ["clinic-queue-doctors", clinicId, filters],
    queryFn: () => ({ rows: [mockDoctor], count: 1 }),
  }),
  appointmentPatientsQuery: (_userId: string, clinicId: string, filters: any) => ({
    queryKey: ["appointment-patients", clinicId, filters],
    queryFn: () => ({ rows: [mockPatient], count: 1 }),
  }),
  doctorAvailabilityQuery: (_userId: string, clinicId: string, doctorProfileId: string, date: string) => ({
    queryKey: ["doctor-availability", clinicId, doctorProfileId, date],
    queryFn: () => ({
      doctor: mockDoctor,
      slots: [mockSlot],
      alternatives: [],
      clinicIsOpen: true,
      doctorAvailability: "AVAILABLE",
    }),
  }),
}));

vi.mock("@/lib/clinical-queries", () => ({
  clinicInvoicesQuery: (clinicId: string) => ({
    queryKey: ["clinic-invoices", clinicId],
    queryFn: () => [],
  }),
}));

describe("Staff Dashboard — Book Appointment Quick Action", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    vi.clearAllMocks();
    mockAppointmentsData = {
      rows: [],
      count: 0,
    };
    mockCreateAppointmentFn.mockResolvedValue({ id: "appt-new-999" });
  });

  it("renders the Staff Dashboard with Book Appointment quick-action button in header", () => {
    render(
      <QueryClientProvider client={qc}>
        <ReceptionistDashboardView userId={userId} clinicId={clinicId} />
      </QueryClientProvider>
    );

    expect(screen.getByText("Front-desk overview")).toBeDefined();
    const bookButtons = screen.getAllByRole("button", { name: /book appointment/i });
    expect(bookButtons.length).toBeGreaterThanOrEqual(1);

    // Verify it is NOT an anchor tag to /clinic/appointments/new
    bookButtons.forEach((btn) => {
      expect(btn.tagName).toBe("BUTTON");
      expect(btn.getAttribute("href")).toBeNull();
    });
  });

  it("opens booking modal when the header Book Appointment button is clicked", async () => {
    render(
      <QueryClientProvider client={qc}>
        <ReceptionistDashboardView userId={userId} clinicId={clinicId} />
      </QueryClientProvider>
    );

    const [headerBookBtn] = screen.getAllByRole("button", { name: /book appointment/i });
    fireEvent.click(headerBookBtn);

    await waitFor(() => {
      expect(screen.getByText("Schedule New Appointment")).toBeDefined();
      expect(
        screen.getByText(
          "Select a patient and doctor, choose an available time slot, and confirm the booking."
        )
      ).toBeDefined();
      expect(screen.getByText("Select Patient")).toBeDefined();
      expect(screen.getByText("Select Doctor")).toBeDefined();
    });
  });

  it("opens booking modal when EmptyState Book Appointment button is clicked", async () => {
    render(
      <QueryClientProvider client={qc}>
        <ReceptionistDashboardView userId={userId} clinicId={clinicId} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("No appointments scheduled today")).toBeDefined();
    });

    const bookButtons = screen.getAllByRole("button", { name: /book appointment/i });
    // Empty state button is the second one
    const emptyStateBookBtn = bookButtons[1];
    fireEvent.click(emptyStateBookBtn);

    await waitFor(() => {
      expect(screen.getByText("Schedule New Appointment")).toBeDefined();
    });
  });

  it("closes booking modal when cancel button is clicked", async () => {
    render(
      <QueryClientProvider client={qc}>
        <ReceptionistDashboardView userId={userId} clinicId={clinicId} />
      </QueryClientProvider>
    );

    const [headerBookBtn] = screen.getAllByRole("button", { name: /book appointment/i });
    fireEvent.click(headerBookBtn);

    await waitFor(() => {
      expect(screen.getByText("Schedule New Appointment")).toBeDefined();
    });

    const cancelBtn = screen.getByRole("button", { name: /^cancel$/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByText("Schedule New Appointment")).toBeNull();
    });
  });

  it("completes booking, displays feedback toast, closes dialog, and invalidates queries", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    render(
      <QueryClientProvider client={qc}>
        <ReceptionistDashboardView userId={userId} clinicId={clinicId} />
      </QueryClientProvider>
    );

    // Open booking modal
    const [headerBookBtn] = screen.getAllByRole("button", { name: /book appointment/i });
    fireEvent.click(headerBookBtn);

    await waitFor(() => {
      expect(screen.getByText("Schedule New Appointment")).toBeDefined();
    });

    // Select patient
    await waitFor(() => {
      expect(screen.getByText(/Aarav Sharma/i)).toBeDefined();
    });
    fireEvent.click(screen.getByText(/Aarav Sharma/i));

    // Select doctor
    await waitFor(() => {
      expect(screen.getByText("Dr. Sarah Jenkins")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Dr. Sarah Jenkins"));

    // Select available time slot
    await waitFor(() => {
      expect(screen.getByText("10:00 AM - 11:00 AM")).toBeDefined();
    });
    fireEvent.click(screen.getByText("10:00 AM - 11:00 AM"));

    // Confirm booking
    const confirmBtn = screen.getByRole("button", { name: /confirm appointment/i });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      // 1. Server function was called with correct clinic isolation
      expect(mockCreateAppointmentFn).toHaveBeenCalledWith({
        data: {
          clinicId,
          appointment: expect.objectContaining({
            patient_id: "patient-1",
            doctor_profile_id: "doc-1",
            scheduled_start: mockSlot.start,
            scheduled_end: mockSlot.end,
          }),
        },
      });

      // 2. Success toast feedback
      expect(toast.success).toHaveBeenCalledWith("Appointment scheduled successfully");

      // 3. Dialog closed
      expect(screen.queryByText("Schedule New Appointment")).toBeNull();

      // 4. Invalidation of appointments and queue queries
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["appointments", clinicId],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["queue-entries", clinicId],
      });
    });
  });
});
