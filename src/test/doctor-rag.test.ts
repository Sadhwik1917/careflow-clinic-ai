import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  executeDoctorPatientRagSearch,
  validateDoctorPatientRagInput,
  type DoctorPatientRagInput,
} from "@/lib/assistant.server";
import type { RagPassage } from "@/lib/rag";

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const CLINIC_B = "22222222-2222-2222-2222-222222222222";
const DOCTOR_USER_ID = "00000000-0000-0000-0000-000000000001";
const PATIENT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PATIENT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"; // belongs to CLINIC_B

const samplePatient = {
  id: PATIENT_A,
  clinic_id: CLINIC_A,
  first_name: "Aarav",
  last_name: "Sharma",
  patient_number: "PAT-00123",
  date_of_birth: "1988-04-12",
  gender: "Male",
  phone: "+91 98765 43210",
  notes: "Known mild asthma",
};

const sampleConsultations = [
  {
    id: "c-1",
    chief_complaint: "Persistent dry cough",
    diagnosis: "Acute Bronchitis",
    assessment: "Chest clear, wheezing minimal",
    clinical_notes: "Prescribed inhaler and rest",
    follow_up_date: "2026-11-20",
    created_at: "2026-11-01T10:00:00Z",
    status: "COMPLETED",
  },
];

const sampleVitals = [
  {
    id: "v-1",
    blood_pressure_systolic: 122,
    blood_pressure_diastolic: 80,
    heart_rate: 76,
    temperature: 98.4,
    respiratory_rate: 16,
    oxygen_saturation: 99,
    weight_kg: 72,
    height_cm: 175,
    recorded_at: "2026-11-01T09:50:00Z",
  },
];

const samplePrescriptions = [
  {
    id: "rx-1",
    status: "ACTIVE",
    created_at: "2026-11-01T10:15:00Z",
    items: [
      {
        id: "item-1",
        medication_name: "Salbutamol Inhaler",
        dosage: "100mcg",
        frequency: "AS_NEEDED",
        duration_days: 14,
        instructions: "2 puffs every 6 hours as needed",
      },
    ],
  },
];

const sampleGuidelines: RagPassage[] = [
  {
    chunkId: "guide-1",
    documentId: "doc-guide-1",
    sourceKey: "guidelines/respiratory",
    title: "Clinical Protocol: Adult Bronchitis",
    content: "First-line bronchodilator protocol for symptomatic relief.",
    similarity: 0.89,
    domain: "CLINIC",
  },
];

function createMockDbs(options?: {
  membershipRole?: string;
  membershipStatus?: string;
  clinicOperational?: boolean;
  aiEnabled?: boolean;
  creditAllowed?: boolean;
  creditReason?: string;
  patientData?: any;
}) {
  const {
    membershipRole = "DOCTOR",
    membershipStatus = "ACTIVE",
    clinicOperational = true,
    aiEnabled = true,
    creditAllowed = true,
    creditReason,
    patientData = samplePatient,
  } = options ?? {};

  const userRpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn === "clinic_is_operational") return { data: clinicOperational, error: null };
    if (fn === "clinic_ai_enabled") return { data: aiEnabled, error: null };
    return { data: [], error: null };
  });

  const adminRpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn === "ai_reserve_credit_as") {
      return {
        data: creditAllowed
          ? { allowed: true }
          : { allowed: false, reason: creditReason || "LIMIT_REACHED" },
        error: null,
      };
    }
    if (fn === "ai_finish_credit_as") {
      return { data: "SETTLED", error: null };
    }
    return { data: null, error: null };
  });

  const userDb = {
    rpc: userRpc,
    from: vi.fn((table: string) => {
      if (table === "clinic_members") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({
                    data:
                      membershipRole && membershipStatus
                        ? { role: membershipRole, status: membershipStatus }
                        : null,
                    error: null,
                  })
                ),
              })),
            })),
          })),
        };
      }
      if (table === "patients") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((field1: string, val1: string) => ({
              eq: vi.fn((field2: string, val2: string) => ({
                maybeSingle: vi.fn(() => {
                  // Verify cross-tenant isolation: patient clinic must match
                  if (patientData && patientData.clinic_id === val2 && patientData.id === val1) {
                    return Promise.resolve({ data: patientData, error: null });
                  }
                  return Promise.resolve({ data: null, error: null });
                }),
              })),
            })),
          })),
        };
      }
      if (table === "consultations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve({ data: sampleConsultations, error: null })),
                })),
              })),
            })),
          })),
        };
      }
      if (table === "vitals") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve({ data: sampleVitals, error: null })),
                })),
              })),
            })),
          })),
        };
      }
      if (table === "prescriptions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve({ data: samplePrescriptions, error: null })),
                })),
              })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      };
    }),
  };

  const adminDb = { rpc: adminRpc };
  return { userDb, adminDb, userRpc, adminRpc };
}

describe("Sub-Stage 1.4: Doctor Patient RAG Backend Service (doctorPatientRagSearch)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("Input Validation", () => {
    it("validates valid input with UUID clinicId, patientId, and queryText", () => {
      const valid = validateDoctorPatientRagInput({
        clinicId: CLINIC_A,
        patientId: PATIENT_A,
        queryText: "Review asthma treatment plan and recent BP",
        matchCount: 6,
      });

      expect(valid.clinicId).toBe(CLINIC_A);
      expect(valid.patientId).toBe(PATIENT_A);
      expect(valid.queryText).toBe("Review asthma treatment plan and recent BP");
      expect(valid.matchCount).toBe(6);
      expect(valid.similarityThreshold).toBe(0.0);
    });

    it("rejects non-UUID clinicId or patientId with INVALID_INPUT", () => {
      expect(() =>
        validateDoctorPatientRagInput({
          clinicId: "invalid-id",
          patientId: PATIENT_A,
          queryText: "question",
        })
      ).toThrow("INVALID_INPUT");

      expect(() =>
        validateDoctorPatientRagInput({
          clinicId: CLINIC_A,
          patientId: "not-a-uuid",
          queryText: "question",
        })
      ).toThrow("INVALID_INPUT");
    });

    it("rejects empty or whitespace queryText with INVALID_INPUT", () => {
      expect(() =>
        validateDoctorPatientRagInput({
          clinicId: CLINIC_A,
          patientId: PATIENT_A,
          queryText: "   ",
        })
      ).toThrow("INVALID_INPUT");
    });
  });

  describe("Requirement 1: Authorized Doctor Clinical Encounter Synthesis", () => {
    it("executes RAG search, combines longitudinal patient records with guidelines, and settles AI credit", async () => {
      const { userDb, adminDb, adminRpc } = createMockDbs();
      const searchMock = vi.fn(async (_db, opts) => (opts.domain === "CLINIC" ? sampleGuidelines : []));
      const synthMock = vi.fn(async (q, ctx, passages) => {
        expect(ctx).toContain("Aarav Sharma");
        expect(ctx).toContain("Persistent dry cough");
        expect(ctx).toContain("BP: 122/80");
        expect(ctx).toContain("Salbutamol Inhaler");
        expect(passages).toHaveLength(1);
        return "### Patient Clinical Analysis\n\nPatient shows improving respiratory stability with Salbutamol.";
      });

      const result = await executeDoctorPatientRagSearch(
        userDb as never,
        adminDb as never,
        DOCTOR_USER_ID,
        {
          clinicId: CLINIC_A,
          patientId: PATIENT_A,
          queryText: "Summarize recent consultations and active inhaler therapy",
        },
        { search: searchMock, synthesize: synthMock }
      );

      expect(result.answer).toContain("Patient shows improving respiratory stability");
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0]?.title).toBe("Clinical Protocol: Adult Bronchitis");
      expect(result.patientContextSummary).toEqual({
        patientName: "Aarav Sharma",
        patientNumber: "PAT-00123",
        consultationsCount: 1,
        vitalsCount: 1,
        prescriptionsCount: 1,
      });

      // Verify AI Credit settlement with success: true
      expect(adminRpc).toHaveBeenCalledWith(
        "ai_reserve_credit_as",
        expect.objectContaining({ p_clinic: CLINIC_A, p_user: DOCTOR_USER_ID })
      );
      expect(adminRpc).toHaveBeenCalledWith(
        "ai_finish_credit_as",
        expect.objectContaining({ p_success: true, p_user: DOCTOR_USER_ID })
      );
    });

    it("allows clinic OWNER to also execute doctorPatientRagSearch", async () => {
      const { userDb, adminDb } = createMockDbs({ membershipRole: "OWNER" });
      const searchMock = vi.fn(async () => sampleGuidelines);
      const synthMock = vi.fn(async () => "Owner view clinical context.");

      const result = await executeDoctorPatientRagSearch(
        userDb as never,
        adminDb as never,
        DOCTOR_USER_ID,
        {
          clinicId: CLINIC_A,
          patientId: PATIENT_A,
          queryText: "Clinical summary",
        },
        { search: searchMock, synthesize: synthMock }
      );

      expect(result.answer).toBe("Owner view clinical context.");
    });
  });

  describe("Requirement 2: Cross-Tenant Multi-Tenant Isolation Enforcement", () => {
    it("fails closed with NOT_AUTHORISED when doctor queries patient belonging to another clinic", async () => {
      // Patient belongs to CLINIC_B, but doctor queries with CLINIC_A
      const crossTenantPatient = { ...samplePatient, id: PATIENT_B, clinic_id: CLINIC_B };
      const { userDb, adminDb, adminRpc } = createMockDbs({ patientData: crossTenantPatient });
      const searchMock = vi.fn();

      await expect(
        executeDoctorPatientRagSearch(
          userDb as never,
          adminDb as never,
          DOCTOR_USER_ID,
          {
            clinicId: CLINIC_A,
            patientId: PATIENT_B,
            queryText: "Cross tenant data probe",
          },
          { search: searchMock }
        )
      ).rejects.toThrow("NOT_AUTHORISED");

      expect(searchMock).not.toHaveBeenCalled();
      // Credit reservation is never invoked because tenant auth fails prior to metering
      expect(adminRpc).not.toHaveBeenCalledWith("ai_reserve_credit_as", expect.anything());
    });

    it("fails closed with NOT_AUTHORISED when caller has non-clinical role (e.g. STAFF)", async () => {
      const { userDb, adminDb, adminRpc } = createMockDbs({ membershipRole: "STAFF" });

      await expect(
        executeDoctorPatientRagSearch(
          userDb as never,
          adminDb as never,
          DOCTOR_USER_ID,
          {
            clinicId: CLINIC_A,
            patientId: PATIENT_A,
            queryText: "Staff unauthorized probe",
          }
        )
      ).rejects.toThrow("NOT_AUTHORISED");

      expect(adminRpc).not.toHaveBeenCalledWith("ai_reserve_credit_as", expect.anything());
    });

    it("fails closed with NOT_AUTHORISED when clinic is not operational", async () => {
      const { userDb, adminDb } = createMockDbs({ clinicOperational: false });

      await expect(
        executeDoctorPatientRagSearch(
          userDb as never,
          adminDb as never,
          DOCTOR_USER_ID,
          {
            clinicId: CLINIC_A,
            patientId: PATIENT_A,
            queryText: "Suspended clinic probe",
          }
        )
      ).rejects.toThrow("NOT_AUTHORISED");
    });
  });

  describe("Requirement 3: Credit Metering Allowance & Limit Rejection", () => {
    it("rejects search with AI_LIMIT_REACHED when clinic has zero remaining AI credits", async () => {
      const { userDb, adminDb, adminRpc } = createMockDbs({
        creditAllowed: false,
        creditReason: "LIMIT_REACHED",
      });
      const searchMock = vi.fn();

      await expect(
        executeDoctorPatientRagSearch(
          userDb as never,
          adminDb as never,
          DOCTOR_USER_ID,
          {
            clinicId: CLINIC_A,
            patientId: PATIENT_A,
            queryText: "Clinical summary",
          },
          { search: searchMock }
        )
      ).rejects.toThrow("AI_LIMIT_REACHED");

      expect(searchMock).not.toHaveBeenCalled();
      // Does not settle success
      expect(adminRpc).not.toHaveBeenCalledWith("ai_finish_credit_as", expect.anything());
    });

    it("rejects search with AI_NOT_INCLUDED when clinic plan lacks AI entitlements", async () => {
      const { userDb, adminDb } = createMockDbs({ aiEnabled: false });

      await expect(
        executeDoctorPatientRagSearch(
          userDb as never,
          adminDb as never,
          DOCTOR_USER_ID,
          {
            clinicId: CLINIC_A,
            patientId: PATIENT_A,
            queryText: "Clinical summary",
          }
        )
      ).rejects.toThrow("AI_NOT_INCLUDED");
    });
  });

  describe("Requirement 4: Credit Reservation Settlement and Refund on Failure", () => {
    it("settles credit with p_success: false when synthesis or retrieval throws an error", async () => {
      const { userDb, adminDb, adminRpc } = createMockDbs();
      const failingSynth = vi.fn(async () => {
        throw new Error("AI_RATE_LIMITED");
      });

      await expect(
        executeDoctorPatientRagSearch(
          userDb as never,
          adminDb as never,
          DOCTOR_USER_ID,
          {
            clinicId: CLINIC_A,
            patientId: PATIENT_A,
            queryText: "Clinical summary",
          },
          {
            search: vi.fn(async () => sampleGuidelines),
            synthesize: failingSynth,
          }
        )
      ).rejects.toThrow("AI_RATE_LIMITED");

      // Verify credit reservation was attempted, and settlement refunded via p_success: false
      expect(adminRpc).toHaveBeenCalledWith(
        "ai_reserve_credit_as",
        expect.objectContaining({ p_clinic: CLINIC_A, p_user: DOCTOR_USER_ID })
      );
      expect(adminRpc).toHaveBeenCalledWith(
        "ai_finish_credit_as",
        expect.objectContaining({ p_success: false, p_user: DOCTOR_USER_ID })
      );
    });
  });
});
