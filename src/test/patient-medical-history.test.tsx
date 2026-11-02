import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getPatientMedicalHistory } from "@/lib/clinical.server";
import { PatientMedicalHistoryView } from "@/components/careflow/patient-medical-history-view";
import type {
  PatientMedicalHistoryRecord,
  PatientMedicalHistoryEncounter,
  PrescriptionWithDetails,
  VitalsRow,
} from "@/lib/clinical";

afterEach(cleanup);

// Mock Link from @tanstack/react-router
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

const clinicAId = "11111111-1111-4111-8111-111111111111";
const clinicBId = "22222222-2222-4222-8222-222222222222";
const doctorId = "33333333-3333-4333-8333-333333333333";
const doctorUserId = "44444444-4444-4444-8444-444444444444";
const patientUserId = "55555555-5555-4555-8555-555555555555";
const otherUserId = "66666666-6666-4666-8666-666666666666";
const patientRecordAId = "77777777-7777-4777-8777-777777777777";
const patientRecordBId = "88888888-8888-4888-8888-888888888888";
const otherPatientRecordId = "99999999-9999-4999-8999-999999999999";
const consultationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const prescriptionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const vitalsId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function createMockMedicalHistoryDb(options: {
  patientRecords?: any[];
  consultations?: any[];
  vitals?: any[];
  prescriptions?: any[];
  prescriptionItems?: any[];
} = {}) {
  const calls: [string, unknown[]][] = [];

  const defaultPatients = [
    {
      id: patientRecordAId,
      clinic_id: clinicAId,
      user_id: patientUserId,
      patient_number: "P-1001",
      first_name: "Rahul",
      last_name: "Sharma",
      date_of_birth: "1990-05-15",
      gender: "MALE",
      phone: "+91 98765 43210",
      email: "rahul@example.com",
      address: "123 MG Road, Bengaluru",
      emergency_contact_name: "Priya Sharma",
      emergency_contact_phone: "+91 98765 00000",
      notes: "Known mild seasonal allergies",
      clinic: { id: clinicAId, name: "CareFlow Bengaluru Clinic", phone: "+91 80 1234 5678", address: "MG Road" },
    },
    {
      id: patientRecordBId,
      clinic_id: clinicBId,
      user_id: patientUserId,
      patient_number: "P-2002",
      first_name: "Rahul",
      last_name: "Sharma",
      date_of_birth: "1990-05-15",
      gender: "MALE",
      phone: "+91 98765 43210",
      email: "rahul@example.com",
      clinic: { id: clinicBId, name: "CareFlow Mumbai Clinic", phone: "+91 22 8765 4321", address: "Nariman Point" },
    },
  ];

  const defaultConsultations = [
    {
      id: consultationId,
      clinic_id: clinicAId,
      patient_id: patientRecordAId,
      doctor_profile_id: doctorId,
      appointment_id: "appt-1",
      chief_complaint: "Persistent dry cough and low-grade fever for 3 days",
      assessment: "Acute Bronchitis",
      clinical_notes: "Advised steam inhalation, adequate hydration, and warm fluids. Rest for 3 days.",
      follow_up_date: "2026-11-10",
      follow_up_notes: "Review if fever persists beyond 48 hours",
      status: "COMPLETED",
      completed_at: "2026-11-01T10:30:00Z",
      created_at: "2026-11-01T10:00:00Z",
      updated_at: "2026-11-01T10:30:00Z",
      clinic: { id: clinicAId, name: "CareFlow Bengaluru Clinic", phone: "+91 80 1234 5678", address: "MG Road" },
      doctor: { id: doctorId, specialization: "Pulmonology", department: "Respiratory Medicine", user_id: doctorUserId },
      appointment: { id: "appt-1", scheduled_start: "2026-11-01T10:00:00Z", scheduled_end: "2026-11-01T10:30:00Z", appointment_type: "IN_PERSON", status: "COMPLETED" },
    },
    {
      id: "consult-other",
      clinic_id: clinicAId,
      patient_id: otherPatientRecordId,
      doctor_profile_id: doctorId,
      appointment_id: "appt-other",
      chief_complaint: "Other patient complaint",
      assessment: "Other patient diagnosis",
      status: "COMPLETED",
      created_at: "2026-11-01T11:00:00Z",
    },
  ];

  const defaultVitals: VitalsRow[] = [
    {
      id: vitalsId,
      clinic_id: clinicAId,
      patient_id: patientRecordAId,
      consultation_id: consultationId,
      appointment_id: "appt-1",
      blood_pressure_systolic: 120,
      blood_pressure_diastolic: 80,
      heart_rate: 76,
      temperature: 99.2,
      respiratory_rate: 18,
      oxygen_saturation: 98,
      height: 175,
      weight: 72,
      recorded_by: doctorUserId,
      recorded_at: "2026-11-01T09:55:00Z",
      created_at: "2026-11-01T09:55:00Z",
    },
    {
      id: "vitals-other",
      clinic_id: clinicAId,
      patient_id: otherPatientRecordId,
      consultation_id: "consult-other",
      appointment_id: "appt-other",
      blood_pressure_systolic: 140,
      blood_pressure_diastolic: 95,
      heart_rate: 90,
      temperature: 101.5,
      respiratory_rate: 22,
      oxygen_saturation: 94,
      height: 165,
      weight: 85,
      recorded_by: doctorUserId,
      recorded_at: "2026-11-01T10:50:00Z",
      created_at: "2026-11-01T10:50:00Z",
    },
  ];

  const defaultPrescriptions = [
    {
      id: prescriptionId,
      clinic_id: clinicAId,
      patient_id: patientRecordAId,
      doctor_profile_id: doctorId,
      consultation_id: consultationId,
      prescription_date: "2026-11-01",
      status: "COMPLETED",
      instructions: "Take medications after meals with water",
      created_at: "2026-11-01T10:25:00Z",
      updated_at: "2026-11-01T10:30:00Z",
      patient: {
        id: patientRecordAId,
        patient_number: "P-1001",
        first_name: "Rahul",
        last_name: "Sharma",
        date_of_birth: "1990-05-15",
        gender: "MALE",
        phone: "+91 98765 43210",
      },
      doctor: {
        id: doctorId,
        specialization: "Pulmonology",
        department: "Respiratory Medicine",
        user_id: doctorUserId,
      },
      consultation: {
        id: consultationId,
        clinic_id: clinicAId,
        status: "COMPLETED",
        assessment: "Acute Bronchitis",
        clinical_notes: "Advised steam inhalation",
        follow_up_date: "2026-11-10",
        follow_up_notes: "Review if fever persists",
      },
    },
  ];

  const defaultItems = [
    {
      id: "rx-item-1",
      prescription_id: prescriptionId,
      medicine_name: "Amoxicillin Clavulanate 625mg",
      dosage: "625 mg",
      frequency: "1-0-1",
      meal_timing: "AFTER_MEAL",
      duration: "5 days",
      instructions: "Complete full antibiotic course",
      created_at: "2026-11-01T10:25:00Z",
    },
    {
      id: "rx-item-2",
      prescription_id: prescriptionId,
      medicine_name: "Levocetirizine 5mg",
      dosage: "5 mg",
      frequency: "0-0-1",
      meal_timing: "AFTER_MEAL",
      duration: "5 days",
      instructions: "At bedtime if cough persists",
      created_at: "2026-11-01T10:25:00Z",
    },
  ];

  const db: any = {
    calls,
    from: vi.fn((table: string) => {
      calls.push([`from.${table}`, []]);

      if (table === "patients") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((field: string, val: string) => {
              const res: any = {
                eq: vi.fn((f2: string, v2: string) => {
                  const filtered = (options.patientRecords ?? defaultPatients).filter(
                    (p) => p[field] === val && p[f2] === v2
                  );
                  return Promise.resolve({ data: filtered, error: null });
                }),
                then: (resolve: any) => {
                  const filtered = (options.patientRecords ?? defaultPatients).filter(
                    (p) => p[field] === val
                  );
                  return resolve({ data: filtered, error: null });
                },
              };
              return res;
            }),
          })),
        };
      }

      if (table === "consultations") {
        return {
          select: vi.fn(() => ({
            in: vi.fn((field: string, ids: string[]) => ({
              eq: vi.fn((f2: string, v2: string) => ({
                order: vi.fn(() => {
                  const chain: any = {
                    eq: vi.fn((f3: string, v3: string) => {
                      const filtered = (options.consultations ?? defaultConsultations).filter(
                        (c) => ids.includes(c[field]) && c[f2] === v2 && c[f3] === v3
                      );
                      return Promise.resolve({ data: filtered, error: null });
                    }),
                    then: (resolve: any) => {
                      const filtered = (options.consultations ?? defaultConsultations).filter(
                        (c) => ids.includes(c[field]) && c[f2] === v2
                      );
                      return resolve({ data: filtered, error: null });
                    },
                  };
                  return chain;
                }),
              })),
            })),
          })),
        };
      }

      if (table === "vitals") {
        return {
          select: vi.fn(() => ({
            in: vi.fn((field: string, ids: string[]) => ({
              order: vi.fn(() => {
                const chain: any = {
                  eq: vi.fn((f2: string, v2: string) => {
                    const filtered = (options.vitals ?? defaultVitals).filter(
                      (v) => ids.includes(v[field]) && v[f2] === v2
                    );
                    return Promise.resolve({ data: filtered, error: null });
                  }),
                  then: (resolve: any) => {
                    const filtered = (options.vitals ?? defaultVitals).filter((v) =>
                      ids.includes(v[field])
                    );
                    return resolve({ data: filtered, error: null });
                  },
                };
                return chain;
              }),
            })),
          })),
        };
      }

      if (table === "prescriptions") {
        return {
          select: vi.fn(() => ({
            in: vi.fn((field: string, ids: string[]) => ({
              eq: vi.fn((f2: string, v2: string) => ({
                order: vi.fn(() => {
                  const chain: any = {
                    eq: vi.fn((f3: string, v3: string) => {
                      const filtered = (options.prescriptions ?? defaultPrescriptions).filter(
                        (p) => ids.includes(p[field]) && p[f2] === v2 && p[f3] === v3
                      );
                      return Promise.resolve({ data: filtered, error: null });
                    }),
                    then: (resolve: any) => {
                      const filtered = (options.prescriptions ?? defaultPrescriptions).filter(
                        (p) => ids.includes(p[field]) && p[f2] === v2
                      );
                      return resolve({ data: filtered, error: null });
                    },
                  };
                  return chain;
                }),
              })),
            })),
          })),
        };
      }

      if (table === "prescription_items") {
        return {
          select: vi.fn(() => ({
            in: vi.fn((field: string, ids: string[]) => {
              const filtered = (options.prescriptionItems ?? defaultItems).filter((item) =>
                ids.includes(item[field])
              );
              return Promise.resolve({ data: filtered, error: null });
            }),
          })),
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      };
    }),
    rpc: vi.fn((fn: string) => {
      if (fn === "clinic_member_names") {
        return Promise.resolve({
          data: [{ user_id: doctorUserId, display_name: "Dr. Vikram Seth" }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  };

  return db;
}

describe("Patient Medical History Server Function & Authorization", () => {
  it("SEC-01: Enforces patient ownership by returning only records linked to authenticated user_id", async () => {
    const db = createMockMedicalHistoryDb();

    const history = await getPatientMedicalHistory(db, patientUserId);

    expect(history.patient).toBeDefined();
    expect(history.patient?.id).toBe(patientRecordAId);
    expect(history.patient?.first_name).toBe("Rahul");

    // Must return caller's consultation, NOT other patient's consultation
    expect(history.encounters).toHaveLength(1);
    expect(history.encounters[0]!.id).toBe(consultationId);
    expect(history.encounters[0]!.assessment).toBe("Acute Bronchitis");
    expect(history.encounters.some((e) => e.patient_id === otherPatientRecordId)).toBe(false);

    // Must return caller's vitals only
    expect(history.vitalsHistory).toHaveLength(1);
    expect(history.vitalsHistory[0]!.id).toBe(vitalsId);
    expect(history.vitalsHistory.some((v) => v.patient_id === otherPatientRecordId)).toBe(false);
  });

  it("SEC-01: Excludes other patients' clinical data when queried by unauthorized caller", async () => {
    const db = createMockMedicalHistoryDb({
      patientRecords: [], // other user has no records
    });

    const history = await getPatientMedicalHistory(db, otherUserId);

    expect(history.patient).toBeNull();
    expect(history.encounters).toHaveLength(0);
    expect(history.vitalsHistory).toHaveLength(0);
    expect(history.prescriptions).toHaveLength(0);
  });

  it("SEC-02: Scopes records strictly to clinicId when specified", async () => {
    const db = createMockMedicalHistoryDb();

    const historyA = await getPatientMedicalHistory(db, patientUserId, clinicAId);
    expect(historyA.patient?.clinic_id).toBe(clinicAId);
    expect(historyA.encounters).toHaveLength(1);
    expect(historyA.encounters[0]!.clinic_id).toBe(clinicAId);

    // If querying clinicB where no consultations exist
    const historyB = await getPatientMedicalHistory(db, patientUserId, clinicBId);
    expect(historyB.patient?.clinic_id).toBe(clinicBId);
    expect(historyB.encounters).toHaveLength(0);
  });

  it("CLINICAL-01: Correctly links vitals and prescriptions to the matching encounter", async () => {
    const db = createMockMedicalHistoryDb();

    const history = await getPatientMedicalHistory(db, patientUserId, clinicAId);
    const encounter = history.encounters[0]!;

    expect(encounter.vitals).toBeDefined();
    expect(encounter.vitals?.blood_pressure_systolic).toBe(120);
    expect(encounter.vitals?.blood_pressure_diastolic).toBe(80);
    expect(encounter.vitals?.heart_rate).toBe(76);
    expect(encounter.vitals?.temperature).toBe(99.2);

    expect(encounter.prescriptions).toHaveLength(1);
    expect(encounter.prescriptions[0]!.items).toHaveLength(2);
    expect(encounter.prescriptions[0]!.items[0]!.medicine_name).toBe("Amoxicillin Clavulanate 625mg");
  });

  it("CLINICAL-02: Resolves doctor display name through clinic member name mapping", async () => {
    const db = createMockMedicalHistoryDb();

    const history = await getPatientMedicalHistory(db, patientUserId, clinicAId);
    const encounter = history.encounters[0]!;

    expect(encounter.doctor?.display_name).toBe("Dr. Vikram Seth");
    expect(encounter.doctor?.specialization).toBe("Pulmonology");
  });

  it("READONLY-01: Verifies medical history query does not execute any insert, update, or delete commands", async () => {
    const db = createMockMedicalHistoryDb();

    await getPatientMedicalHistory(db, patientUserId, clinicAId);

    const mutatingCalls = db.calls.filter(([name]) =>
      name.includes("insert") || name.includes("update") || name.includes("delete")
    );
    expect(mutatingCalls).toHaveLength(0);
  });
});

describe("Patient Medical History View (Frontend UI)", () => {
  let qc: QueryClient;

  const mockPrescription: PrescriptionWithDetails = {
    id: prescriptionId,
    clinic_id: clinicAId,
    patient_id: patientRecordAId,
    doctor_profile_id: doctorId,
    consultation_id: consultationId,
    prescription_date: "2026-11-01",
    status: "COMPLETED",
    instructions: "Take medications after meals with water",
    created_at: "2026-11-01T10:25:00Z",
    updated_at: "2026-11-01T10:30:00Z",
    patient: {
      id: patientRecordAId,
      patient_number: "P-1001",
      first_name: "Rahul",
      last_name: "Sharma",
      date_of_birth: "1990-05-15",
      gender: "MALE",
      phone: "+91 98765 43210",
    },
    doctor: {
      id: doctorId,
      specialization: "Pulmonology",
      department: "Respiratory Medicine",
      display_name: "Dr. Vikram Seth",
    },
    items: [
      {
        id: "rx-item-1",
        prescription_id: prescriptionId,
        medicine_name: "Amoxicillin Clavulanate 625mg",
        dosage: "625 mg",
        frequency: "1-0-1",
        duration: "5 days",
        instructions: "Take with water",
        created_at: "2026-11-01T10:25:00Z",
      },
    ],
  };

  const mockHistoryData: PatientMedicalHistoryRecord = {
    patient: {
      id: patientRecordAId,
      clinic_id: clinicAId,
      patient_number: "P-1001",
      first_name: "Rahul",
      last_name: "Sharma",
      date_of_birth: "1990-05-15",
      gender: "MALE",
      phone: "+91 98765 43210",
      notes: "Known mild seasonal allergies",
      clinic: { id: clinicAId, name: "CareFlow Bengaluru Clinic", address: "MG Road", phone: "+91 80 1234 5678" },
    },
    encounters: [
      {
        id: consultationId,
        clinic_id: clinicAId,
        patient_id: patientRecordAId,
        doctor_profile_id: doctorId,
        appointment_id: "appt-1",
        chief_complaint: "Persistent dry cough and low-grade fever",
        assessment: "Acute Bronchitis",
        clinical_notes: "Advised steam inhalation, adequate hydration, and warm fluids.",
        follow_up_date: "2026-11-10",
        follow_up_notes: "Review if symptoms persist",
        status: "COMPLETED",
        completed_at: "2026-11-01T10:30:00Z",
        created_at: "2026-11-01T10:00:00Z",
        clinic: { id: clinicAId, name: "CareFlow Bengaluru Clinic", phone: "+91 80 1234 5678", address: "MG Road" },
        doctor: { id: doctorId, specialization: "Pulmonology", department: "Respiratory Medicine", display_name: "Dr. Vikram Seth" },
        appointment: { id: "appt-1", scheduled_start: "2026-11-01T10:00:00Z", scheduled_end: "2026-11-01T10:30:00Z", appointment_type: "IN_PERSON", status: "COMPLETED" },
        vitals: {
          id: vitalsId,
          clinic_id: clinicAId,
          patient_id: patientRecordAId,
          consultation_id: consultationId,
          appointment_id: "appt-1",
          blood_pressure_systolic: 120,
          blood_pressure_diastolic: 80,
          heart_rate: 76,
          temperature: 99.2,
          respiratory_rate: 18,
          oxygen_saturation: 98,
          height: 175,
          weight: 72,
          recorded_by: doctorUserId,
          recorded_at: "2026-11-01T09:55:00Z",
          created_at: "2026-11-01T09:55:00Z",
        },
        prescriptions: [mockPrescription],
      },
    ],
    vitalsHistory: [
      {
        id: vitalsId,
        clinic_id: clinicAId,
        patient_id: patientRecordAId,
        consultation_id: consultationId,
        appointment_id: "appt-1",
        blood_pressure_systolic: 120,
        blood_pressure_diastolic: 80,
        heart_rate: 76,
        temperature: 99.2,
        respiratory_rate: 18,
        oxygen_saturation: 98,
        height: 175,
        weight: 72,
        recorded_by: doctorUserId,
        recorded_at: "2026-11-01T09:55:00Z",
        created_at: "2026-11-01T09:55:00Z",
        clinic: { id: clinicAId, name: "CareFlow Bengaluru Clinic" },
      },
    ],
    prescriptions: [mockPrescription],
  };

  beforeEach(() => {
    qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    vi.clearAllMocks();
  });

  it("renders page title, verified record badge, and patient demographics", () => {
    qc.setQueryData(["patient-medical-history", clinicAId], mockHistoryData);

    render(
      <QueryClientProvider client={qc}>
        <PatientMedicalHistoryView clinicId={clinicAId} />
      </QueryClientProvider>
    );

    expect(screen.getByText("Medical history")).toBeDefined();
    expect(screen.getByText(/Official Record • Read-Only/i)).toBeDefined();
    expect(screen.getByText("Rahul Sharma")).toBeDefined();
    expect(screen.getByText("#P-1001")).toBeDefined();
    expect(screen.getByText(/Care remarks/i)).toBeDefined();
  });

  it("renders clinical summary statistics counters", () => {
    qc.setQueryData(["patient-medical-history", clinicAId], mockHistoryData);

    render(
      <QueryClientProvider client={qc}>
        <PatientMedicalHistoryView clinicId={clinicAId} />
      </QueryClientProvider>
    );

    expect(screen.getByText("Clinical encounters")).toBeDefined();
    expect(screen.getByText("Diagnoses on file")).toBeDefined();
    expect(screen.getByText("Vitals recorded")).toBeDefined();
    expect(screen.getByText("Prescriptions on file")).toBeDefined();
  });

  it("renders clinical encounter card with diagnosis, symptoms, and doctor notes", () => {
    qc.setQueryData(["patient-medical-history", clinicAId], mockHistoryData);

    render(
      <QueryClientProvider client={qc}>
        <PatientMedicalHistoryView clinicId={clinicAId} />
      </QueryClientProvider>
    );

    expect(screen.getByText("Acute Bronchitis")).toBeDefined();
    expect(screen.getByText(/Persistent dry cough/i)).toBeDefined();
    expect(screen.getByText(/Advised steam inhalation/i)).toBeDefined();
    expect(screen.getByText(/Dr. Vikram Seth/i)).toBeDefined();
    expect(screen.getByText("Completed Encounter")).toBeDefined();
    expect(screen.getByText(/120\/80 mmHg/i)).toBeDefined();
  });

  it("switches to Diagnoses tab and displays conditions list", async () => {
    qc.setQueryData(["patient-medical-history", clinicAId], mockHistoryData);

    render(
      <QueryClientProvider client={qc}>
        <PatientMedicalHistoryView clinicId={clinicAId} />
      </QueryClientProvider>
    );

    const diagTab = screen.getByRole("tab", { name: /Diagnoses/i });
    fireEvent.mouseDown(diagTab, { button: 0, ctrlKey: false });

    await waitFor(() => {
      expect(screen.getByText("Verified Assessment")).toBeDefined();
      expect(screen.getByText("Acute Bronchitis")).toBeDefined();
      expect(screen.getByText(/Presented symptoms: Persistent dry cough/i)).toBeDefined();
    });
  });

  it("switches to Vitals tab and displays recorded metrics with calculated BMI", async () => {
    qc.setQueryData(["patient-medical-history", clinicAId], mockHistoryData);

    render(
      <QueryClientProvider client={qc}>
        <PatientMedicalHistoryView clinicId={clinicAId} />
      </QueryClientProvider>
    );

    const vitalsTab = screen.getByRole("tab", { name: /Vitals/i });
    fireEvent.mouseDown(vitalsTab, { button: 0, ctrlKey: false });

    await waitFor(() => {
      expect(screen.getByText("76 bpm")).toBeDefined();
      expect(screen.getByText("99.2 °F")).toBeDefined();
      expect(screen.getByText("98%")).toBeDefined();
      expect(screen.getByText("72 kg")).toBeDefined();
      expect(screen.getByText("175 cm")).toBeDefined();
      // BMI = 72 / (1.75 * 1.75) = 23.5 kg/m²
      expect(screen.getByText(/23.5 kg\/m²/i)).toBeDefined();
    });
  });

  it("switches to Medications tab and displays prescription items", async () => {
    qc.setQueryData(["patient-medical-history", clinicAId], mockHistoryData);

    render(
      <QueryClientProvider client={qc}>
        <PatientMedicalHistoryView clinicId={clinicAId} />
      </QueryClientProvider>
    );

    const medTab = screen.getByRole("tab", { name: /Medications/i });
    fireEvent.mouseDown(medTab, { button: 0, ctrlKey: false });

    await waitFor(() => {
      expect(screen.getByText("Amoxicillin Clavulanate 625mg")).toBeDefined();
      expect(screen.getByText("(625 mg)")).toBeDefined();
      expect(screen.getByText(/1-0-1/i)).toBeDefined();
      expect(screen.getByText("View Prescription")).toBeDefined();
    });
  });

  it("opens Encounter Details modal on button click", async () => {
    qc.setQueryData(["patient-medical-history", clinicAId], mockHistoryData);

    render(
      <QueryClientProvider client={qc}>
        <PatientMedicalHistoryView clinicId={clinicAId} />
      </QueryClientProvider>
    );

    const detailsButton = screen.getByRole("button", { name: /Encounter details/i });
    fireEvent.click(detailsButton);

    await waitFor(() => {
      expect(screen.getByText("Clinical Encounter Details")).toBeDefined();
      expect(screen.getByText("Encounter Vitals")).toBeDefined();
      expect(screen.getByText("Prescribed Medications")).toBeDefined();
    });
  });

  it("filters encounters using search input and displays empty state when no match is found", () => {
    qc.setQueryData(["patient-medical-history", clinicAId], mockHistoryData);

    render(
      <QueryClientProvider client={qc}>
        <PatientMedicalHistoryView clinicId={clinicAId} />
      </QueryClientProvider>
    );

    const searchInput = screen.getByPlaceholderText(/Filter records/i);
    fireEvent.change(searchInput, { target: { value: "NonExistentConditionXYZ" } });

    expect(screen.getByText("No matching encounters")).toBeDefined();
    expect(screen.getByText(/No consultations match "NonExistentConditionXYZ"./i)).toBeDefined();
  });

  it("renders empty state when patient has no medical records", () => {
    qc.setQueryData(["patient-medical-history", clinicAId], {
      patient: null,
      encounters: [],
      vitalsHistory: [],
      prescriptions: [],
    });

    render(
      <QueryClientProvider client={qc}>
        <PatientMedicalHistoryView clinicId={clinicAId} />
      </QueryClientProvider>
    );

    expect(screen.getByText("No medical history on record")).toBeDefined();
  });

  it("guarantees read-only behavior by confirming absence of edit controls", () => {
    qc.setQueryData(["patient-medical-history", clinicAId], mockHistoryData);

    render(
      <QueryClientProvider client={qc}>
        <PatientMedicalHistoryView clinicId={clinicAId} />
      </QueryClientProvider>
    );

    // Ensure no edit buttons, no forms to submit or mutate clinical records
    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /update/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });
});

