import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { acceptInvitationSchema, doctorFieldsSchema, doctorFiltersSchema, inviteSchema, staffFiltersSchema } from "./team";

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
    return s.editDoctor(context.supabase, data.clinicId, data.doctorId, data.updatedAt, data.fields, context.userId);
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

// Writes go through trusted server logic & database functions: role choice, duplicates, expiry and audit are enforced there.
export const inviteClinicMember = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(i => clinic.extend({ fields: z.unknown().refine(v => inviteSchema.safeParse(v).success, "Invalid invitation.") }).strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./team.server");
    const fields = inviteSchema.parse(data.fields);
    return s.inviteMember(context.supabase, data.clinicId, fields.email, fields.role, context.userId);
  });

export const cancelClinicInvitation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(i => clinic.extend({ invitationId: z.string().uuid() }).strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./team.server");
    return s.cancelInvitation(context.supabase, data.clinicId, data.invitationId, context.userId);
  });

export const setClinicMemberStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(i => clinic.extend({ memberId: z.string().uuid(), status: z.enum(["ACTIVE", "SUSPENDED", "REMOVED"]) }).strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./team.server");
    return s.setMemberStatus(context.supabase, data.clinicId, data.memberId, data.status, context.userId);
  });

export const getInvitationPreview = createServerFn({ method: "POST" })
  .inputValidator(i => z.object({ token: z.string() }).strict().parse(i))
  .handler(async ({ data }) => {
    const s = await import("./team.server");
    let callerEmail: string | undefined;
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const request = getRequest();
      const authHeader = request?.headers?.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "");
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: claimsData } = await supabase.auth.getClaims(token);
        if (typeof claimsData?.claims?.email === "string") {
          callerEmail = claimsData.claims.email;
        }
      }
    } catch {
      // unauthenticated / incognito caller
    }

    let client: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>;
    if (process.env["SUPABASE_SERVICE_ROLE_KEY"] && process.env["SUPABASE_URL"]) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        client = supabaseAdmin as unknown as typeof client;
      } catch {
        const { supabase } = await import("@/integrations/supabase/client");
        client = supabase as unknown as typeof client;
      }
    } else {
      const { supabase } = await import("@/integrations/supabase/client");
      client = supabase as unknown as typeof client;
    }
    return s.previewInvitation(client, data.token, callerEmail);
  });

export const acceptClinicInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(i => acceptInvitationSchema.parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./team.server");
    const userEmail = typeof context.claims.email === "string" ? context.claims.email : "";
    return s.acceptInvitation(context.supabase, context.userId, userEmail, data.token, {
      doctorProfile: data.doctorProfile,
      staffProfile: data.staffProfile,
    });
  });

