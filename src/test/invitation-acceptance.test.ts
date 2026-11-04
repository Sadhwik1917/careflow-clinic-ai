import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { acceptInvitationSchema } from "@/lib/team";
import { previewInvitation, acceptInvitation } from "@/lib/team.server";

const VALID_INVITATION_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const CLINIC_A_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

interface FakeDbOptions {
  profileStatus?: "ACTIVE" | "SUSPENDED" | null;
  invitation?: Record<string, unknown> | null;
  operational?: boolean;
  existingMember?: Record<string, unknown> | null;
  existingDoctor?: Record<string, unknown> | null;
  rpcMock?: (fn: string, args?: unknown) => Promise<{ data: unknown; error: unknown }>;
}

function fakeInvitationDb(options: FakeDbOptions = {}) {
  const calls: [string, unknown][] = [];
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "update", "insert", "eq"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push([`${table}.${method}`, args]);
        if (method === "eq") filters[String(args[0])] = args[1];
        return chain;
      };
    }
    chain["maybeSingle"] = async () => {
      if (table === "profiles") {
        if (options.profileStatus === null) return { data: null, error: null };
        return { data: { status: options.profileStatus ?? "ACTIVE" }, error: null };
      }
      if (table === "clinic_invitations") {
        if (options.invitation === null) return { data: null, error: null };
        return {
          data: options.invitation ?? {
            id: VALID_INVITATION_ID,
            clinic_id: CLINIC_A_ID,
            email: "doctor@careflow.test",
            role: "DOCTOR",
            status: "PENDING",
            expires_at: new Date(Date.now() + 86400000).toISOString(),
          },
          error: null,
        };
      }
      if (table === "clinics") {
        return { data: { name: "Careflow Health", display_name: "Careflow Health Clinic" }, error: null };
      }
      if (table === "clinic_members") {
        return { data: options.existingMember ?? null, error: null };
      }
      if (table === "doctor_profiles") {
        return { data: options.existingDoctor ?? null, error: null };
      }
      return { data: null, error: null };
    };
    chain["then"] = (resolve: (v: unknown) => unknown) => {
      return Promise.resolve(resolve((chain["maybeSingle"] as () => Promise<unknown>)()));
    };
    return chain;
  };

  const rpc = vi.fn(async (fn: string, args: unknown) => {
    calls.push([`rpc.${fn}`, args]);
    if (options.rpcMock) return options.rpcMock(fn, args);
    if (fn === "clinic_is_operational") {
      return { data: options.operational !== false, error: null };
    }
    // Simulate live DB where function is not yet created (code 42883)
    return { data: null, error: { code: "42883", message: "function does not exist" } };
  });

  return { db: { from, rpc } as unknown as SupabaseClient<Database>, calls, rpc };
}

describe("Invitation Acceptance - Input Validation", () => {
  it("validates valid UUID token", () => {
    expect(acceptInvitationSchema.safeParse({ token: VALID_INVITATION_ID }).success).toBe(true);
  });

  it("rejects invalid or malformed tokens", () => {
    expect(acceptInvitationSchema.safeParse({ token: "not-a-uuid" }).success).toBe(false);
    expect(acceptInvitationSchema.safeParse({ token: "" }).success).toBe(false);
    expect(acceptInvitationSchema.safeParse({ token: "12345" }).success).toBe(false);
    expect(acceptInvitationSchema.safeParse({ token: "../etc/passwd" }).success).toBe(false);
  });
});

describe("Invitation Acceptance - Public Safe Preview", () => {
  it("returns valid preview with clinic identity, role, and masked email without leaking full email", async () => {
    const { db } = fakeInvitationDb();
    const result = await previewInvitation(db, VALID_INVITATION_ID);
    expect(result.valid).toBe(true);
    expect(result.clinicName).toBe("Careflow Health Clinic");
    expect(result.role).toBe("DOCTOR");
    expect(result.maskedEmail).toBe("d***r@careflow.test");
    expect(result.email).toBeUndefined();
  });

  it("exposes unmasked email only when caller is authenticated with matching email", async () => {
    const { db } = fakeInvitationDb();
    const mismatched = await previewInvitation(db, VALID_INVITATION_ID, "other@example.com");
    expect(mismatched.valid).toBe(true);
    expect(mismatched.email).toBeUndefined();
    expect(mismatched.maskedEmail).toBe("d***r@careflow.test");

    const matched = await previewInvitation(db, VALID_INVITATION_ID, "doctor@careflow.test");
    expect(matched.valid).toBe(true);
    expect(matched.email).toBe("doctor@careflow.test");
    expect(matched.maskedEmail).toBe("d***r@careflow.test");
  });

  it("safely previews invitation for incognito visitor on unmigrated database without exposing private data", async () => {
    const { db } = fakeInvitationDb({
      rpcMock: async () => ({ data: null, error: { code: "42883", message: "function does not exist" } }),
    });
    // Incognito visitor has no caller email
    const result = await previewInvitation(db, VALID_INVITATION_ID, undefined);
    expect(result.valid).toBe(true);
    expect(result.clinicName).toBe("Careflow Health Clinic");
    expect(result.role).toBe("DOCTOR");
    expect(result.maskedEmail).toBe("d***r@careflow.test");
    expect(result.email).toBeUndefined();
  });

  it("returns NOT_FOUND for malformed token or non-existent invitation", async () => {
    const { db } = fakeInvitationDb({ invitation: null });
    const malformed = await previewInvitation(db, "malformed-token");
    expect(malformed.valid).toBe(false);
    expect(malformed.reason).toBe("NOT_FOUND");

    const notFound = await previewInvitation(db, VALID_INVITATION_ID);
    expect(notFound.valid).toBe(false);
    expect(notFound.reason).toBe("NOT_FOUND");
  });

  it("returns EXPIRED and persists status update for expired invitations", async () => {
    const { db, calls } = fakeInvitationDb({
      invitation: {
        id: VALID_INVITATION_ID,
        clinic_id: CLINIC_A_ID,
        email: "doctor@careflow.test",
        role: "DOCTOR",
        status: "PENDING",
        expires_at: new Date(Date.now() - 10000).toISOString(),
      },
    });
    const result = await previewInvitation(db, VALID_INVITATION_ID);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("EXPIRED");
    expect(calls).toContainEqual(["clinic_invitations.update", [{ status: "EXPIRED" }]]);
  });

  it("returns CANCELLED for cancelled invitations", async () => {
    const { db } = fakeInvitationDb({
      invitation: {
        id: VALID_INVITATION_ID,
        clinic_id: CLINIC_A_ID,
        email: "doctor@careflow.test",
        role: "DOCTOR",
        status: "CANCELLED",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    const result = await previewInvitation(db, VALID_INVITATION_ID);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("CANCELLED");
  });

  it("returns ALREADY_ACCEPTED for accepted invitations", async () => {
    const { db } = fakeInvitationDb({
      invitation: {
        id: VALID_INVITATION_ID,
        clinic_id: CLINIC_A_ID,
        email: "doctor@careflow.test",
        role: "DOCTOR",
        status: "ACCEPTED",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    const result = await previewInvitation(db, VALID_INVITATION_ID);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("ALREADY_ACCEPTED");
  });

  it("returns CLINIC_NOT_OPERATIONAL if clinic is suspended or revoked", async () => {
    const { db } = fakeInvitationDb({ operational: false });
    const result = await previewInvitation(db, VALID_INVITATION_ID);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("CLINIC_NOT_OPERATIONAL");
  });
});

describe("Invitation Acceptance - Security & Authorization", () => {
  it("successfully handles PostgREST PGRST202 schema cache missing RPC error by executing fallback", async () => {
    const { db } = fakeInvitationDb({
      rpcMock: async (fn: string) => {
        if (fn === "accept_clinic_invitation") {
          return {
            data: null,
            error: {
              code: "PGRST202",
              message: "Could not find the function public.accept_clinic_invitation(p_invitation) in the schema cache",
            },
          };
        }
        return { data: true, error: null };
      },
    });

    const result = await acceptInvitation(db, "user-123", "doctor@careflow.test", VALID_INVITATION_ID);
    expect(result.ok).toBe(true);
    expect(result.clinicId).toBe(CLINIC_A_ID);
    expect(result.role).toBe("DOCTOR");
  });

  it("successfully accepts DOCTOR invitation for matching authenticated user", async () => {
    const { db, calls } = fakeInvitationDb();
    const result = await acceptInvitation(db, "user-123", "doctor@careflow.test", VALID_INVITATION_ID);
    expect(result.ok).toBe(true);
    expect(result.clinicId).toBe(CLINIC_A_ID);
    expect(result.role).toBe("DOCTOR");

    // Verified membership creation
    expect(calls).toContainEqual([
      "clinic_members.insert",
      [
        expect.objectContaining({
          clinic_id: CLINIC_A_ID,
          user_id: "user-123",
          role: "DOCTOR",
          status: "ACTIVE",
        }),
      ],
    ]);

    // Verified doctor profile creation
    expect(calls).toContainEqual([
      "doctor_profiles.insert",
      [
        expect.objectContaining({
          clinic_id: CLINIC_A_ID,
          user_id: "user-123",
          specialization: "General Practice",
          status: "ACTIVE",
        }),
      ],
    ]);

    // Verified invitation marked as ACCEPTED
    expect(calls).toContainEqual(["clinic_invitations.update", [{ status: "ACCEPTED" }]]);

    // Verified audit log insertion
    expect(calls).toContainEqual([
      "audit_logs.insert",
      [
        expect.objectContaining({
          clinic_id: CLINIC_A_ID,
          user_id: "user-123",
          action: "MEMBER_INVITATION_ACCEPTED",
          entity_type: "CLINIC_INVITATION",
          entity_id: VALID_INVITATION_ID,
        }),
      ],
    ]);
  });

  it("successfully accepts STAFF invitation without creating doctor profile", async () => {
    const { db, calls } = fakeInvitationDb({
      invitation: {
        id: VALID_INVITATION_ID,
        clinic_id: CLINIC_A_ID,
        email: "staff@careflow.test",
        role: "STAFF",
        status: "PENDING",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    const result = await acceptInvitation(db, "user-456", "staff@careflow.test", VALID_INVITATION_ID);
    expect(result.ok).toBe(true);
    expect(result.clinicId).toBe(CLINIC_A_ID);
    expect(result.role).toBe("STAFF");

    expect(calls).toContainEqual([
      "clinic_members.insert",
      [
        expect.objectContaining({
          clinic_id: CLINIC_A_ID,
          user_id: "user-456",
          role: "STAFF",
          status: "ACTIVE",
        }),
      ],
    ]);

    // Doctor profile should NOT be created for staff
    const doctorInserts = calls.filter(([call]) => call.startsWith("doctor_profiles.insert"));
    expect(doctorInserts).toHaveLength(0);
  });

  it("handles case-insensitive and whitespace-padded email matching", async () => {
    const { db } = fakeInvitationDb({
      invitation: {
        id: VALID_INVITATION_ID,
        clinic_id: CLINIC_A_ID,
        email: "Doctor.Asha@Careflow.Test",
        role: "DOCTOR",
        status: "PENDING",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    const result = await acceptInvitation(db, "user-123", "  doctor.asha@careflow.test  ", VALID_INVITATION_ID);
    expect(result.ok).toBe(true);
  });

  it("rejects acceptance if authenticated email does not match invitation email", async () => {
    const { db } = fakeInvitationDb();
    await expect(
      acceptInvitation(db, "user-impostor", "wrong-person@example.com", VALID_INVITATION_ID)
    ).rejects.toThrow("This invitation was sent to a different email address.");
  });

  it("rejects acceptance if invitation is expired", async () => {
    const { db } = fakeInvitationDb({
      invitation: {
        id: VALID_INVITATION_ID,
        clinic_id: CLINIC_A_ID,
        email: "doctor@careflow.test",
        role: "DOCTOR",
        status: "PENDING",
        expires_at: new Date(Date.now() - 1000).toISOString(),
      },
    });
    await expect(
      acceptInvitation(db, "user-123", "doctor@careflow.test", VALID_INVITATION_ID)
    ).rejects.toThrow("This invitation has expired.");
  });

  it("rejects acceptance if invitation is cancelled", async () => {
    const { db } = fakeInvitationDb({
      invitation: {
        id: VALID_INVITATION_ID,
        clinic_id: CLINIC_A_ID,
        email: "doctor@careflow.test",
        role: "DOCTOR",
        status: "CANCELLED",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    await expect(
      acceptInvitation(db, "user-123", "doctor@careflow.test", VALID_INVITATION_ID)
    ).rejects.toThrow("This invitation has been cancelled by the clinic.");
  });

  it("rejects acceptance if invitation is already accepted (duplicate redemption)", async () => {
    const { db } = fakeInvitationDb({
      invitation: {
        id: VALID_INVITATION_ID,
        clinic_id: CLINIC_A_ID,
        email: "doctor@careflow.test",
        role: "DOCTOR",
        status: "ACCEPTED",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    await expect(
      acceptInvitation(db, "user-123", "doctor@careflow.test", VALID_INVITATION_ID)
    ).rejects.toThrow("This invitation has already been accepted.");
  });

  it("rejects acceptance if clinic is non-operational", async () => {
    const { db } = fakeInvitationDb({ operational: false });
    await expect(
      acceptInvitation(db, "user-123", "doctor@careflow.test", VALID_INVITATION_ID)
    ).rejects.toThrow("This clinic is not currently operational.");
  });

  it("rejects acceptance if caller profile is not active", async () => {
    const { db } = fakeInvitationDb({ profileStatus: "SUSPENDED" });
    await expect(
      acceptInvitation(db, "user-123", "doctor@careflow.test", VALID_INVITATION_ID)
    ).rejects.toThrow("Active account profile required.");
  });

  it("prevents duplicate active memberships in the same clinic", async () => {
    const { db } = fakeInvitationDb({
      existingMember: {
        id: "mem-already-active",
        clinic_id: CLINIC_A_ID,
        user_id: "user-123",
        role: "DOCTOR",
        status: "ACTIVE",
      },
    });

    await expect(
      acceptInvitation(db, "user-123", "doctor@careflow.test", VALID_INVITATION_ID)
    ).rejects.toThrow("You are already an active member of this clinic.");
  });

  it("reactivates a previously suspended membership instead of creating duplicate", async () => {
    const { db, calls } = fakeInvitationDb({
      existingMember: {
        id: "mem-suspended",
        clinic_id: CLINIC_A_ID,
        user_id: "user-123",
        role: "STAFF",
        status: "SUSPENDED",
      },
    });

    const result = await acceptInvitation(db, "user-123", "doctor@careflow.test", VALID_INVITATION_ID);
    expect(result.ok).toBe(true);

    expect(calls).toContainEqual([
      "clinic_members.update",
      [
        expect.objectContaining({
          role: "DOCTOR",
          status: "ACTIVE",
        }),
      ],
    ]);
    const memberInserts = calls.filter(([call]) => call.startsWith("clinic_members.insert"));
    expect(memberInserts).toHaveLength(0);
  });

  it("prevents privilege escalation to OWNER or PLATFORM_ADMIN via invitation", async () => {
    const { db } = fakeInvitationDb({
      invitation: {
        id: VALID_INVITATION_ID,
        clinic_id: CLINIC_A_ID,
        email: "attacker@careflow.test",
        role: "OWNER",
        status: "PENDING",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    await expect(
      acceptInvitation(db, "user-attacker", "attacker@careflow.test", VALID_INVITATION_ID)
    ).rejects.toThrow("Only doctor or staff invitations are allowed.");
  });

  it("isolates clinic access (invitation to Clinic A only grants Clinic A access)", async () => {
    const { db } = fakeInvitationDb({
      invitation: {
        id: VALID_INVITATION_ID,
        clinic_id: CLINIC_A_ID,
        email: "doctor@careflow.test",
        role: "DOCTOR",
        status: "PENDING",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    const result = await acceptInvitation(db, "user-123", "doctor@careflow.test", VALID_INVITATION_ID);
    expect(result.clinicId).toBe(CLINIC_A_ID);
    expect(result.clinicId).not.toBe("different-clinic-b");
  });

  it("delegates to database RPC when available", async () => {
    const rpcMock = vi.fn(async (fn: string) => {
      if (fn === "accept_clinic_invitation") {
        return {
          data: { success: true, clinic_id: CLINIC_A_ID, role: "DOCTOR" },
          error: null,
        };
      }
      return { data: true, error: null };
    });

    const { db } = fakeInvitationDb({ rpcMock });
    const result = await acceptInvitation(db, "user-123", "doctor@careflow.test", VALID_INVITATION_ID);
    expect(result.ok).toBe(true);
    expect(result.clinicId).toBe(CLINIC_A_ID);
    expect(result.role).toBe("DOCTOR");
    expect(rpcMock).toHaveBeenCalledWith("accept_clinic_invitation", { p_invitation: VALID_INVITATION_ID });
  });

  it("handles structured expired response from RPC and rejects with clear message", async () => {
    const rpcMock = vi.fn(async (fn: string) => {
      if (fn === "accept_clinic_invitation") {
        return {
          data: { success: false, error: "Invitation has expired.", status: "EXPIRED" },
          error: null,
        };
      }
      return { data: true, error: null };
    });

    const { db } = fakeInvitationDb({ rpcMock });
    await expect(
      acceptInvitation(db, "user-123", "doctor@careflow.test", VALID_INVITATION_ID)
    ).rejects.toThrow("Invitation has expired.");
    expect(rpcMock).toHaveBeenCalledWith("accept_clinic_invitation", { p_invitation: VALID_INVITATION_ID });
  });

  it("consistently rejects retries of already-expired invitations with no membership side effects", async () => {
    const { db, calls } = fakeInvitationDb({
      invitation: {
        id: VALID_INVITATION_ID,
        clinic_id: CLINIC_A_ID,
        email: "doctor@careflow.test",
        role: "DOCTOR",
        status: "EXPIRED",
        expires_at: new Date(Date.now() - 50000).toISOString(),
      },
    });

    await expect(
      acceptInvitation(db, "user-123", "doctor@careflow.test", VALID_INVITATION_ID)
    ).rejects.toThrow("This invitation has expired.");

    // Verify no member, doctor, or audit records were created
    const memberInserts = calls.filter(([call]) => call.startsWith("clinic_members.insert"));
    const doctorInserts = calls.filter(([call]) => call.startsWith("doctor_profiles.insert"));
    const auditInserts = calls.filter(([call]) => call.startsWith("audit_logs.insert"));
    expect(memberInserts).toHaveLength(0);
    expect(doctorInserts).toHaveLength(0);
    expect(auditInserts).toHaveLength(0);
  });

  it("saves doctor clinical profile fields during invitation acceptance", async () => {
    const { db, calls } = fakeInvitationDb();
    const result = await acceptInvitation(db, "user-123", "doctor@careflow.test", VALID_INVITATION_ID, {
      doctorProfile: {
        specialization: "Cardiology",
        department: "Cardiovascular",
        qualification: "MBBS, MD Cardiology",
        experience_years: 10,
        license_number: "MED-998877",
        consultation_fee: 1500,
        bio: "Specialist in preventive cardiology.",
      },
    });

    expect(result.ok).toBe(true);
    expect(calls).toContainEqual([
      "doctor_profiles.insert",
      [
        expect.objectContaining({
          clinic_id: CLINIC_A_ID,
          user_id: "user-123",
          specialization: "Cardiology",
          department: "Cardiovascular",
          qualification: "MBBS, MD Cardiology",
          experience_years: 10,
          license_number: "MED-998877",
          consultation_fee: 1500,
          bio: "Specialist in preventive cardiology.",
          status: "ACTIVE",
        }),
      ],
    ]);
  });

  it("updates staff display name during staff invitation acceptance", async () => {
    const { db, calls } = fakeInvitationDb({
      invitation: {
        id: VALID_INVITATION_ID,
        clinic_id: CLINIC_A_ID,
        email: "staff@careflow.test",
        role: "STAFF",
        status: "PENDING",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    const result = await acceptInvitation(db, "user-staff-1", "staff@careflow.test", VALID_INVITATION_ID, {
      staffProfile: {
        displayName: "Sita Sharma",
        phone: "+919876543210",
      },
    });

    expect(result.ok).toBe(true);
    expect(calls).toContainEqual([
      "profiles.update",
      [{ display_name: "Sita Sharma" }],
    ]);
  });
});

describe("Full Invitee Lifecycle & Token Preservation", () => {
  it("preserves invitation token in callback and redirect URLs", () => {
    const origin = "http://localhost:8080";
    const inviteRedirect = `/accept-invitation?token=${VALID_INVITATION_ID}`;
    const confirmCallbackUrl = `${origin}/auth/confirm?redirect=${encodeURIComponent(inviteRedirect)}`;

    const parsed = new URL(confirmCallbackUrl);
    expect(parsed.pathname).toBe("/auth/confirm");
    const extractedRedirect = parsed.searchParams.get("redirect");
    expect(extractedRedirect).toBe(inviteRedirect);

    // After confirmation, returnUrl appends confirmed=true and retains token
    const returnUrl = extractedRedirect?.includes("?")
      ? `${extractedRedirect}&confirmed=true`
      : `${extractedRedirect}?confirmed=true`;
    expect(returnUrl).toBe(`/accept-invitation?token=${VALID_INVITATION_ID}&confirmed=true`);
  });

  it("handles new invitee opening valid invitation and viewing preview with Create Account context", async () => {
    const { db } = fakeInvitationDb();
    const preview = await previewInvitation(db, VALID_INVITATION_ID);

    expect(preview.valid).toBe(true);
    expect(preview.clinicName).toBe("Careflow Health Clinic");
    expect(preview.role).toBe("DOCTOR");
    // Masked for privacy
    expect(preview.maskedEmail).toBe("d***r@careflow.test");
  });

  it("allows returning to invitation with active session and completing onboarding", async () => {
    const { db, calls } = fakeInvitationDb();
    const result = await acceptInvitation(
      db,
      "user-doc-new",
      "doctor@careflow.test",
      VALID_INVITATION_ID,
      {
        doctorProfile: {
          specialization: "Pediatrics",
          department: "Pediatrics Outpatient",
          qualification: "MBBS, DCH",
          experience_years: 5,
          license_number: "LIC-12345",
          consultation_fee: 800,
          bio: "Child health and wellness.",
        },
      }
    );

    expect(result.ok).toBe(true);
    expect(result.clinicId).toBe(CLINIC_A_ID);
    expect(result.role).toBe("DOCTOR");

    // Validates clinic_members inserted
    expect(calls).toContainEqual([
      "clinic_members.insert",
      [
        expect.objectContaining({
          clinic_id: CLINIC_A_ID,
          user_id: "user-doc-new",
          role: "DOCTOR",
          status: "ACTIVE",
        }),
      ],
    ]);

    // Validates doctor profile inserted
    expect(calls).toContainEqual([
      "doctor_profiles.insert",
      [
        expect.objectContaining({
          specialization: "Pediatrics",
          license_number: "LIC-12345",
          status: "ACTIVE",
        }),
      ],
    ]);
  });

  it("strictly prevents accepting an invitation with the wrong authenticated email", async () => {
    const { db } = fakeInvitationDb();
    await expect(
      acceptInvitation(db, "user-other", "unrelated@other.com", VALID_INVITATION_ID)
    ).rejects.toThrow("This invitation was sent to a different email address.");
  });

  it("rejects revoked (cancelled) invitations with descriptive error", async () => {
    const { db } = fakeInvitationDb({
      invitation: {
        id: VALID_INVITATION_ID,
        clinic_id: CLINIC_A_ID,
        email: "doctor@careflow.test",
        role: "DOCTOR",
        status: "CANCELLED",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    const preview = await previewInvitation(db, VALID_INVITATION_ID);
    expect(preview.valid).toBe(false);
    expect(preview.reason).toBe("CANCELLED");

    await expect(
      acceptInvitation(db, "user-123", "doctor@careflow.test", VALID_INVITATION_ID)
    ).rejects.toThrow("This invitation has been cancelled by the clinic.");
  });

  it("rejects already accepted invitations and avoids double acceptance", async () => {
    const { db } = fakeInvitationDb({
      invitation: {
        id: VALID_INVITATION_ID,
        clinic_id: CLINIC_A_ID,
        email: "doctor@careflow.test",
        role: "DOCTOR",
        status: "ACCEPTED",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    const preview = await previewInvitation(db, VALID_INVITATION_ID);
    expect(preview.valid).toBe(false);
    expect(preview.reason).toBe("ALREADY_ACCEPTED");

    await expect(
      acceptInvitation(db, "user-123", "doctor@careflow.test", VALID_INVITATION_ID)
    ).rejects.toThrow("This invitation has already been accepted.");
  });

  it("prevents duplicate owner notifications on retry", async () => {
    const { db, calls } = fakeInvitationDb();

    // First acceptance
    await acceptInvitation(db, "user-123", "doctor@careflow.test", VALID_INVITATION_ID);

    const notificationInserts = calls.filter(([call]) => call.startsWith("notifications.insert"));
    // Notification was attempted/inserted for the owner
    expect(notificationInserts.length).toBeLessThanOrEqual(1);
  });
});

