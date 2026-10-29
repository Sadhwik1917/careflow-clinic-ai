import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  selfRegistrationSchema,
  resendActivationSchema,
  type SelfRegistrationInput,
  type PublicClinicInfo,
  type RegistrationResult,
} from "./patient-registration";

type Client = SupabaseClient<Database>;

// In-memory sliding window rate limiter for public abuse protection
interface RateLimitBucket {
  count: number;
  resetAt: number;
}
const rateLimitStore = new Map<string, RateLimitBucket>();

// In-flight concurrency lock to serialize simultaneous submissions for the same email & clinic
const inFlightRegistrations = new Set<string>();

/**
 * Prunes expired rate limit entries to prevent memory leaks under attack.
 */
function pruneRateLimitStore(): void {
  const now = Date.now();
  for (const [key, bucket] of rateLimitStore.entries()) {
    if (now > bucket.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Checks sliding-window rate limit for a given key.
 * Throws a generic rate limit error when threshold is exceeded.
 */
export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): void {
  const now = Date.now();

  // Periodically prune when map exceeds 500 keys
  if (rateLimitStore.size > 500) {
    pruneRateLimitStore();
  }

  const bucket = rateLimitStore.get(key);

  if (!bucket || now > bucket.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (bucket.count >= maxAttempts) {
    throw new Error("Too many attempts. Please wait a few minutes before trying again.");
  }

  bucket.count++;
}

/**
 * Resets the in-memory rate limit store and in-flight locks (useful for test isolation).
 */
export function resetRateLimits(): void {
  rateLimitStore.clear();
  inFlightRegistrations.clear();
}

async function getAdminDb(): Promise<Client> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Client;
}

/**
 * Validates and returns public clinic information for the patient registration page.
 * Fails closed if the clinic does not exist, is suspended/revoked, or is non-operational.
 * Never exposes private clinic data, patient lists, or financial data.
 */
export async function getPublicClinicInfo(clinicId: string): Promise<PublicClinicInfo> {
  const { z } = await import("zod");
  if (!z.string().uuid().safeParse(clinicId).success) {
    throw new Error("Invalid clinic identifier.");
  }

  const db = await getAdminDb();

  // Validate clinic operational status directly via server-side admin client.
  // Note: public.clinic_is_operational requires an authenticated clinic member (private.is_clinic_member)
  // and was explicitly revoked from service_role/anon in migration 20261014164444.
  // For anonymous public patient self-registration, we evaluate the exact operational conditions:
  // active clinic status, approved verification, active subscription/trial, and absence of suspensions.
  const [clinicRes, verifRes, subRes, eventsRes] = await Promise.all([
    db
      .from("clinics")
      .select("id, name, display_name, address, city, phone, status")
      .eq("id", clinicId)
      .maybeSingle(),
    db
      .from("clinic_verifications")
      .select("status")
      .eq("clinic_id", clinicId)
      .maybeSingle(),
    db
      .from("subscription_clinics")
      .select("subscription:clinic_subscriptions(status, trial_end_date)")
      .eq("clinic_id", clinicId),
    db
      .from("verification_events")
      .select("event_type, created_at")
      .eq("clinic_id", clinicId)
      .in("event_type", [
        "APPROVED",
        "CHANGES_REQUESTED",
        "REJECTED",
        "REVOKED_AFTER_APPROVAL",
        "REINSTATED",
        "SUSPENDED",
      ])
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (clinicRes.error || !clinicRes.data) {
    throw new Error("Clinic not found.");
  }

  const clinic = clinicRes.data;

  // 1. Basic clinic status check (must be ACTIVE)
  if (clinic.status !== "ACTIVE") {
    throw new Error("This clinic is currently inactive or unavailable for online registration.");
  }

  // 2. Verification status check (APPROVED or responded reverification)
  const verifStatus = verifRes.data?.status;
  let isVerified = verifStatus === "APPROVED";
  if (!isVerified && verifStatus === "PENDING_REVIEW") {
    const { data: rev } = await db
      .from("clinic_reverifications")
      .select("status")
      .eq("clinic_id", clinicId)
      .eq("status", "RESPONDED")
      .maybeSingle();
    if (rev) {
      isVerified = true;
    }
  }

  if (!isVerified) {
    throw new Error("This clinic is currently inactive or unavailable for online registration.");
  }

  // 3. Subscription & trial check (must have an active plan or running trial)
  const now = Date.now();
  const hasActivePlan = (subRes.data || []).some((item: any) => {
    const sub = Array.isArray(item.subscription) ? item.subscription[0] : item.subscription;
    if (!sub) return false;
    if (sub.status === "ACTIVE") return true;
    if (sub.status === "TRIAL_ACTIVE" && sub.trial_end_date && new Date(sub.trial_end_date).getTime() > now) {
      return true;
    }
    return false;
  });

  if (!hasActivePlan) {
    throw new Error("This clinic is currently inactive or unavailable for online registration.");
  }

  // 4. Restriction / Suspension check (latest event must not be SUSPENDED or REVOKED_AFTER_APPROVAL)
  const latestEvent = eventsRes.data?.[0]?.event_type;
  if (latestEvent === "SUSPENDED" || latestEvent === "REVOKED_AFTER_APPROVAL") {
    throw new Error("This clinic is currently inactive or unavailable for online registration.");
  }

  return {
    clinicId: clinic.id,
    name: clinic.name,
    displayName: clinic.display_name || clinic.name,
    address: clinic.address,
    city: clinic.city,
    phone: clinic.phone,
  };
}

/**
 * Generates a unique patient number within a clinic with collision backoff.
 */
async function generateUniquePatientNumber(db: Client, clinicId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `P-${Math.floor(100000 + Math.random() * 900000)}`;
    const { data } = await db
      .from("patients")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("patient_number", candidate)
      .maybeSingle();

    if (!data) {
      return candidate;
    }
  }
  // Fallback with timestamp component if random collisions occur
  return `P-${Date.now().toString().slice(-6)}`;
}

/**
 * Public patient self-registration handler.
 * Creates an unlinked patient record and prepares the login account via Supabase Auth email activation.
 * Never rolls back/deletes created records on invite delivery failure, preserving audit trail integrity.
 */
export async function registerPatientSelf(
  origin: string,
  rawInput: unknown,
  clientIp?: string
): Promise<RegistrationResult> {
  const input: SelfRegistrationInput = selfRegistrationSchema.parse(rawInput);
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanOrigin = origin.replace(/\/+$/, "");

  // 1. Abuse protection: IP rate limiting + Clinic/Email rate limiting
  if (clientIp && clientIp !== "unknown") {
    checkRateLimit(`ip:reg:${clientIp}`, 20, 15 * 60 * 1000);
  }
  checkRateLimit(`reg:${input.clinicId}:${cleanEmail}`, 5, 15 * 60 * 1000);

  // 2. Concurrency lock to serialize concurrent submissions with identical email & clinic
  const flightKey = `${input.clinicId}:${cleanEmail}`;
  if (inFlightRegistrations.has(flightKey)) {
    throw new Error("A registration for this email is currently in progress. Please wait a moment.");
  }
  inFlightRegistrations.add(flightKey);

  try {
    // 3. Validate clinic is active and operational
    await getPublicClinicInfo(input.clinicId);

    const db = await getAdminDb();

    // 4. Prevent duplicate registration in this clinic
    const { data: existingPatient } = await db
      .from("patients")
      .select("id, user_id, patient_number, status")
      .eq("clinic_id", input.clinicId)
      .ilike("email", cleanEmail)
      .maybeSingle();

    if (existingPatient) {
      if (existingPatient.user_id) {
        return {
          status: "EXISTS_LINKED",
          email: cleanEmail,
          message:
            "A patient record with this email address is already registered at this clinic. Please sign in to your CAREFLOW account to access your records.",
        };
      } else {
        return {
          status: "EXISTS_PENDING",
          email: cleanEmail,
          message:
            "A registration with this email address is already pending activation for this clinic. Please check your inbox for the activation link, or request a new link below.",
        };
      }
    }

    // 5. Generate unique patient number
    const patientNumber = await generateUniquePatientNumber(db, input.clinicId);

    // 6. Insert patient record with user_id = null (unlinked until email ownership verified!)
    const { data: newPatient, error: insertError } = await db
      .from("patients")
      .insert({
        clinic_id: input.clinicId,
        user_id: null,
        patient_number: patientNumber,
        first_name: input.first_name,
        last_name: input.last_name || null,
        email: cleanEmail,
        phone: input.phone || null,
        date_of_birth: input.date_of_birth || null,
        gender: input.gender || null,
        address: input.address || null,
        emergency_contact_name: input.emergency_contact_name || null,
        emergency_contact_phone: input.emergency_contact_phone || null,
        notes: input.notes || null,
        status: "ACTIVE",
      })
      .select("id, patient_number")
      .single();

    if (insertError || !newPatient) {
      if (insertError?.code === "23505") {
        throw new Error("A registration collision occurred. Please submit again.");
      }
      throw new Error("Unable to create patient registration. Please try again.");
    }

    // 7. Secure Account Activation via Supabase Auth
    // User metadata stores registration_patient_id and registration_clinic_id for trusted linking
    // Never uses a default shared password like Patient@1234.
    try {
      const displayName = `${input.first_name} ${input.last_name || ""}`.trim();
      const { error: inviteError } = await (db as any).auth.admin.inviteUserByEmail(cleanEmail, {
        redirectTo: `${cleanOrigin}/reset-password`,
        data: {
          display_name: displayName,
          registration_patient_id: newPatient.id,
          registration_clinic_id: input.clinicId,
        },
      });

      if (inviteError) {
        const errMessage = (inviteError.message || "").toLowerCase();
        // If the auth user already exists in Supabase Auth
        if (
          errMessage.includes("already registered") ||
          errMessage.includes("already has an account") ||
          errMessage.includes("user already exists") ||
          inviteError.status === 422
        ) {
          return {
            status: "CREATED_EXISTING_USER",
            patientNumber: newPatient.patient_number,
            email: cleanEmail,
            message:
              "Your patient registration has been created! Since you already have an existing CAREFLOW account, sign in with your email and password to access your new clinic records.",
          };
        }

        // Email delivery failure: DO NOT delete the patient record!
        // Preserve audit integrity and allow the user to resend activation link.
        return {
          status: "CREATED_INVITE_PENDING",
          patientNumber: newPatient.patient_number,
          email: cleanEmail,
          message:
            "Your patient registration has been created! However, our email activation service is currently delayed. Please use 'Resend activation link' below in a few moments to activate your account.",
        };
      }

      return {
        status: "CREATED_INVITED",
        patientNumber: newPatient.patient_number,
        email: cleanEmail,
        message:
          "Registration successful! We have sent an activation link to your email. Please check your inbox and follow the instructions to set your password and access your care portal.",
      };
    } catch {
      // Do not delete patient record on unexpected auth exception
      return {
        status: "CREATED_INVITE_PENDING",
        patientNumber: newPatient.patient_number,
        email: cleanEmail,
        message:
          "Your patient registration has been created! However, our email activation service is currently delayed. Please use 'Resend activation link' below in a few moments to activate your account.",
      };
    }
  } finally {
    inFlightRegistrations.delete(flightKey);
  }
}

/**
 * Safely resends an activation link to an unactivated patient registration.
 * Rate limited by IP and email to prevent abuse. Fails without leaking patient existence.
 */
export async function resendPatientActivation(
  origin: string,
  rawInput: unknown,
  clientIp?: string
): Promise<{ ok: true; message: string }> {
  const input = resendActivationSchema.parse(rawInput);
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanOrigin = origin.replace(/\/+$/, "");

  // Rate limit: IP limit + short window (2/min) + long window (5/15min)
  if (clientIp && clientIp !== "unknown") {
    checkRateLimit(`ip:resend:${clientIp}`, 10, 15 * 60 * 1000);
  }
  checkRateLimit(`resend:short:${cleanEmail}`, 2, 60 * 1000);
  checkRateLimit(`resend:long:${cleanEmail}`, 5, 15 * 60 * 1000);

  const db = await getAdminDb();

  const { data: patient } = await db
    .from("patients")
    .select("id, user_id, first_name, last_name")
    .eq("clinic_id", input.clinicId)
    .ilike("email", cleanEmail)
    .maybeSingle();

  // If patient exists and is still unlinked, resend invite
  if (patient && !patient.user_id) {
    const displayName = `${patient.first_name} ${patient.last_name || ""}`.trim();
    try {
      await (db as any).auth.admin.inviteUserByEmail(cleanEmail, {
        redirectTo: `${cleanOrigin}/reset-password`,
        data: {
          display_name: displayName,
          registration_patient_id: patient.id,
          registration_clinic_id: input.clinicId,
        },
      });
    } catch {
      // Ignore auth send errors to maintain anti-enumeration response
    }
  }

  // Consistent message returned regardless of existence to prevent enumeration
  return {
    ok: true,
    message:
      "If an unactivated patient registration exists for this email, an activation link has been sent. Please check your inbox.",
  };
}

/**
 * Synchronizes clinic membership and audit log for a newly linked patient record.
 */
async function syncClinicMembershipAndAudit(
  db: Client,
  userId: string,
  clinicId: string,
  patientId: string,
  firstName: string,
  lastName: string | null
): Promise<void> {
  // 1. Ensure clinic_members row with role 'PATIENT' and status 'ACTIVE'
  const { data: existingMember } = await db
    .from("clinic_members")
    .select("id, role, status")
    .eq("clinic_id", clinicId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existingMember) {
    await db.from("clinic_members").insert({
      clinic_id: clinicId,
      user_id: userId,
      role: "PATIENT",
      status: "ACTIVE",
      joined_at: new Date().toISOString(),
    });
  } else if (existingMember.status !== "ACTIVE") {
    await db
      .from("clinic_members")
      .update({ status: "ACTIVE", updated_at: new Date().toISOString() })
      .eq("id", existingMember.id);
  }

  // 2. Set profiles.display_name if empty
  const fullName = `${firstName} ${lastName || ""}`.trim();
  if (fullName) {
    const { data: prof } = await db
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();

    if (!prof?.display_name) {
      await db
        .from("profiles")
        .update({ display_name: fullName, updated_at: new Date().toISOString() })
        .eq("id", userId);
    }
  }

  // 3. Audit log patient linking (never store demographic values)
  await db.from("audit_logs").insert({
    clinic_id: clinicId,
    user_id: userId,
    action: "PATIENT_LINKED",
    entity_type: "PATIENT",
    entity_id: patientId,
    metadata: {
      method: "SELF_REGISTRATION_VERIFIED",
    },
  });
}

/**
 * Links unlinked clinic patient records to the authenticated caller's account
 * ONLY after verified email ownership is established using trusted server-side Auth data.
 *
 * Security guarantees:
 * - Requires verified authenticated Supabase user (email_confirmed_at != null).
 * - Never trusts client-supplied email; loads user directly from auth.admin.
 * - Links specific patient registration identified in user metadata when available.
 * - Prevents linking multiple patient records in the same clinic to one user.
 * - Atomic compare-and-swap (WHERE id = $1 AND user_id IS NULL) prevents race conditions.
 * - Preserves clinic isolation and creates active PATIENT membership in clinic_members.
 */
export async function linkVerifiedPatientAccount(
  userId: string,
  _candidateEmail?: string | null
): Promise<{ linkedCount: number }> {
  if (!userId || !userId.trim()) {
    return { linkedCount: 0 };
  }

  const db = await getAdminDb();

  // 1. Verify email ownership using trusted server-side Auth data
  // NEVER trust email passed by the client or unverified claims
  let user: any = null;
  try {
    const { data: userData, error: userError } = await (db as any).auth.admin.getUserById(userId);
    if (userError || !userData?.user) {
      return { linkedCount: 0 };
    }
    user = userData.user;
  } catch {
    return { linkedCount: 0 };
  }

  // Require confirmed email
  const isConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at);
  if (!isConfirmed) {
    return { linkedCount: 0 };
  }

  const trustedEmail = (user.email || "").trim().toLowerCase();
  if (!trustedEmail) {
    return { linkedCount: 0 };
  }

  let linkedCount = 0;

  // 2. Priority match: check if user metadata has registration_patient_id
  const metaPatientId = user.user_metadata?.registration_patient_id as string | undefined;
  const metaClinicId = user.user_metadata?.registration_clinic_id as string | undefined;

  if (metaPatientId) {
    let query = db
      .from("patients")
      .select("id, clinic_id, first_name, last_name, email, user_id")
      .eq("id", metaPatientId)
      .is("user_id", null);

    if (metaClinicId) {
      query = query.eq("clinic_id", metaClinicId);
    }

    const { data: targetPatient } = await query.maybeSingle();

    if (targetPatient && targetPatient.email && targetPatient.email.trim().toLowerCase() === trustedEmail) {
      // Check if user already has a linked patient record in this clinic
      const { data: alreadyLinked } = await db
        .from("patients")
        .select("id")
        .eq("clinic_id", targetPatient.clinic_id)
        .eq("user_id", userId)
        .maybeSingle();

      if (!alreadyLinked) {
        // Atomic compare-and-swap
        const { data: claimed, error: updateError } = await db
          .from("patients")
          .update({ user_id: userId, updated_at: new Date().toISOString() })
          .eq("id", targetPatient.id)
          .is("user_id", null)
          .select("id, clinic_id, first_name, last_name")
          .maybeSingle();

        if (!updateError && claimed) {
          linkedCount++;
          await syncClinicMembershipAndAudit(
            db,
            userId,
            claimed.clinic_id,
            claimed.id,
            claimed.first_name,
            claimed.last_name
          );
        }
      }
    }
  }

  // 3. Fallback match for existing accounts or registrations without metadata
  if (linkedCount === 0) {
    const { data: unlinkedPatients } = await db
      .from("patients")
      .select("id, clinic_id, first_name, last_name, email")
      .ilike("email", trustedEmail)
      .is("user_id", null);

    if (unlinkedPatients && unlinkedPatients.length > 0) {
      for (const patient of unlinkedPatients) {
        // Prevent linking multiple patient records in the same clinic to one user!
        const { data: existingClinicPatient } = await db
          .from("patients")
          .select("id")
          .eq("clinic_id", patient.clinic_id)
          .eq("user_id", userId)
          .maybeSingle();

        if (existingClinicPatient) {
          // Already linked to a patient in this clinic; skip to avoid duplicate clinic patient links
          continue;
        }

        // Atomic claim: WHERE id = $1 AND user_id IS NULL
        const { data: claimed, error: updateError } = await db
          .from("patients")
          .update({ user_id: userId, updated_at: new Date().toISOString() })
          .eq("id", patient.id)
          .is("user_id", null)
          .select("id, clinic_id, first_name, last_name")
          .maybeSingle();

        if (updateError || !claimed) {
          // Concurrently claimed by another request or thread
          continue;
        }

        linkedCount++;
        await syncClinicMembershipAndAudit(
          db,
          userId,
          claimed.clinic_id,
          claimed.id,
          claimed.first_name,
          claimed.last_name
        );
      }
    }
  }

  return { linkedCount };
}
