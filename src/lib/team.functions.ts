import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { doctorFieldsSchema, doctorFiltersSchema, inviteSchema, staffFiltersSchema } from "./team";

const clinic = z.object({ clinicId: z.string().uuid() });
const doctor = clinic.extend({ doctorId: z.string().uuid() });

export const listClinicDoctors = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(i => clinic.extend({ filters: doctorFiltersSchema }).strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./team.server");
    await s.assertTeamOwner(context.supabase, context.userId, data.clinicId);
    return s.readDoctors(context.supabase, data.clinicId, data.filters);
  });

export const getClinicDoctor = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(i => doctor.strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./team.server");
    await s.assertTeamOwner(context.supabase, context.userId, data.clinicId);
    return s.readDoctor(context.supabase, data.clinicId, data.doctorId);
  });

export const updateClinicDoctor = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(i => doctor.extend({ updatedAt: z.string().datetime({ offset: true }), fields: z.unknown().refine(v => doctorFieldsSchema.safeParse(v).success, "Invalid doctor changes.") }).strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./team.server");
    await s.assertTeamOwner(context.supabase, context.userId, data.clinicId);
    return s.editDoctor(context.supabase, data.clinicId, data.doctorId, data.updatedAt, data.fields);
  });

export const listClinicStaff = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(i => clinic.extend({ filters: staffFiltersSchema }).strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./team.server");
    await s.assertTeamOwner(context.supabase, context.userId, data.clinicId);
    return s.readStaff(context.supabase, data.clinicId, data.filters);
  });

export const listClinicInvitations = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(i => clinic.strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./team.server");
    await s.assertTeamOwner(context.supabase, context.userId, data.clinicId);
    return s.readInvitations(context.supabase, data.clinicId);
  });

// Writes go through trusted database functions: role choice, duplicates, expiry and audit are enforced there.
export const inviteClinicMember = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(i => clinic.extend({ fields: z.unknown().refine(v => inviteSchema.safeParse(v).success, "Invalid invitation.") }).strict().parse(i))
  .handler(async ({ data, context }) => {
    const fields = inviteSchema.parse(data.fields);
    const { error } = await context.supabase.rpc("invite_clinic_member", { p_clinic: data.clinicId, p_email: fields.email, p_role: fields.role });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const cancelClinicInvitation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(i => clinic.extend({ invitationId: z.string().uuid() }).strict().parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("cancel_clinic_invitation", { p_invitation: data.invitationId });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setClinicMemberStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(i => clinic.extend({ memberId: z.string().uuid(), status: z.enum(["ACTIVE", "SUSPENDED", "REMOVED"]) }).strict().parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_clinic_member_status", { p_member: data.memberId, p_status: data.status });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
