import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const clinicInput = z.object({ clinicId: z.string().uuid() }).strict();

export const getClinicGmailStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(i => clinicInput.parse(i))
  .handler(async ({ data, context }) => {
    const { assertTeamOwner } = await import("./team.server");
    await assertTeamOwner(context.supabase, context.userId, data.clinicId);
    const { getClinicGmailStatus } = await import("./gmail.server");
    return getClinicGmailStatus(data.clinicId);
  });

export const initiateGmailConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(i => clinicInput.parse(i))
  .handler(async ({ data, context }) => {
    const { assertTeamOwner } = await import("./team.server");
    await assertTeamOwner(context.supabase, context.userId, data.clinicId);
    const { generateGoogleOAuthUrl } = await import("./gmail.server");
    const nonce = Math.random().toString(36).substring(2);
    const url = generateGoogleOAuthUrl(data.clinicId, nonce);
    return { url };
  });

export const disconnectClinicGmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(i => clinicInput.parse(i))
  .handler(async ({ data, context }) => {
    const { assertTeamOwner } = await import("./team.server");
    await assertTeamOwner(context.supabase, context.userId, data.clinicId);
    const { disconnectClinicGmail } = await import("./gmail.server");
    return disconnectClinicGmail(data.clinicId);
  });
