import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  assertPatientStaff,
  readPatients,
  readPatient,
  insertPatient,
  editPatient,
} from "@/lib/patients.server";
import { StaffPatientsView } from "@/components/careflow/staff-patients-view";
import {
  emptyPatientForm,
  patientFieldsSchema,
  registrationSchema,
  type Patient,
} from "@/lib/patients";
import { toast } from "@/lib/toast";
import {
  registerStaffPatient,
  updateStaffPatient,
} from "@/lib/patients.functions";

afterEach(cleanup);

// Mock Link and useNavigate from @tanstack/react-router
const mockNavigate = vi.fn();
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
    useNavigate: () => mockNavigate,
  };
});

// Mock toast
vi.mock("@/lib/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

let mockQueryData = {
  rows: [] as Patient[],
  count: 0,
};

vi.mock("@/lib/patient-queries", () => ({
  staffPatientsQuery: (userId: string, clinicId: string, filters: any) => ({
    queryKey: ["staff-patients", userId, clinicId, filters],
    queryFn: () => mockQueryData,
  }),
}));

const mockRegisterFn = vi.fn();
const mockUpdateFn = vi.fn();

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return {
    ...actual,
    useServerFn: (fn: any) => {
      if (fn === registerStaffPatient) return mockRegisterFn;
      if (fn === updateStaffPatient) return mockUpdateFn;
      return (args: any) => {
        if (args?.data?.patientId) {
          return mockUpdateFn(args);
        }
        return mockRegisterFn(args);
      };
    },
  };
});

const patientRow1: Patient = {
  id: "p1",
  clinic_id: "c1",
  patient_number: "P-001",
  first_name: "Meera",
  last_name: "Iyer",
  date_of_birth: "1990-05-15",
  gender: "Female",
  phone: "+919876543210",
  email: "meera@example.com",
  address: "123 Main St",
  emergency_contact_name: "Rajesh Iyer",
  emergency_contact_phone: "+919876543211",
  notes: "Penicillin allergy",
  status: "ACTIVE",
  user_id: null,
  created_at: "2026-10-22T00:00:00Z",
  updated_at: "2026-10-22T00:00:00Z",
};

const patientRow2: Patient = {
  id: "p2",
  clinic_id: "c1",
  patient_number: "P-002",
  first_name: "Aarav",
  last_name: "Sharma",
  date_of_birth: "1985-08-20",
  gender: "Male",
  phone: "+919123456789",
  email: "aarav@example.com",
  address: "456 Oak Rd",
  emergency_contact_name: "Pooja Sharma",
  emergency_contact_phone: "+919123456780",
  notes: "Hypertension",
  status: "ACTIVE",
  user_id: null,
  created_at: "2026-10-23T00:00:00Z",
  updated_at: "2026-10-23T00:00:00Z",
};

const patientRowOtherClinic: Patient = {
  id: "p_other",
  clinic_id: "c2",
  patient_number: "P-999",
  first_name: "Foreign",
  last_name: "Patient",
  date_of_birth: "1992-02-02",
  gender: "Other",
  phone: "+919999988888",
  email: "foreign@example.com",
  address: "Far Away",
  emergency_contact_name: null,
  emergency_contact_phone: null,
  notes: null,
  status: "ACTIVE",
  user_id: null,
  created_at: "2026-10-20T00:00:00Z",
  updated_at: "2026-10-20T00:00:00Z",
};

function createMockSupabase(
  options: {
    role?: string;
    platformRole?: string;
    profileStatus?: string;
    memberStatus?: string;
    operational?: boolean;
    error?: { code: string; message: string };
    stale?: boolean;
  } = {}
) {
  const calls: [string, unknown[]][] = [];

  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {};

    for (const method of ["select", "insert", "update", "order", "or", "eq", "in", "range"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push([`${table}.${method}`, args]);
        if (method === "eq") {
          filters[String(args[0])] = args[1];
        }
        if (method === "insert") {
          filters["inserted"] = args[0];
          filters["clinic_id"] = (args[0] as { clinic_id: string }).clinic_id;
        }
        if (method === "update") {
          filters["updated"] = args[0];
        }
        return chain;
      };
    }

    const executeResult = () => {
      if (options.error) {
        return { data: null, error: options.error };
      }
      if (table === "profiles") {
        return {
          data: {
            platform_role: options.platformRole ?? "USER",
            status: options.profileStatus ?? "ACTIVE",
          },
          error: null,
        };
      }
      if (table === "clinic_members") {
        if (filters["clinic_id"] !== "c1") return { data: null, error: null };
        return {
          data: {
            role: options.role ?? "STAFF",
            status: options.memberStatus ?? "ACTIVE",
          },
          error: null,
        };
      }
      if (table === "patients") {
        if (filters["updated"]) {
          if (options.stale || filters["clinic_id"] !== "c1" || filters["id"] !== patientRow1.id) {
            return { data: null, error: null };
          }
          return { data: { ...patientRow1, ...(filters["updated"] as object) }, error: null };
        }
        const p = [patientRow1, patientRow2, patientRowOtherClinic].find(
          (row) => row.id === filters["id"] && row.clinic_id === filters["clinic_id"]
        );
        return { data: p ?? null, error: null };
      }
      return { data: null, error: null };
    };

    chain["maybeSingle"] = async () => executeResult();
    chain["single"] = async () => {
      if (options.error) return { data: null, error: options.error };
      if (table === "patients" && filters["inserted"]) {
        return {
          data: {
            id: "p_new",
            ...(filters["inserted"] as object),
            created_at: "2026-11-02T00:00:00Z",
            updated_at: "2026-11-02T00:00:00Z",
          },
          error: null,
        };
      }
      return executeResult();
    };

    chain["range"] = async (...args: unknown[]) => {
      calls.push([`${table}.range`, args]);
      if (options.error) return { data: null, count: 0, error: options.error };
      if (filters["clinic_id"] === "c1") {
        return {
          data: [patientRow1, patientRow2],
          count: 2,
          error: null,
        };
      }
      return { data: [], count: 0, error: null };
    };

    return chain;
  };

  const rpc = vi.fn(async (fnName: string) => {
    if (fnName === "clinic_is_operational") {
      return { data: options.operational !== false, error: null };
    }
    return { data: null, error: null };
  });

  return { db: { from, rpc } as unknown as SupabaseClient<Database>, calls, rpc };
}

function renderStaffPatientsView(
  props: {
    userId?: string;
    clinicId?: string;
    filters?: { search: string; page: number };
  } = {}
) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const userId = props.userId ?? "u_staff_1";
  const clinicId = props.clinicId ?? "c1";
  const filters = props.filters ?? { search: "", page: 0 };

  qc.setQueryData(["staff-patients", userId, clinicId, filters], mockQueryData);

  const utils = render(
    <QueryClientProvider client={qc}>
      <StaffPatientsView userId={userId} clinicId={clinicId} filters={filters} />
    </QueryClientProvider>
  );

  return { ...utils, queryClient: qc };
}

describe("Staff Patients — Server Authorization & Data Scoping", () => {
  describe("assertPatientStaff", () => {
    it("authorizes an active STAFF member in an operational clinic", async () => {
      const { db } = createMockSupabase();
      await expect(assertPatientStaff(db, "u1", "c1")).resolves.toBeUndefined();
    });

    it.each(["OWNER", "DOCTOR", "PATIENT"])(
      "refuses role %s on the staff patient workflow",
      async (role) => {
        const { db } = createMockSupabase({ role });
        await expect(assertPatientStaff(db, "u1", "c1")).rejects.toThrow("unavailable");
      }
    );

    it("refuses callers with PLATFORM_ADMIN platform role", async () => {
      const { db } = createMockSupabase({ platformRole: "PLATFORM_ADMIN" });
      await expect(assertPatientStaff(db, "u1", "c1")).rejects.toThrow("unavailable");
    });

    it("refuses suspended staff members", async () => {
      const { db } = createMockSupabase({ memberStatus: "SUSPENDED" });
      await expect(assertPatientStaff(db, "u1", "c1")).rejects.toThrow("unavailable");
    });

    it("refuses when the clinic is not operational", async () => {
      const { db } = createMockSupabase({ operational: false });
      await expect(assertPatientStaff(db, "u1", "c1")).rejects.toThrow("unavailable");
    });

    it("refuses when member does not belong to the requested clinic", async () => {
      const { db } = createMockSupabase();
      await expect(assertPatientStaff(db, "u1", "c2")).rejects.toThrow("unavailable");
    });
  });

  describe("readPatients (scoped to clinic)", () => {
    it("lists clinic patients with exact count, clinic scope, and range pagination", async () => {
      const { db, calls } = createMockSupabase();
      const result = await readPatients(db, "c1", { search: "", page: 0 });

      expect(result.count).toBe(2);
      expect(result.rows).toHaveLength(2);
      expect(calls).toContainEqual(["patients.eq", ["clinic_id", "c1"]]);
      expect(calls).toContainEqual(["patients.range", [0, 19]]);
    });

    it("scopes strictly to the clinic and returns empty for unrelated clinic", async () => {
      const { db } = createMockSupabase();
      const result = await readPatients(db, "c_unrelated", { search: "", page: 0 });

      expect(result.count).toBe(0);
      expect(result.rows).toHaveLength(0);
    });

    it("applies search tokens across patient name and number", async () => {
      const { db, calls } = createMockSupabase();
      await readPatients(db, "c1", { search: "Meera Iyer", page: 0 });

      const orCalls = calls.filter(([method]) => method === "patients.or");
      expect(orCalls.length).toBe(2);
      expect(orCalls[0]?.[1]?.[0]).toContain("first_name.ilike.%Meera%");
      expect(orCalls[1]?.[1]?.[0]).toContain("first_name.ilike.%Iyer%");
    });
  });

  describe("readPatient", () => {
    it("returns patient when belonging to caller's clinic", async () => {
      const { db } = createMockSupabase();
      const patient = await readPatient(db, "c1", "p1");
      expect(patient).toBeDefined();
      expect(patient?.id).toBe("p1");
      expect(patient?.clinic_id).toBe("c1");
    });

    it("returns null when attempting to read patient from another clinic", async () => {
      const { db } = createMockSupabase();
      const patient = await readPatient(db, "c1", "p_other");
      expect(patient).toBeNull();
    });
  });

  describe("insertPatient", () => {
    it("inserts patient with verified clinicId, status ACTIVE, and null user_id", async () => {
      const { db, calls } = createMockSupabase();
      const input = {
        ...emptyPatientForm,
        patient_number: "P-100",
        first_name: "Kavita",
        phone: "+919876543299",
      };
      const result = await insertPatient(db, "c1", input);

      expect(result).toBeDefined();
      expect(calls).toContainEqual([
        "patients.insert",
        [
          expect.objectContaining({
            clinic_id: "c1",
            patient_number: "P-100",
            first_name: "Kavita",
            status: "ACTIVE",
            user_id: null,
          }),
        ],
      ]);
    });

    it("maps 23505 unique constraint violation to duplicate patient number error", async () => {
      const { db } = createMockSupabase({
        error: { code: "23505", message: "duplicate key value" },
      });
      const input = {
        ...emptyPatientForm,
        patient_number: "P-001",
        first_name: "Duplicate",
      };
      await expect(insertPatient(db, "c1", input)).rejects.toThrow("already registered");
    });
  });

  describe("editPatient", () => {
    it("updates patient fields with OCC updated_at guard", async () => {
      const { db, calls } = createMockSupabase();
      const { patient_number, ...editableFields } = {
        ...emptyPatientForm,
        first_name: "Meera Updated",
        phone: "+919876543299",
      };
      const result = await editPatient(db, "c1", "p1", patientRow1.updated_at, editableFields);

      expect(result).toBeDefined();
      expect(calls).toContainEqual(["patients.update", [patientFieldsSchema.parse(editableFields)]]);
      expect(calls).toContainEqual(["patients.eq", ["clinic_id", "c1"]]);
      expect(calls).toContainEqual(["patients.eq", ["id", "p1"]]);
      expect(calls).toContainEqual(["patients.eq", ["updated_at", patientRow1.updated_at]]);
    });

    it("rejects cross-clinic updates or stale profile modifications", async () => {
      const { db } = createMockSupabase();
      const { patient_number, ...editableFields } = {
        ...emptyPatientForm,
        first_name: "Hacked",
      };
      await expect(
        editPatient(db, "c2", "p1", patientRow1.updated_at, editableFields)
      ).rejects.toThrow("Reload");

      const { db: staleDb } = createMockSupabase({ stale: true });
      await expect(
        editPatient(staleDb, "c1", "p1", "stale_timestamp", editableFields)
      ).rejects.toThrow("Reload");
    });
  });
});

describe("StaffPatientsView Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryData = {
      rows: [patientRow1, patientRow2],
      count: 2,
    };
  });

  it("renders page title, registration action, and patient directory table", () => {
    renderStaffPatientsView();

    expect(screen.getByRole("heading", { level: 1, name: "Patients" })).toBeInTheDocument();
    expect(screen.getByText("2 patients")).toBeInTheDocument();
    expect(screen.getByText("Meera Iyer")).toBeInTheDocument();
    expect(screen.getByText("P-001")).toBeInTheDocument();
    expect(screen.getByText("Aarav Sharma")).toBeInTheDocument();
    expect(screen.getByText("P-002")).toBeInTheDocument();
  });

  it("renders search input and triggers search navigation on submit", () => {
    renderStaffPatientsView();

    const searchInput = screen.getByLabelText("Search patients");
    expect(searchInput).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "Aarav" } });
    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/staff/patients",
      search: { search: "Aarav", page: 0 },
    });
  });

  it("shows clear button when search filter is active and clears search on click", () => {
    renderStaffPatientsView({ filters: { search: "Meera", page: 0 } });

    const clearButton = screen.getByRole("button", { name: "Clear" });
    expect(clearButton).toBeInTheDocument();

    fireEvent.click(clearButton);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/staff/patients",
      search: { search: "", page: 0 },
    });
  });

  it("renders empty state when search produces no matching patients", () => {
    mockQueryData = { rows: [], count: 0 };
    renderStaffPatientsView({ filters: { search: "NonExistent", page: 0 } });

    expect(screen.getByText("No matching patients")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
  });

  it("renders empty state when clinic has no registered patients with register button", () => {
    mockQueryData = { rows: [], count: 0 };
    renderStaffPatientsView({ filters: { search: "", page: 0 } });

    expect(screen.getByText("No patients registered")).toBeInTheDocument();
    const registerButtons = screen.getAllByRole("button", { name: /Register patient/i });
    expect(registerButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("opens register patient dialog when Register Patient button is clicked", () => {
    renderStaffPatientsView();

    const registerButton = screen.getAllByRole("button", { name: /Register patient/i })[0];
    fireEvent.click(registerButton!);

    expect(screen.getByRole("heading", { level: 2, name: "Register new patient" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Patient number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/First name/i)).toBeInTheDocument();
  });

  it("registers a new patient successfully through the modal form", async () => {
    mockRegisterFn.mockResolvedValueOnce({
      ...patientRow1,
      id: "p_new",
      patient_number: "P-100",
      first_name: "Devi",
      last_name: "Patel",
    });

    renderStaffPatientsView();

    const registerButton = screen.getAllByRole("button", { name: /Register patient/i })[0];
    fireEvent.click(registerButton!);

    fireEvent.change(screen.getByLabelText(/Patient number/i), {
      target: { value: "P-100" },
    });
    fireEvent.change(screen.getByLabelText(/First name/i), {
      target: { value: "Devi" },
    });

    const submitButton = screen.getByRole("button", { name: "Register patient" });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockRegisterFn).toHaveBeenCalledWith({
        data: {
          clinicId: "c1",
          fields: expect.objectContaining({
            patient_number: "P-100",
            first_name: "Devi",
          }),
        },
      });
      expect(toast.success).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Patient registered",
        })
      );
    });
  });

  it("opens patient details dialog when View details is clicked", () => {
    renderStaffPatientsView();

    const viewDetailsButtons = screen.getAllByRole("button", { name: /View details/i });
    fireEvent.click(viewDetailsButtons[0]!);

    expect(screen.getByText("Patient #P-001")).toBeInTheDocument();
    expect(screen.getByText("Penicillin allergy")).toBeInTheDocument();
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
    expect(screen.getByText("Rajesh Iyer (+919876543211)")).toBeInTheDocument();

    // Verify workflow navigation links
    expect(screen.getByRole("link", { name: /Appointments/i })).toHaveAttribute(
      "href",
      "/staff/appointments"
    );
    expect(screen.getByRole("link", { name: /Queue/i })).toHaveAttribute(
      "href",
      "/staff/queue"
    );
  });

  it("switches to edit mode and saves profile changes", async () => {
    mockUpdateFn.mockResolvedValueOnce({
      ...patientRow1,
      first_name: "Meera",
      last_name: "Iyer-Sharma",
    });

    renderStaffPatientsView();

    const viewDetailsButtons = screen.getAllByRole("button", { name: /View details/i });
    fireEvent.click(viewDetailsButtons[0]!);

    const editButton = screen.getByRole("button", { name: /Edit profile/i });
    fireEvent.click(editButton);

    expect(screen.getByRole("heading", { level: 2, name: /Edit patient:/i })).toBeInTheDocument();

    const lastNameInput = screen.getByLabelText(/Last name/i);
    fireEvent.change(lastNameInput, { target: { value: "Iyer-Sharma" } });

    const saveButton = screen.getByRole("button", { name: "Save changes" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateFn).toHaveBeenCalledWith({
        data: {
          clinicId: "c1",
          patientId: "p1",
          updatedAt: patientRow1.updated_at,
          fields: expect.objectContaining({
            last_name: "Iyer-Sharma",
          }),
        },
      });
      expect(toast.success).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Patient updated",
        })
      );
    });
  });

  it("closes details dialog when Dismiss is clicked", () => {
    renderStaffPatientsView();

    const viewDetailsButtons = screen.getAllByRole("button", { name: /View details/i });
    fireEvent.click(viewDetailsButtons[0]!);

    expect(screen.getByText("Patient #P-001")).toBeInTheDocument();

    const dismissButton = screen.getByRole("button", { name: "Dismiss" });
    fireEvent.click(dismissButton);

    expect(screen.queryByText("Patient #P-001")).not.toBeInTheDocument();
  });

  it("disables previous button on first page and navigates pages on next", () => {
    mockQueryData = {
      rows: [patientRow1],
      count: 25, // More than 1 page
    };

    renderStaffPatientsView({ filters: { search: "", page: 0 } });

    const prevButton = screen.getByRole("button", { name: "Previous page" });
    const nextButton = screen.getByRole("button", { name: "Next page" });

    expect(prevButton).toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    fireEvent.click(nextButton);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/staff/patients",
      search: { search: "", page: 1 },
    });
  });
});
