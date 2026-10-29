import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  selfRegistrationSchema,
  resendActivationSchema,
  type SelfRegistrationInput,
} from "@/lib/patient-registration";
import {
  createPatientRegistrationUrl,
  validatePatientRegistrationPayload,
} from "@/lib/qr-payload";

// Setup state for mocks
let mockClinicData: any = null;
let mockVerificationData: any = { status: "APPROVED" };
let mockSubscriptionClinicsData: any = [
  { subscription: { status: "ACTIVE", trial_end_date: null } },
];
let mockVerificationEventsData: any = [{ event_type: "APPROVED", created_at: "2026-10-29T00:00:00Z" }];
let mockClinicReverificationsData: any = null;

let mockExistingPatient: any = null;
let mockInsertedPatient: any = null;
let mockInviteError: any = null;
let mockUnlinkedPatients: any[] = [];
let mockExistingMember: any = null;
let mockProfile: any = null;
let mockAuthUser: any = null;
let mockTargetPatient: any = null;
let mockAlreadyLinkedClinicPatient: any = null;
let mockAtomicClaimSuccess = true;
const auditLogs: any[] = [];
const memberInserts: any[] = [];
const patientUpdates: any[] = [];
const patientDeletes: any[] = [];
let inviteCalls: any[] = [];

const mockDb = {
  from: (table: string) => {
    const filters: Record<string, any> = {};
    let isUpdate = false;
    let updatePayload: any = null;

    const chain: any = {
      select: vi.fn(() => chain),
      insert: vi.fn((data: any) => {
        if (table === "patients") {
          mockInsertedPatient = { id: "new-patient-uuid", ...data };
        }
        if (table === "clinic_members") {
          memberInserts.push(data);
        }
        if (table === "audit_logs") {
          auditLogs.push(data);
        }
        return chain;
      }),
      update: vi.fn((data: any) => {
        isUpdate = true;
        updatePayload = data;
        return chain;
      }),
      delete: vi.fn(() => {
        if (table === "patients") {
          patientDeletes.push({ ...filters });
        }
        return chain;
      }),
      eq: vi.fn((col: string, val: any) => {
        filters[col] = val;
        return chain;
      }),
      ilike: vi.fn((col: string, val: any) => {
        filters[col] = val;
        return chain;
      }),
      is: vi.fn((col: string, val: any) => {
        filters[col] = val;
        return chain;
      }),
      in: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      single: vi.fn(async () => {
        if (table === "patients") {
          return { data: mockInsertedPatient, error: null };
        }
        return { data: null, error: null };
      }),
      maybeSingle: vi.fn(async () => {
        if (table === "clinics") {
          return { data: mockClinicData, error: null };
        }
        if (table === "clinic_verifications") {
          return { data: mockVerificationData, error: null };
        }
        if (table === "clinic_reverifications") {
          return { data: mockClinicReverificationsData, error: null };
        }
        if (table === "patients") {
          if (isUpdate) {
            patientUpdates.push({ filters: { ...filters }, data: updatePayload });
            if (!mockAtomicClaimSuccess) {
              return { data: null, error: null }; // Simulate concurrent race condition
            }
            return {
              data: {
                id: filters["id"] || "claimed-p-id",
                clinic_id: filters["clinic_id"] || clinicId,
                first_name: "Anita",
                last_name: "Sharma",
              },
              error: null,
            };
          }
          // If checking already linked patient by user_id
          if (filters["user_id"]) {
            return { data: mockAlreadyLinkedClinicPatient, error: null };
          }
          // If targeted by ID (metadata priority match)
          if (filters["id"]) {
            if (mockTargetPatient) {
              return { data: mockTargetPatient, error: null };
            }
            if (mockInsertedPatient && mockInsertedPatient.id === filters["id"]) {
              return { data: mockInsertedPatient, error: null };
            }
            const found = mockUnlinkedPatients.find(p => p.id === filters["id"]);
            if (found) {
              return { data: found, error: null };
            }
          }
          return { data: mockExistingPatient, error: null };
        }
        if (table === "clinic_members") {
          return { data: mockExistingMember, error: null };
        }
        if (table === "profiles") {
          return { data: mockProfile, error: null };
        }
        return { data: null, error: null };
      }),
      then: (resolve: any) => {
        if (table === "patients") {
          let list = [...mockUnlinkedPatients];
          if (filters["email"]) {
            list = list.filter(p => p.email?.toLowerCase() === filters["email"].toLowerCase());
          }
          if (filters["user_id"] === null) {
            list = list.filter(p => !p.user_id);
          }
          return resolve({ data: list, error: null });
        }
        if (table === "subscription_clinics") {
          return resolve({ data: mockSubscriptionClinicsData, error: null });
        }
        if (table === "verification_events") {
          return resolve({ data: mockVerificationEventsData, error: null });
        }
        return resolve({ data: [], error: null });
      },
    };
    return chain;
  },
  rpc: vi.fn(async () => {
    return { data: true, error: null };
  }),
  auth: {
    admin: {
      getUserById: vi.fn(async (userId: string) => {
        if (mockAuthUser && mockAuthUser.id === userId) {
          return { data: { user: mockAuthUser }, error: null };
        }
        return { data: { user: null }, error: new Error("User not found") };
      }),
      inviteUserByEmail: vi.fn(async (email: string, options: any) => {
        inviteCalls.push({ email, options });
        if (mockInviteError) {
          return { data: null, error: mockInviteError };
        }
        return { data: { user: { id: "new-auth-user-id", email } }, error: null };
      }),
    },
  },
};

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: mockDb,
}));

// Dynamic import of the server module after mocking
const {
  getPublicClinicInfo,
  registerPatientSelf,
  resendPatientActivation,
  linkVerifiedPatientAccount,
  checkRateLimit,
  resetRateLimits,
} = await import("@/lib/patient-registration.server");

const clinicId = "550e8400-e29b-41d4-a716-446655440000";
const otherClinicId = "660f9511-f30c-42e5-b827-557766551111";
const patientUserId = "a1111111-b222-c333-d444-e55555555555";

const validRegistrationPayload: SelfRegistrationInput = {
  clinicId,
  first_name: "Anita",
  last_name: "Sharma",
  email: "ANITA.SHARMA@EXAMPLE.COM",
  phone: "+91 98765 43210",
  date_of_birth: "1990-05-15",
  gender: "Female",
  address: "123 Park Street, Kolkata",
  emergency_contact_name: "Rajesh Sharma",
  emergency_contact_phone: "+91 98765 00000",
  notes: "Follow-up consultation for seasonal allergies.",
  consent: true,
};

describe("Patient Self-Registration Schema & Validation", () => {
  it("accepts a valid patient registration payload and normalizes values", () => {
    const parsed = selfRegistrationSchema.parse(validRegistrationPayload);
    expect(parsed.first_name).toBe("Anita");
    expect(parsed.last_name).toBe("Sharma");
    expect(parsed.email).toBe("anita.sharma@example.com"); // normalized to lowercase
    expect(parsed.phone).toBe("+919876543210"); // stripped formatting
    expect(parsed.date_of_birth).toBe("1990-05-15");
    expect(parsed.consent).toBe(true);
  });

  it("requires first_name and email", () => {
    expect(() =>
      selfRegistrationSchema.parse({ ...validRegistrationPayload, first_name: "" })
    ).toThrow();

    expect(() =>
      selfRegistrationSchema.parse({ ...validRegistrationPayload, email: "" })
    ).toThrow();
  });

  it("rejects invalid email formats", () => {
    for (const badEmail of ["notanemail", "user@", "@domain.com", "user@.com"]) {
      expect(() =>
        selfRegistrationSchema.parse({ ...validRegistrationPayload, email: badEmail })
      ).toThrow();
    }
  });

  it("rejects invalid phone formats", () => {
    for (const badPhone of ["123", "abc", "phone12345", "12345678901234567890"]) {
      expect(() =>
        selfRegistrationSchema.parse({ ...validRegistrationPayload, phone: badPhone })
      ).toThrow();
    }
  });

  it("rejects future date of birth and impossible dates", () => {
    expect(() =>
      selfRegistrationSchema.parse({ ...validRegistrationPayload, date_of_birth: "2999-01-01" })
    ).toThrow();

    expect(() =>
      selfRegistrationSchema.parse({ ...validRegistrationPayload, date_of_birth: "2026-02-31" })
    ).toThrow();
  });

  it("strictly requires patient consent", () => {
    expect(() =>
      selfRegistrationSchema.parse({ ...validRegistrationPayload, consent: false })
    ).toThrow();
  });

  it("validates resend activation schema", () => {
    const parsed = resendActivationSchema.parse({
      clinicId,
      email: " PATIENT@EXAMPLE.COM ",
    });
    expect(parsed.email).toBe("patient@example.com");
    expect(parsed.clinicId).toBe(clinicId);
  });
});

describe("QR Code Workflow & Legacy URL Compatibility", () => {
  it("generates QR destination pointing to the public clinic registration page", () => {
    const url = createPatientRegistrationUrl("https://app.careflow.ai", clinicId);
    expect(url).toBe(`https://app.careflow.ai/register?clinic=${clinicId}`);
  });

  it("validates the new canonical public registration URL", () => {
    const canonical = `https://app.careflow.ai/register?clinic=${clinicId}`;
    const result = validatePatientRegistrationPayload(canonical);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.clinicId).toBe(clinicId);
      expect(result.registrationUrl).toBe(canonical);
    }
  });

  it("validates legacy QR codes pointing to /clinic/patients/new for seamless backward compatibility", () => {
    const legacy = `https://app.careflow.ai/clinic/patients/new?clinic=${clinicId}`;
    const result = validatePatientRegistrationPayload(legacy);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.clinicId).toBe(clinicId);
      expect(result.registrationUrl).toBe(legacy);
    }
  });

  it("prevents clinic mismatch when expected clinic is provided", () => {
    const canonical = `https://app.careflow.ai/register?clinic=${clinicId}`;
    const result = validatePatientRegistrationPayload(canonical, otherClinicId);
    expect(result.success).toBe(false);
  });
});

describe("Server-Side Clinic Identification & Operational Security (Regression Suite)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    mockClinicData = {
      id: clinicId,
      name: "Apollo City Clinic",
      display_name: "Apollo City Clinic - Main Branch",
      address: "100 Medical Road",
      city: "Kolkata",
      phone: "+91 33 2222 3333",
      status: "ACTIVE",
    };
    mockVerificationData = { status: "APPROVED" };
    mockSubscriptionClinicsData = [
      { subscription: { status: "ACTIVE", trial_end_date: null } },
    ];
    mockVerificationEventsData = [{ event_type: "APPROVED", created_at: "2026-10-29T00:00:00Z" }];
    mockClinicReverificationsData = null;
  });

  it("rejects non-UUID clinic IDs", async () => {
    await expect(getPublicClinicInfo("invalid-id")).rejects.toThrow("Invalid clinic identifier");
  });

  it("rejects non-existent clinics", async () => {
    mockClinicData = null;
    await expect(getPublicClinicInfo(clinicId)).rejects.toThrow("Clinic not found");
  });

  it("rejects inactive clinics", async () => {
    mockClinicData.status = "INACTIVE";
    await expect(getPublicClinicInfo(clinicId)).rejects.toThrow("unavailable");
  });

  it("rejects unverified clinics (e.g. DRAFT)", async () => {
    mockVerificationData = { status: "DRAFT" };
    await expect(getPublicClinicInfo(clinicId)).rejects.toThrow("unavailable");
  });

  it("rejects clinics without active subscription or trial", async () => {
    mockSubscriptionClinicsData = [];
    await expect(getPublicClinicInfo(clinicId)).rejects.toThrow("unavailable");
  });

  it("rejects clinics with expired trial", async () => {
    mockSubscriptionClinicsData = [
      {
        subscription: {
          status: "TRIAL_ACTIVE",
          trial_end_date: "2020-01-01T00:00:00Z", // expired
        },
      },
    ];
    await expect(getPublicClinicInfo(clinicId)).rejects.toThrow("unavailable");
  });

  it("rejects suspended clinics via verification events", async () => {
    mockVerificationEventsData = [{ event_type: "SUSPENDED", created_at: "2026-10-30T00:00:00Z" }];
    await expect(getPublicClinicInfo(clinicId)).rejects.toThrow("unavailable");
  });

  it("rejects revoked clinics via verification events", async () => {
    mockVerificationEventsData = [{ event_type: "REVOKED_AFTER_APPROVAL", created_at: "2026-10-30T00:00:00Z" }];
    await expect(getPublicClinicInfo(clinicId)).rejects.toThrow("unavailable");
  });

  it("allows operational clinics during responded reverification review", async () => {
    mockVerificationData = { status: "PENDING_REVIEW" };
    mockClinicReverificationsData = { status: "RESPONDED" };

    const info = await getPublicClinicInfo(clinicId);
    expect(info.clinicId).toBe(clinicId);
    expect(info.name).toBe("Apollo City Clinic");
  });

  it("returns strictly public clinic info for an eligible operational clinic without leaking private details", async () => {
    const info = await getPublicClinicInfo(clinicId);
    expect(info).toEqual({
      clinicId,
      name: "Apollo City Clinic",
      displayName: "Apollo City Clinic - Main Branch",
      address: "100 Medical Road",
      city: "Kolkata",
      phone: "+91 33 2222 3333",
    });
    // Ensure no sensitive or private clinic metadata
    expect((info as any).registration_number).toBeUndefined();
    expect((info as any).owner_user_id).toBeUndefined();
    expect((info as any).subscription).toBeUndefined();
  });
});

describe("Patient Self-Registration Execution & Invitation Consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    mockClinicData = {
      id: clinicId,
      name: "Apollo City Clinic",
      display_name: "Apollo City Clinic",
      address: "100 Medical Road",
      city: "Kolkata",
      phone: "+91 33 2222 3333",
      status: "ACTIVE",
    };
    mockVerificationData = { status: "APPROVED" };
    mockSubscriptionClinicsData = [
      { subscription: { status: "ACTIVE", trial_end_date: null } },
    ];
    mockVerificationEventsData = [{ event_type: "APPROVED", created_at: "2026-10-29T00:00:00Z" }];
    mockClinicReverificationsData = null;
    mockExistingPatient = null;
    mockInsertedPatient = null;
    mockInviteError = null;
    inviteCalls = [];
    patientDeletes.length = 0;
  });

  it("creates an unlinked patient record and invites user with registration metadata", async () => {
    const origin = "https://careflow.ai";
    const res = await registerPatientSelf(origin, validRegistrationPayload);

    expect(res.status).toBe("CREATED_INVITED");
    if (res.status === "CREATED_INVITED") {
      expect(res.email).toBe("anita.sharma@example.com");
      expect(res.patientNumber).toMatch(/^P-\d+/);
    }

    // Verify patient was inserted with user_id = null
    expect(mockInsertedPatient).not.toBeNull();
    expect(mockInsertedPatient.clinic_id).toBe(clinicId);
    expect(mockInsertedPatient.user_id).toBeNull();
    expect(mockInsertedPatient.first_name).toBe("Anita");
    expect(mockInsertedPatient.last_name).toBe("Sharma");
    expect(mockInsertedPatient.email).toBe("anita.sharma@example.com");
    expect(mockInsertedPatient.status).toBe("ACTIVE");

    // Verify invite was triggered with specific registration metadata binding
    expect(inviteCalls).toHaveLength(1);
    expect(inviteCalls[0].email).toBe("anita.sharma@example.com");
    expect(inviteCalls[0].options.redirectTo).toBe("https://careflow.ai/reset-password");
    expect(inviteCalls[0].options.data.display_name).toBe("Anita Sharma");
    expect(inviteCalls[0].options.data.registration_patient_id).toBe("new-patient-uuid");
    expect(inviteCalls[0].options.data.registration_clinic_id).toBe(clinicId);
  });

  it("prevents duplicate registration when email is already registered and linked", async () => {
    mockExistingPatient = {
      id: "existing-p-1",
      clinic_id: clinicId,
      user_id: patientUserId,
      patient_number: "P-1001",
      email: "anita.sharma@example.com",
      status: "ACTIVE",
    };

    const res = await registerPatientSelf("https://careflow.ai", validRegistrationPayload);
    expect(res.status).toBe("EXISTS_LINKED");
    expect(res.message).toContain("already registered at this clinic");
    expect(inviteCalls).toHaveLength(0);
  });

  it("detects existing registration pending email activation", async () => {
    mockExistingPatient = {
      id: "existing-p-2",
      clinic_id: clinicId,
      user_id: null, // pending activation
      patient_number: "P-1002",
      email: "anita.sharma@example.com",
      status: "ACTIVE",
    };

    const res = await registerPatientSelf("https://careflow.ai", validRegistrationPayload);
    expect(res.status).toBe("EXISTS_PENDING");
    expect(res.message).toContain("pending activation");
    expect(inviteCalls).toHaveLength(0);
  });

  it("handles existing Supabase Auth users safely without creating duplicate auth accounts", async () => {
    mockInviteError = { status: 422, message: "A user with this email address has already been registered" };

    const res = await registerPatientSelf("https://careflow.ai", validRegistrationPayload);
    expect(res.status).toBe("CREATED_EXISTING_USER");
    expect(res.message).toContain("already have an existing CAREFLOW account");

    // Patient record was created and preserved, unlinked until authenticated login
    expect(mockInsertedPatient).not.toBeNull();
    expect(mockInsertedPatient.user_id).toBeNull();
    expect(patientDeletes).toHaveLength(0);
  });

  it("retains inserted patient record and returns CREATED_INVITE_PENDING when invitation email delivery fails", async () => {
    mockInviteError = new Error("SMTP connection failed. Email service unavailable.");

    const res = await registerPatientSelf("https://careflow.ai", validRegistrationPayload);

    // Record is NOT deleted, preserving audit log integrity
    expect(res.status).toBe("CREATED_INVITE_PENDING");
    expect(res.message).toContain("Resend activation link");
    expect(mockInsertedPatient).not.toBeNull();
    expect(mockInsertedPatient.user_id).toBeNull();
    expect(patientDeletes).toHaveLength(0);
  });
});

describe("Resend Patient Activation & Anti-Enumeration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    inviteCalls = [];
  });

  it("resends invite email for an unactivated patient and returns anti-enumeration message", async () => {
    mockExistingPatient = {
      id: "p-unlinked",
      clinic_id: clinicId,
      user_id: null,
      first_name: "Anita",
      last_name: "Sharma",
    };

    const res = await resendPatientActivation("https://careflow.ai", {
      clinicId,
      email: "anita.sharma@example.com",
    });

    expect(res.ok).toBe(true);
    expect(res.message).toContain("If an unactivated patient registration exists");
    expect(inviteCalls).toHaveLength(1);
    expect(inviteCalls[0].email).toBe("anita.sharma@example.com");
  });

  it("returns the exact same message when email does not exist (prevents enumeration)", async () => {
    mockExistingPatient = null;

    const res = await resendPatientActivation("https://careflow.ai", {
      clinicId,
      email: "nonexistent@example.com",
    });

    expect(res.ok).toBe(true);
    expect(res.message).toContain("If an unactivated patient registration exists");
    expect(inviteCalls).toHaveLength(0);
  });
});

describe("Rate Limiting Hardening & Abuse Protection", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("enforces sliding-window rate limit threshold and throws generic message", () => {
    const key = "test-rate-limit-key";
    // 3 attempts allowed
    checkRateLimit(key, 3, 60000);
    checkRateLimit(key, 3, 60000);
    checkRateLimit(key, 3, 60000);

    expect(() => checkRateLimit(key, 3, 60000)).toThrow(
      "Too many attempts. Please wait a few minutes before trying again."
    );
  });

  it("prunes expired keys when store exceeds threshold", () => {
    const oldNow = Date.now();
    // Simulate filling map with expired entries
    for (let i = 0; i < 550; i++) {
      checkRateLimit(`dummy-key-${i}`, 1, 10);
    }
    // Advance time past expiration
    vi.spyOn(Date, "now").mockReturnValue(oldNow + 100);
    // Trigger check which activates pruneRateLimitStore()
    checkRateLimit("fresh-key", 5, 60000);
    vi.restoreAllMocks();
  });

  it("enforces IP-based rate limiting on registration", async () => {
    mockClinicData = { id: clinicId, name: "Apollo", display_name: "Apollo", status: "ACTIVE" };

    const clientIp = "192.168.1.100";
    // Exhaust IP rate limit (20)
    for (let i = 0; i < 20; i++) {
      checkRateLimit(`ip:reg:${clientIp}`, 20, 15 * 60 * 1000);
    }

    await expect(
      registerPatientSelf("https://careflow.ai", validRegistrationPayload, clientIp)
    ).rejects.toThrow("Too many attempts");
  });
});

describe("Verified Patient Account Linking & Tenant Isolation (Harden Review)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    patientUpdates.length = 0;
    memberInserts.length = 0;
    auditLogs.length = 0;
    mockTargetPatient = null;
    mockAlreadyLinkedClinicPatient = null;
    mockAtomicClaimSuccess = true;
    mockProfile = { display_name: null };
  });

  it("rejects unverified users whose email is not confirmed in Supabase Auth", async () => {
    mockAuthUser = {
      id: patientUserId,
      email: "anita.sharma@example.com",
      email_confirmed_at: null, // UNVERIFIED!
      confirmed_at: null,
    };

    const result = await linkVerifiedPatientAccount(patientUserId, "anita.sharma@example.com");
    expect(result.linkedCount).toBe(0);
    expect(patientUpdates).toHaveLength(0);
    expect(memberInserts).toHaveLength(0);
  });

  it("does not trust client-supplied email; strictly uses verified email from Auth", async () => {
    mockAuthUser = {
      id: patientUserId,
      email: "trusted.auth.email@example.com",
      email_confirmed_at: "2026-10-29T10:00:00Z",
    };

    mockUnlinkedPatients = [
      {
        id: "p-wrong",
        clinic_id: clinicId,
        first_name: "Attacker",
        last_name: "Target",
        email: "spoofed.victim@example.com",
      },
    ];

    // Client maliciously passes spoofed victim email
    const result = await linkVerifiedPatientAccount(patientUserId, "spoofed.victim@example.com");
    // Should NOT link p-wrong because Auth user's email is trusted.auth.email@example.com
    expect(result.linkedCount).toBe(0);
    expect(patientUpdates).toHaveLength(0);
  });

  it("links the specific registration record stored in Auth metadata", async () => {
    mockAuthUser = {
      id: patientUserId,
      email: "anita.sharma@example.com",
      email_confirmed_at: "2026-10-29T10:00:00Z",
      user_metadata: {
        registration_patient_id: "patient-exact-meta-id",
        registration_clinic_id: clinicId,
      },
    };

    mockTargetPatient = {
      id: "patient-exact-meta-id",
      clinic_id: clinicId,
      first_name: "Anita",
      last_name: "Sharma",
      email: "anita.sharma@example.com",
      user_id: null,
    };

    const result = await linkVerifiedPatientAccount(patientUserId);
    expect(result.linkedCount).toBe(1);

    expect(patientUpdates).toHaveLength(1);
    expect(patientUpdates[0].data.user_id).toBe(patientUserId);
    expect(memberInserts).toHaveLength(1);
    expect(memberInserts[0]).toEqual({
      clinic_id: clinicId,
      user_id: patientUserId,
      role: "PATIENT",
      status: "ACTIVE",
      joined_at: expect.any(String),
    });

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].action).toBe("PATIENT_LINKED");
    expect(auditLogs[0].metadata).toEqual({ method: "SELF_REGISTRATION_VERIFIED" });
  });

  it("prevents claiming another patient's record if email does not match Auth", async () => {
    mockAuthUser = {
      id: patientUserId,
      email: "malicious.user@example.com",
      email_confirmed_at: "2026-10-29T10:00:00Z",
      user_metadata: {
        registration_patient_id: "victim-patient-id",
        registration_clinic_id: clinicId,
      },
    };

    mockTargetPatient = {
      id: "victim-patient-id",
      clinic_id: clinicId,
      first_name: "Victim",
      last_name: "Patient",
      email: "real.victim@example.com", // Mismatch with malicious.user!
      user_id: null,
    };

    const result = await linkVerifiedPatientAccount(patientUserId);
    expect(result.linkedCount).toBe(0);
    expect(patientUpdates).toHaveLength(0);
  });

  it("prevents linking multiple patient records in the same clinic to one user", async () => {
    mockAuthUser = {
      id: patientUserId,
      email: "anita.sharma@example.com",
      email_confirmed_at: "2026-10-29T10:00:00Z",
    };

    // Simulate that this user already has a linked patient record in this clinic!
    mockAlreadyLinkedClinicPatient = { id: "already-linked-patient-id" };

    mockUnlinkedPatients = [
      {
        id: "duplicate-patient-in-same-clinic",
        clinic_id: clinicId,
        first_name: "Anita",
        last_name: "Sharma",
        email: "anita.sharma@example.com",
      },
    ];

    const result = await linkVerifiedPatientAccount(patientUserId);
    expect(result.linkedCount).toBe(0);
    expect(patientUpdates).toHaveLength(0);
  });

  it("handles concurrent atomic claims safely without duplicate links", async () => {
    mockAuthUser = {
      id: patientUserId,
      email: "anita.sharma@example.com",
      email_confirmed_at: "2026-10-29T10:00:00Z",
      user_metadata: {
        registration_patient_id: "target-id",
        registration_clinic_id: clinicId,
      },
    };

    mockTargetPatient = {
      id: "target-id",
      clinic_id: clinicId,
      first_name: "Anita",
      last_name: "Sharma",
      email: "anita.sharma@example.com",
      user_id: null,
    };

    // Simulate that another request won the race condition and claimed user_id IS NULL first
    mockAtomicClaimSuccess = false;

    const result = await linkVerifiedPatientAccount(patientUserId);
    expect(result.linkedCount).toBe(0);
    expect(memberInserts).toHaveLength(0);
  });
});
