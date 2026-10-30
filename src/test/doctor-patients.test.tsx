import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  assertDoctorPatientAccess,
  readDoctorPatients,
  readDoctorPatient,
} from "@/lib/patients.server";
import { DoctorPatientsView } from "@/components/careflow/doctor-patients-view";
import { pageMetadata } from "@/lib/navigation";
import { patientFiltersSchema, type Patient } from "@/lib/patients";

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

let mockQueryData = {
  rows: [] as Patient[],
  count: 0,
};

vi.mock("@/lib/patient-queries", () => ({
  doctorPatientsQuery: (userId: string, clinicId: string, filters: any) => ({
    queryKey: ["doctor-patients", userId, clinicId, filters],
    queryFn: () => mockQueryData,
  }),
}));

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

const patientRowUnrelated: Patient = {
  id: "p3",
  clinic_id: "c1",
  patient_number: "P-003",
  first_name: "Suresh",
  last_name: "Rao",
  date_of_birth: "1978-01-10",
  gender: "Male",
  phone: "+919988776655",
  email: "suresh@example.com",
  address: "789 Pine Ave",
  emergency_contact_name: null,
  emergency_contact_phone: null,
  notes: null,
  status: "ACTIVE",
  user_id: null,
  created_at: "2026-10-24T00:00:00Z",
  updated_at: "2026-10-24T00:00:00Z",
};

const patientRowOtherClinic: Patient = {
  id: "p4",
  clinic_id: "c2",
  patient_number: "P-004",
  first_name: "Priya",
  last_name: "Nair",
  date_of_birth: "1995-12-01",
  gender: "Female",
  phone: "+919112233445",
  email: "priya@example.com",
  address: "321 Elm St",
  emergency_contact_name: null,
  emergency_contact_phone: null,
  notes: null,
  status: "ACTIVE",
  user_id: null,
  created_at: "2026-10-25T00:00:00Z",
  updated_at: "2026-10-25T00:00:00Z",
};

function createMockSupabase(options: {
  role?: string;
  memberStatus?: string;
  platformRole?: string;
  profileStatus?: string;
  operational?: boolean;
  doctorProfileStatus?: string;
  hasDoctorProfile?: boolean;
  assignedPatientIds?: string[];
} = {}) {
  const calls: [string, unknown[]][] = [];
  const assignedIds = options.assignedPatientIds ?? ["p1", "p2"];

  const from = (table: string) => {
    const filters: Record<string, any> = {};
    const chain: Record<string, any> = {};

    chain["select"] = (...args: any[]) => {
      calls.push([`${table}.select`, args]);
      return chain;
    };
    chain["eq"] = (...args: any[]) => {
      calls.push([`${table}.eq`, args]);
      filters[args[0]] = args[1];
      return chain;
    };
    chain["in"] = (...args: any[]) => {
      calls.push([`${table}.in`, args]);
      filters[args[0]] = args[1];
      return chain;
    };
    chain["order"] = (...args: any[]) => {
      calls.push([`${table}.order`, args]);
      return chain;
    };
    chain["or"] = (...args: any[]) => {
      calls.push([`${table}.or`, args]);
      filters["_or"] = args[0];
      return chain;
    };
    chain["limit"] = (...args: any[]) => {
      calls.push([`${table}.limit`, args]);
      return chain;
    };

    chain["range"] = async (start: number, end: number) => {
      calls.push([`${table}.range`, [start, end]]);
      const allPatients = [patientRow1, patientRow2, patientRowUnrelated, patientRowOtherClinic];
      const matched = allPatients.filter((p) => {
        if (filters["clinic_id"] && p.clinic_id !== filters["clinic_id"]) return false;
        if (filters["id"] && Array.isArray(filters["id"]) && !filters["id"].includes(p.id)) return false;
        if (filters["_or"]) {
          const match = (filters["_or"] as string).match(/%([^%]+)%/);
          const token = match?.[1]?.toLowerCase() ?? "";
          if (token) {
            const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
            const num = p.patient_number.toLowerCase();
            if (!fullName.includes(token) && !num.includes(token)) return false;
          }
        }
        return true;
      });
      const paged = matched.slice(start, end + 1);
      return { data: paged, count: matched.length, error: null };
    };

    chain["maybeSingle"] = async () => {
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
            role: options.role ?? "DOCTOR",
            status: options.memberStatus ?? "ACTIVE",
          },
          error: null,
        };
      }
      if (table === "doctor_profiles") {
        if (options.hasDoctorProfile === false) return { data: null, error: null };
        if (filters["clinic_id"] !== "c1") return { data: null, error: null };
        return {
          data: {
            id: "doc1",
            status: options.doctorProfileStatus ?? "ACTIVE",
          },
          error: null,
        };
      }
      if (table === "patients") {
        const p = [patientRow1, patientRow2, patientRowUnrelated, patientRowOtherClinic].find(
          (row) => row.id === filters["id"] && row.clinic_id === filters["clinic_id"]
        );
        return { data: p ?? null, error: null };
      }
      if (table === "appointments" || table === "consultations" || table === "queue_entries") {
        if (filters["doctor_profile_id"] === "doc1" && assignedIds.includes(filters["patient_id"])) {
          return { data: { id: "enc1" }, error: null };
        }
        return { data: null, error: null };
      }
      return { data: null, error: null };
    };

    // For queries returning arrays like .select("patient_id")
    chain["then"] = (onfulfilled: any) => {
      if (table === "appointments" || table === "consultations" || table === "queue_entries") {
        if (filters["doctor_profile_id"] === "doc1" && filters["clinic_id"] === "c1") {
          return Promise.resolve({
            data: assignedIds.map((id) => ({ patient_id: id })),
            error: null,
          }).then(onfulfilled);
        }
        return Promise.resolve({ data: [], error: null }).then(onfulfilled);
      }
      return chain["range"](0, 19).then(onfulfilled);
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

describe("Doctor Patients — Security, Access Control & Data Isolation", () => {
  describe("assertDoctorPatientAccess", () => {
    it("authorizes an active DOCTOR in an operational clinic with an active doctor profile", async () => {
      const { db } = createMockSupabase();
      const result = await assertDoctorPatientAccess(db, "u1", "c1");
      expect(result).toEqual({ id: "doc1" });
    });

    it.each(["OWNER", "STAFF", "PATIENT"])(
      "refuses role %s on the doctor patient workflow",
      async (role) => {
        const { db } = createMockSupabase({ role });
        await expect(assertDoctorPatientAccess(db, "u1", "c1")).rejects.toThrow("unavailable");
      }
    );

    it("refuses callers with PLATFORM_ADMIN platform role", async () => {
      const { db } = createMockSupabase({ platformRole: "PLATFORM_ADMIN" });
      await expect(assertDoctorPatientAccess(db, "u1", "c1")).rejects.toThrow("unavailable");
    });

    it("refuses suspended doctor members", async () => {
      const { db } = createMockSupabase({ memberStatus: "SUSPENDED" });
      await expect(assertDoctorPatientAccess(db, "u1", "c1")).rejects.toThrow("unavailable");
    });

    it("refuses when the clinic is not operational", async () => {
      const { db } = createMockSupabase({ operational: false });
      await expect(assertDoctorPatientAccess(db, "u1", "c1")).rejects.toThrow("unavailable");
    });

    it("refuses when doctor profile is missing or not active", async () => {
      const { db: dbMissing } = createMockSupabase({ hasDoctorProfile: false });
      await expect(assertDoctorPatientAccess(dbMissing, "u1", "c1")).rejects.toThrow("unavailable");

      const { db: dbInactive } = createMockSupabase({ doctorProfileStatus: "INACTIVE" });
      await expect(assertDoctorPatientAccess(dbInactive, "u1", "c1")).rejects.toThrow("unavailable");
    });

    it("refuses access to a clinic the doctor is not a member of", async () => {
      const { db } = createMockSupabase();
      await expect(assertDoctorPatientAccess(db, "u1", "c2")).rejects.toThrow("unavailable");
    });
  });

  describe("readDoctorPatients — Assigned Patients Scoping & Isolation", () => {
    it("returns only patients assigned to the doctor within the clinic", async () => {
      const { db, calls } = createMockSupabase({ assignedPatientIds: ["p1", "p2"] });
      const res = await readDoctorPatients(db, "c1", "doc1", { search: "", page: 0 });

      expect(res.count).toBe(2);
      expect(res.rows.map((r) => r.id)).toEqual(["p1", "p2"]);
      expect(res.rows.map((r) => r.id)).not.toContain("p3"); // Not assigned to doc1
      expect(res.rows.map((r) => r.id)).not.toContain("p4"); // Other clinic

      // Verify queries were clinic-scoped
      expect(calls).toContainEqual(["appointments.eq", ["clinic_id", "c1"]]);
      expect(calls).toContainEqual(["appointments.eq", ["doctor_profile_id", "doc1"]]);
      expect(calls).toContainEqual(["patients.eq", ["clinic_id", "c1"]]);
      expect(calls).toContainEqual(["patients.in", ["id", ["p1", "p2"]]]);
    });

    it("returns empty rows and count 0 if doctor has no assigned patients", async () => {
      const { db, calls } = createMockSupabase({ assignedPatientIds: [] });
      const res = await readDoctorPatients(db, "c1", "doc1", { search: "", page: 0 });

      expect(res.count).toBe(0);
      expect(res.rows).toEqual([]);
      // Should not even query patients table
      const patientTableCalls = calls.filter(([callName]) => callName.startsWith("patients."));
      expect(patientTableCalls.length).toBe(0);
    });

    it("filters assigned patients by search term across first/last name and patient number", async () => {
      const { db } = createMockSupabase({ assignedPatientIds: ["p1", "p2"] });
      const resMeera = await readDoctorPatients(db, "c1", "doc1", { search: "Meera", page: 0 });
      expect(resMeera.count).toBe(1);
      expect(resMeera.rows[0]?.id).toBe("p1");

      const resAarav = await readDoctorPatients(db, "c1", "doc1", { search: "P-002", page: 0 });
      expect(resAarav.count).toBe(1);
      expect(resAarav.rows[0]?.id).toBe("p2");
    });

    it("does not return patients belonging to other doctors even if search matches their name", async () => {
      const { db } = createMockSupabase({ assignedPatientIds: ["p1", "p2"] });
      // "Suresh" is p3, assigned to an unrelated doctor
      const res = await readDoctorPatients(db, "c1", "doc1", { search: "Suresh", page: 0 });
      expect(res.count).toBe(0);
      expect(res.rows).toHaveLength(0);
    });
  });

  describe("readDoctorPatient — Single Patient Verification", () => {
    it("returns patient if assigned to caller doctor in the clinic", async () => {
      const { db } = createMockSupabase({ assignedPatientIds: ["p1", "p2"] });
      const patient = await readDoctorPatient(db, "c1", "doc1", "p1");
      expect(patient).not.toBeNull();
      expect(patient?.id).toBe("p1");
      expect(patient?.first_name).toBe("Meera");
    });

    it("returns null if patient belongs to an unrelated doctor in the same clinic", async () => {
      const { db } = createMockSupabase({ assignedPatientIds: ["p1", "p2"] });
      // p3 is assigned to an unrelated doctor
      const patient = await readDoctorPatient(db, "c1", "doc1", "p3");
      expect(patient).toBeNull();
    });

    it("returns null if patient belongs to another clinic", async () => {
      const { db } = createMockSupabase({ assignedPatientIds: ["p1", "p2"] });
      const patient = await readDoctorPatient(db, "c1", "doc1", "p4");
      expect(patient).toBeNull();
    });
  });
});

describe("DoctorPatientsView — Component & UI Experience", () => {
  const renderView = (filters = { search: "", page: 0 }) => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    qc.setQueryData(["doctor-patients", "u1", "c1", filters], mockQueryData);
    return render(
      <QueryClientProvider client={qc}>
        <DoctorPatientsView userId="u1" clinicId="c1" filters={filters} />
      </QueryClientProvider>
    );
  };

  it("renders page header and does not expose registration actions", () => {
    mockQueryData = { rows: [patientRow1], count: 1 };
    renderView();

    expect(screen.getByRole("heading", { name: "Patients" })).toBeInTheDocument();
    expect(
      screen.getByText("View and search patients under your clinical care.")
    ).toBeInTheDocument();

    // Verify doctors DO NOT have "Register patient" button or clinic QR dialog
    expect(screen.queryByText(/register patient/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/patient registration qr/i)).not.toBeInTheDocument();
  });

  it("displays patient details in table (Name, Number, Contact, Status, Action)", () => {
    mockQueryData = { rows: [patientRow1, patientRow2], count: 2 };
    renderView();

    expect(screen.getByText("Meera Iyer")).toBeInTheDocument();
    expect(screen.getByText("P-001")).toBeInTheDocument();
    expect(screen.getByText("+919876543210")).toBeInTheDocument();
    expect(screen.getByText("meera@example.com")).toBeInTheDocument();

    expect(screen.getByText("Aarav Sharma")).toBeInTheDocument();
    expect(screen.getByText("P-002")).toBeInTheDocument();
    expect(screen.getByText("2 patients")).toBeInTheDocument();

    const viewButtons = screen.getAllByRole("button", { name: /view details/i });
    expect(viewButtons).toHaveLength(2);
  });

  it("displays empty state when doctor has no assigned patients", () => {
    mockQueryData = { rows: [], count: 0 };
    renderView();

    expect(screen.getByText("No assigned patients")).toBeInTheDocument();
    expect(
      screen.getByText("Patients scheduled for or consulted with you will appear here.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/register patient/i)).not.toBeInTheDocument();
  });

  it("displays empty state with clear search button when search yields no matches", () => {
    mockQueryData = { rows: [], count: 0 };
    renderView({ search: "NonExistent", page: 0 });

    expect(screen.getByText("No matching patients")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No patients match your search criteria. Try a different name or patient number."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
  });

  it("opens details dialog with full demographics, emergency contact, notes, and direct clinical links", () => {
    mockQueryData = { rows: [patientRow1], count: 1 };
    renderView();

    const viewBtn = screen.getByRole("button", { name: /view details/i });
    fireEvent.click(viewBtn);

    // Dialog header
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByText("Meera Iyer").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Patient #P-001")).toBeInTheDocument();

    // Demographics & contact info
    expect(screen.getByText("Female")).toBeInTheDocument();
    expect(screen.getByText("1990-05-15")).toBeInTheDocument();
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
    expect(screen.getByText("Rajesh Iyer (+919876543211)")).toBeInTheDocument();
    expect(screen.getByText("Penicillin allergy")).toBeInTheDocument();

    // Clinical navigation shortcuts
    expect(screen.getByRole("link", { name: /consultations/i })).toHaveAttribute(
      "href",
      "/doctor/consultations"
    );
    expect(screen.getByRole("link", { name: /prescriptions/i })).toHaveAttribute(
      "href",
      "/doctor/prescriptions"
    );
    expect(screen.getByRole("link", { name: /appointments/i })).toHaveAttribute(
      "href",
      "/doctor/appointments"
    );

    // Dismiss button dismisses dialog
    const dismissBtn = screen.getByRole("button", { name: "Dismiss" });
    fireEvent.click(dismissBtn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("supports search input and clear button", () => {
    mockQueryData = { rows: [patientRow1], count: 1 };
    renderView({ search: "Meera", page: 0 });

    const searchInput = screen.getByLabelText("Search patients");
    expect(searchInput).toHaveValue("Meera");

    const clearBtn = screen.getByRole("button", { name: "Clear" });
    fireEvent.click(clearBtn);

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/doctor/patients",
      search: { search: "", page: 0 },
    });
  });

  it("renders loading state when initial data is loading", () => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    // Do not set query data so it enters loading state
    render(
      <QueryClientProvider client={qc}>
        <DoctorPatientsView userId="u1" clinicId="c1" filters={{ search: "", page: 0 }} />
      </QueryClientProvider>
    );

    expect(screen.getByText("Loading patients…")).toBeInTheDocument();
  });

  it("handles pagination next and previous controls", () => {
    // 25 patients -> 2 pages
    mockQueryData = {
      rows: Array.from({ length: 20 }, (_, i) => ({
        ...patientRow1,
        id: `p-${i}`,
        patient_number: `P-${i}`,
      })),
      count: 25,
    };
    renderView({ search: "", page: 0 });

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    const prevBtn = screen.getByRole("button", { name: "Previous page" });
    const nextBtn = screen.getByRole("button", { name: "Next page" });

    expect(prevBtn).toBeDisabled();
    expect(nextBtn).toBeEnabled();

    fireEvent.click(nextBtn);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/doctor/patients",
      search: { search: "", page: 1 },
    });
  });

  it("validates search schema and page metadata", () => {
    const meta = pageMetadata("Patients", "DOCTOR");
    expect(meta.meta[0]?.title).toBe("Patients · Doctor — CAREFLOW AI");
    expect(meta.meta[1]?.content).toBe("CAREFLOW AI doctor patients workspace.");

    const parsed = patientFiltersSchema.parse({ search: " Test ", page: "2" });
    expect(parsed).toEqual({ search: "Test", page: 2 });

    const defaulted = patientFiltersSchema.parse({});
    expect(defaulted).toEqual({ search: "", page: 0 });
  });
});
