import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { TEAM_PAGE_SIZE, doctorFieldsSchema, doctorSearchExpression, teamSearchTerm, maskEmail, type DoctorFilters, type StaffFilters } from "./team";

type Client = SupabaseClient<Database>;
type DynamicRpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
};
const denied = () => new Error("Team management is unavailable for this clinic.");

export function isFunctionMissingError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "").toLowerCase();
  return (
    code === "42883" ||
    code === "PGRST202" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find the function")
  );
}

/** Every request verifies an active OWNER membership and an operational clinic before any data access. */
export async function assertTeamOwner(db: Client, userId: string, clinicId: string) {
  const [p, m, op] = await Promise.all([
    db.from("profiles").select("platform_role,status").eq("id", userId).maybeSingle(),
    db.from("clinic_members").select("role,status").eq("user_id", userId).eq("clinic_id", clinicId).maybeSingle(),
    db.rpc("clinic_is_operational", { p_clinic: clinicId }),
  ]);
  if (p.error || m.error || op.error || p.data?.status !== "ACTIVE" || p.data.platform_role !== "USER" || m.data?.role !== "OWNER" || m.data.status !== "ACTIVE" || op.data !== true) throw denied();
}

/** Display names come only from the owner-gated trusted lookup; everything else stays on the caller's RLS client. */
async function readNameMap(db: Client, clinicId: string) {
  const { data, error } = await db.rpc("clinic_member_names", { p_clinic: clinicId });
  if (error) throw denied();
  return new Map((data ?? []).map(row => [row.user_id, row.display_name]));
}
const matchingIds = (names: Map<string, string | null>, term: string) =>
  [...names].filter(([, n]) => n?.toLowerCase().includes(term.toLowerCase())).map(([id]) => id);

export async function readDoctors(db: Client, clinicId: string, filters: DoctorFilters) {
  const names = await readNameMap(db, clinicId);
  let q = db.from("doctor_profiles").select("*", { count: "exact" }).eq("clinic_id", clinicId);
  if (filters.status !== "ALL") q = q.eq("status", filters.status);
  const term = teamSearchTerm(filters.search);
  if (term) {
    const ids = matchingIds(names, term);
    q = q.or(`${doctorSearchExpression(term)}${ids.length ? `,user_id.in.(${ids.join(",")})` : ""}`);
  }
  const { data, count, error } = await q.order("created_at", { ascending: false }).order("id").range(filters.page * TEAM_PAGE_SIZE, (filters.page + 1) * TEAM_PAGE_SIZE - 1);
  if (error) throw new Error("Doctors couldn't load. Please try again.");
  return { rows: (data ?? []).map(d => ({ ...d, display_name: names.get(d.user_id) ?? null })), count: count ?? 0 };
}

export async function readDoctor(db: Client, clinicId: string, doctorId: string) {
  const { data, error } = await db.from("doctor_profiles").select("*").eq("clinic_id", clinicId).eq("id", doctorId).maybeSingle();
  if (error) throw new Error("Doctor couldn't load. Please try again.");
  if (!data) return null;
  const names = await readNameMap(db, clinicId);
  return { ...data, display_name: names.get(data.user_id) ?? null };
}

type DoctorUpdate = Database["public"]["Tables"]["doctor_profiles"]["Update"];

export async function editDoctor(db: Client, clinicId: string, doctorId: string, updatedAt: string, input: unknown, callerUserId?: string) {
  const parsed = doctorFieldsSchema.parse(input);
  const fields: DoctorUpdate = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined));
  const { data, error } = await db.from("doctor_profiles").update(fields).eq("clinic_id", clinicId).eq("id", doctorId).eq("updated_at", updatedAt).select("*").maybeSingle();
  if (error) throw new Error("Doctor changes weren't saved. Please try again.");
  if (!data) throw new Error("This doctor profile changed or is no longer available. Reload the profile before editing.");
  if (callerUserId) {
    await db.from("audit_logs").insert({
      clinic_id: clinicId,
      user_id: callerUserId,
      action: "DOCTOR_PROFILE_UPDATED",
      entity_type: "DOCTOR_PROFILE",
      entity_id: doctorId,
      metadata: { changed_fields: Object.keys(fields) },
    });
  }
  return data;
}

export async function readStaff(db: Client, clinicId: string, filters: StaffFilters) {
  const names = await readNameMap(db, clinicId);
  const term = teamSearchTerm(filters.search);
  const ids = term ? matchingIds(names, term) : [];
  if (term && !ids.length) return { rows: [], count: 0 };
  let q = db.from("clinic_members").select("*", { count: "exact" }).eq("clinic_id", clinicId).eq("role", "STAFF");
  if (filters.status !== "ALL") q = q.eq("status", filters.status);
  if (term) q = q.in("user_id", ids);
  const { data, count, error } = await q.order("created_at", { ascending: false }).order("id").range(filters.page * TEAM_PAGE_SIZE, (filters.page + 1) * TEAM_PAGE_SIZE - 1);
  if (error) throw new Error("Staff couldn't load. Please try again.");
  return { rows: (data ?? []).map(m => ({ ...m, display_name: names.get(m.user_id) ?? null })), count: count ?? 0 };
}

export async function readInvitations(db: Client, clinicId: string) {
  const { data, error } = await db.from("clinic_invitations").select("*").eq("clinic_id", clinicId).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error("Invitations couldn't load. Please try again.");
  return data ?? [];
}

export async function previewInvitation(
  db: Client,
  token: string,
  callerEmail?: string
): Promise<import("./team").InvitationPreview> {
  const { z } = await import("zod");
  if (!z.string().uuid().safeParse(token).success) {
    return { valid: false, reason: "NOT_FOUND" };
  }

  // 1. Try public database RPC if available
  const rpcRes = await (db as unknown as DynamicRpcClient).rpc("preview_clinic_invitation", { p_invitation: token });
  if (!rpcRes.error && rpcRes.data) {
    const raw = Array.isArray(rpcRes.data) ? rpcRes.data[0] : rpcRes.data;
    if (raw && typeof raw === "object") {
      const d = raw as Record<string, unknown>;
      const status = String(d["status"] ?? "");
      const valid = status === "VALID";
      const reasonMap: Record<string, import("./team").InvitationPreview["reason"]> = {
        NOT_FOUND: "NOT_FOUND",
        EXPIRED: "EXPIRED",
        CANCELLED: "CANCELLED",
        ACCEPTED: "ALREADY_ACCEPTED",
        NON_OPERATIONAL: "CLINIC_NOT_OPERATIONAL",
      };
      const rawEmail = typeof d["email"] === "string" ? d["email"] : undefined;
      const maskedEmail = typeof d["masked_email"] === "string" ? d["masked_email"] : (rawEmail ? maskEmail(rawEmail) : undefined);
      return {
        valid,
        reason: valid ? undefined : (reasonMap[status] ?? "NOT_FOUND"),
        clinicId: typeof d["clinic_id"] === "string" ? d["clinic_id"] : undefined,
        clinicName: typeof d["clinic_name"] === "string" ? d["clinic_name"] : undefined,
        role: (d["role"] as "DOCTOR" | "STAFF") ?? undefined,
        email: rawEmail,
        maskedEmail,
        expiresAt: typeof d["expires_at"] === "string" ? d["expires_at"] : undefined,
      };
    }
  }

  // 2. Pure database query fallback
  const { data: inv } = await db.from("clinic_invitations").select("*").eq("id", token).maybeSingle();
  if (!inv) return { valid: false, reason: "NOT_FOUND" };

  const { data: clinic } = await db.from("clinics").select("name, display_name, status").eq("id", inv.clinic_id).maybeSingle();
  const clinicName = clinic?.display_name || clinic?.name || "Clinic";
  const maskedEmail = inv.email ? maskEmail(inv.email) : undefined;
  const isMatchingCaller = Boolean(callerEmail && inv.email && callerEmail.trim().toLowerCase() === inv.email.trim().toLowerCase());
  const returnedEmail = isMatchingCaller ? inv.email : undefined;

  if (inv.status === "CANCELLED") {
    return { valid: false, reason: "CANCELLED", clinicName, role: inv.role as "DOCTOR" | "STAFF", email: returnedEmail, maskedEmail };
  }
  if (inv.status === "ACCEPTED") {
    return { valid: false, reason: "ALREADY_ACCEPTED", clinicName, role: inv.role as "DOCTOR" | "STAFF", email: returnedEmail, maskedEmail };
  }
  if (inv.status === "EXPIRED" || new Date(inv.expires_at).getTime() <= Date.now()) {
    // Persistently mark expired invitation in database if found pending past expiry
    if (inv.status === "PENDING") {
      await db.from("clinic_invitations").update({ status: "EXPIRED" }).eq("id", token);
    }
    return { valid: false, reason: "EXPIRED", clinicName, role: inv.role as "DOCTOR" | "STAFF", email: returnedEmail, maskedEmail, expiresAt: inv.expires_at };
  }

  if (clinic?.status === "INACTIVE") {
    return { valid: false, reason: "CLINIC_NOT_OPERATIONAL", clinicName, role: inv.role as "DOCTOR" | "STAFF", email: returnedEmail, maskedEmail };
  }

  const { data: op } = await db.rpc("clinic_is_operational", { p_clinic: inv.clinic_id });
  if (op === false) {
    return { valid: false, reason: "CLINIC_NOT_OPERATIONAL", clinicName, role: inv.role as "DOCTOR" | "STAFF", email: returnedEmail, maskedEmail };
  }

  return {
    valid: true,
    clinicId: inv.clinic_id,
    clinicName,
    role: inv.role as "DOCTOR" | "STAFF",
    email: returnedEmail,
    maskedEmail,
    expiresAt: inv.expires_at,
  };
}

export async function acceptInvitation(
  db: Client,
  userId: string,
  userEmail: string,
  token: string,
  onboarding?: {
    doctorProfile?: import("./team").DoctorOnboardingInput | undefined;
    staffProfile?: import("./team").StaffOnboardingInput | undefined;
  }
): Promise<{ ok: true; clinicId: string; role: "DOCTOR" | "STAFF" }> {
  const { z } = await import("zod");
  if (!z.string().uuid().safeParse(token).success) {
    throw new Error("Invalid invitation token.");
  }

  // 1. Try atomic database RPC
  const rpcRes = await (db as unknown as DynamicRpcClient).rpc("accept_clinic_invitation", { p_invitation: token });
  if (!rpcRes.error && rpcRes.data && typeof rpcRes.data === "object") {
    const d = rpcRes.data as Record<string, unknown>;
    if (d["success"] === false) {
      throw new Error(String(d["error"] || "Failed to accept invitation."));
    }
    return {
      ok: true,
      clinicId: String(d["clinic_id"]),
      role: d["role"] as "DOCTOR" | "STAFF",
    };
  }

  // If RPC returned a specific business logic rejection, forward it
  if (rpcRes.error && !isFunctionMissingError(rpcRes.error)) {
    throw new Error(rpcRes.error.message);
  }

  // 2. Direct transactional check fallback
  const { data: profile } = await db.from("profiles").select("status").eq("id", userId).maybeSingle();
  if (profile?.status !== "ACTIVE") {
    throw new Error("Active account profile required.");
  }

  let privilegedDb = db;
  if (process.env["SUPABASE_SERVICE_ROLE_KEY"] && process.env["SUPABASE_URL"]) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      privilegedDb = supabaseAdmin as unknown as Client;
    } catch {
      // Keep caller db client in testing/isolated environments
    }
  }

  const { data: inv, error: invError } = await privilegedDb.from("clinic_invitations").select("*").eq("id", token).maybeSingle();
  if (invError || !inv) {
    throw new Error("Invitation not found.");
  }

  if (inv.status === "ACCEPTED") {
    throw new Error("This invitation has already been accepted.");
  }
  if (inv.status === "CANCELLED") {
    throw new Error("This invitation has been cancelled by the clinic.");
  }
  if (inv.status !== "PENDING" || new Date(inv.expires_at).getTime() <= Date.now()) {
    if (inv.status === "PENDING") {
      await privilegedDb.from("clinic_invitations").update({ status: "EXPIRED" }).eq("id", token);
    }
    throw new Error("This invitation has expired.");
  }

  const { data: clinic } = await privilegedDb.from("clinics").select("status").eq("id", inv.clinic_id).maybeSingle();
  if (clinic?.status === "INACTIVE") {
    throw new Error("This clinic is not currently operational.");
  }

  if (privilegedDb === db) {
    const { data: op } = await db.rpc("clinic_is_operational", { p_clinic: inv.clinic_id });
    if (op === false) {
      throw new Error("This clinic is not currently operational.");
    }
  }

  if (!userEmail || userEmail.trim().toLowerCase() !== inv.email.trim().toLowerCase()) {
    throw new Error("This invitation was sent to a different email address.");
  }

  if (inv.role !== "DOCTOR" && inv.role !== "STAFF") {
    throw new Error("Only doctor or staff invitations are allowed.");
  }

  // Check if member already exists in clinic
  const { data: existing } = await privilegedDb.from("clinic_members").select("*").eq("clinic_id", inv.clinic_id).eq("user_id", userId).maybeSingle();

  if (existing) {
    if (existing.status === "ACTIVE") {
      throw new Error("You are already an active member of this clinic.");
    }
    await privilegedDb.from("clinic_members").update({ role: inv.role, status: "ACTIVE", updated_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    await privilegedDb.from("clinic_members").insert({
      clinic_id: inv.clinic_id,
      user_id: userId,
      role: inv.role,
      status: "ACTIVE",
      joined_at: new Date().toISOString(),
    });
  }

  if (inv.role === "DOCTOR") {
    const docData = {
      clinic_id: inv.clinic_id,
      user_id: userId,
      specialization: onboarding?.doctorProfile?.specialization || "General Practice",
      department: onboarding?.doctorProfile?.department ?? null,
      qualification: onboarding?.doctorProfile?.qualification ?? null,
      experience_years: onboarding?.doctorProfile?.experience_years ?? 0,
      license_number: onboarding?.doctorProfile?.license_number ?? null,
      consultation_fee: onboarding?.doctorProfile?.consultation_fee ?? null,
      bio: onboarding?.doctorProfile?.bio ?? null,
      status: "ACTIVE" as const,
    };
    const { data: existingDoc } = await privilegedDb.from("doctor_profiles").select("id").eq("clinic_id", inv.clinic_id).eq("user_id", userId).maybeSingle();
    if (!existingDoc) {
      await privilegedDb.from("doctor_profiles").insert(docData);
    } else {
      await privilegedDb.from("doctor_profiles").update(docData).eq("id", existingDoc.id);
    }
  }

  if (inv.role === "STAFF" && onboarding?.staffProfile?.displayName) {
    await privilegedDb.from("profiles").update({ display_name: onboarding.staffProfile.displayName }).eq("id", userId);
  }

  await privilegedDb.from("clinic_invitations").update({ status: "ACCEPTED" }).eq("id", token);

  await privilegedDb.from("audit_logs").insert({
    clinic_id: inv.clinic_id,
    user_id: userId,
    action: "MEMBER_INVITATION_ACCEPTED",
    entity_type: "CLINIC_INVITATION",
    entity_id: token,
    metadata: { role: inv.role, email: inv.email },
  });

  // Notify clinic owner
  try {
    const { data: clinicRow } = await privilegedDb.from("clinics").select("owner_user_id, display_name, name").eq("id", inv.clinic_id).maybeSingle();
    if (clinicRow?.owner_user_id) {
      const { data: memberProfile } = await privilegedDb.from("profiles").select("display_name").eq("id", userId).maybeSingle();
      const memberName = memberProfile?.display_name || userEmail;
      const roleLabel = inv.role === "DOCTOR" ? "Doctor" : "Staff";
      const clinicName = clinicRow.display_name || clinicRow.name || "Clinic";

      const { data: existingNotice } = await privilegedDb
        .from("notifications")
        .select("id")
        .eq("recipient_user_id", clinicRow.owner_user_id)
        .eq("related_entity_id", token)
        .maybeSingle();

      if (!existingNotice) {
        await privilegedDb.from("notifications").insert({
          clinic_id: inv.clinic_id,
          recipient_user_id: clinicRow.owner_user_id,
          title: `New ${roleLabel} Joined`,
          message: `${memberName} has joined ${clinicName} as a ${roleLabel}.`,
          type: "MEMBER_JOINED",
          is_read: false,
          related_entity_id: token,
          related_entity_type: "CLINIC_INVITATION",
        });
      }
    }
  } catch {
    // Non-blocking notification creation
  }

  return { ok: true, clinicId: inv.clinic_id, role: inv.role as "DOCTOR" | "STAFF" };
}

export async function inviteMember(
  db: Client,
  clinicId: string,
  email: string,
  role: "DOCTOR" | "STAFF",
  callerUserId: string,
  options?: { skipEmailDelivery?: boolean | undefined } | undefined
): Promise<{ ok: true; invitationId?: string | undefined; senderEmail?: string | undefined }> {
  await assertTeamOwner(db, callerUserId, clinicId);
  const cleanEmail = email.toLowerCase().trim();

  // Validate Gmail connection beforehand when email delivery is not skipped
  let senderEmail: string | undefined;
  if (!options?.skipEmailDelivery) {
    const { getClinicGmailStatus } = await import("./gmail.server");
    const gmailStatus = await getClinicGmailStatus(clinicId);
    if (!gmailStatus.connected) {
      throw new Error(
        "Gmail not connected. Doctor and Staff invitations must be sent from your clinic's authorized Gmail address. Please connect your clinic's Gmail account before sending invitations."
      );
    }
    senderEmail = gmailStatus.senderEmail;
  }

  // 1. Try atomic database RPC
  const rpcRes = await (db as unknown as DynamicRpcClient).rpc("invite_clinic_member", {
    p_clinic: clinicId,
    p_email: cleanEmail,
    p_role: role,
  });
  let invitationId: string | undefined;
  if (!rpcRes.error && rpcRes.data) {
    invitationId = String(rpcRes.data);
  } else if (rpcRes.error && !isFunctionMissingError(rpcRes.error)) {
    throw new Error(rpcRes.error.message);
  }

  // 2. Direct fallback
  if (!invitationId) {
    const { data: existingPending } = await db
      .from("clinic_invitations")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("email", cleanEmail)
      .eq("status", "PENDING")
      .maybeSingle();

    if (existingPending) {
      throw new Error("A pending invitation already exists for this email.");
    }

    const { data: newInv, error: insertError } = await db
      .from("clinic_invitations")
      .insert({
        clinic_id: clinicId,
        email: cleanEmail,
        role,
        invited_by: callerUserId,
        status: "PENDING",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !newInv) {
      throw new Error("Failed to create invitation.");
    }

    invitationId = newInv.id;

    await db.from("audit_logs").insert({
      clinic_id: clinicId,
      user_id: callerUserId,
      action: "MEMBER_INVITED",
      entity_type: "CLINIC_INVITATION",
      entity_id: newInv.id,
      metadata: { role },
    });
  }

  // 3. Deliver email via clinic's authorized Gmail account
  if (!options?.skipEmailDelivery && invitationId) {
    const { sendClinicInvitationEmail } = await import("./gmail.server");
    const { data: clinic } = await db.from("clinics").select("name, display_name").eq("id", clinicId).maybeSingle();
    const clinicName = clinic?.display_name || clinic?.name || "Clinic";

    try {
      await sendClinicInvitationEmail({
        clinicId,
        clinicName,
        recipientEmail: cleanEmail,
        role,
        token: invitationId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    } catch (deliveryErr) {
      // Rollback newly created invitation so UI never claims success when email send fails
      await db.from("clinic_invitations").delete().eq("id", invitationId);
      throw deliveryErr;
    }
  }

  return { ok: true, invitationId, senderEmail };
}

export async function cancelInvitation(
  db: Client,
  clinicId: string,
  invitationId: string,
  callerUserId: string
): Promise<{ ok: true }> {
  await assertTeamOwner(db, callerUserId, clinicId);

  // 1. Try atomic database RPC
  const rpcRes = await (db as unknown as DynamicRpcClient).rpc("cancel_clinic_invitation", {
    p_invitation: invitationId,
  });
  if (!rpcRes.error) {
    return { ok: true };
  }
  if (rpcRes.error && !isFunctionMissingError(rpcRes.error)) {
    throw new Error(rpcRes.error.message);
  }

  // 2. Direct fallback
  const { data: inv, error: readError } = await db
    .from("clinic_invitations")
    .select("*")
    .eq("id", invitationId)
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (readError || !inv) {
    throw new Error("Invitation not found.");
  }
  if (inv.status !== "PENDING") {
    throw new Error("Only pending invitations can be cancelled.");
  }

  const { error: updateError } = await db
    .from("clinic_invitations")
    .update({ status: "CANCELLED" })
    .eq("id", invitationId)
    .eq("status", "PENDING");

  if (updateError) {
    throw new Error("Failed to cancel invitation.");
  }

  await db.from("audit_logs").insert({
    clinic_id: clinicId,
    user_id: callerUserId,
    action: "MEMBER_INVITATION_CANCELLED",
    entity_type: "CLINIC_INVITATION",
    entity_id: invitationId,
    metadata: { role: inv.role },
  });

  return { ok: true };
}

export async function setMemberStatus(
  db: Client,
  clinicId: string,
  memberId: string,
  status: "ACTIVE" | "SUSPENDED" | "REMOVED",
  callerUserId: string
): Promise<{ ok: true }> {
  await assertTeamOwner(db, callerUserId, clinicId);

  // 1. Try atomic database RPC
  const rpcRes = await (db as unknown as DynamicRpcClient).rpc("set_clinic_member_status", {
    p_member: memberId,
    p_status: status,
  });
  if (!rpcRes.error) {
    return { ok: true };
  }
  if (rpcRes.error && !isFunctionMissingError(rpcRes.error)) {
    throw new Error(rpcRes.error.message);
  }

  // 2. Direct fallback
  const { data: member, error: readError } = await db
    .from("clinic_members")
    .select("*")
    .eq("id", memberId)
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (readError || !member) {
    throw new Error("Member not found.");
  }
  if (member.role !== "DOCTOR" && member.role !== "STAFF") {
    throw new Error("This membership cannot be changed here.");
  }
  if (member.user_id === callerUserId) {
    throw new Error("You cannot change your own membership.");
  }

  const { error: updateError } = await db
    .from("clinic_members")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", memberId);

  if (updateError) {
    throw new Error("Failed to update member status.");
  }

  await db.from("audit_logs").insert({
    clinic_id: clinicId,
    user_id: callerUserId,
    action: "MEMBER_STATUS_CHANGED",
    entity_type: "CLINIC_MEMBER",
    entity_id: memberId,
    metadata: { from: member.status, to: status },
  });

  return { ok: true };
}

