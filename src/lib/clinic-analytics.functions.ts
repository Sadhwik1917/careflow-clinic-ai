import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { CLINIC_ANALYTICS_RANGES } from "./clinic-analytics-rules";

const clinicAnalyticsInputSchema = z.object({
  clinicId: z.string().uuid(),
  range: z.enum(CLINIC_ANALYTICS_RANGES).catch("30d").default("30d"),
  doctorId: z.string().optional().default(""),
});

export const getClinicAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => clinicAnalyticsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertOperationalClinicOwner, readClinicAnalytics } = await import("./clinic-analytics.server");
    await assertOperationalClinicOwner(context.supabase, context.userId, data.clinicId);
    return readClinicAnalytics(context.supabase, context.userId, data.clinicId, data.range, data.doctorId);
  });
