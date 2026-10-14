import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { historySchema, subscriptionFiltersSchema } from "./admin-subscription-rules";

export const getAdminSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => subscriptionFiltersSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSubscriptionAdmin, readAdminSubscriptions } = await import("./admin-subscriptions.server");
    await assertSubscriptionAdmin(context.supabase, context.userId);
    return readAdminSubscriptions(context.supabase, data);
  });

export const getAdminSubscriptionHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => historySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSubscriptionAdmin, readSubscriptionHistory } = await import("./admin-subscriptions.server");
    await assertSubscriptionAdmin(context.supabase, context.userId);
    return readSubscriptionHistory(context.supabase, data);
  });