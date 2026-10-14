import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analyticsSearchSchema } from "./admin-analytics-rules";

export const getAdminAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => analyticsSearchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSubscriptionAdmin } = await import("./admin-subscriptions.server");
    const { readAdminAnalytics } = await import("./admin-analytics.server");
    await assertSubscriptionAdmin(context.supabase, context.userId);
    return readAdminAnalytics(context.supabase, data.range);
  });
