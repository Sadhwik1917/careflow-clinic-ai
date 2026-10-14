import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { userFiltersSchema } from "./admin-user-rules";

export const getAdminUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => userFiltersSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSubscriptionAdmin } = await import("./admin-subscriptions.server");
    // Verify the caller through their own RLS client before any privileged email lookup.
    await assertSubscriptionAdmin(context.supabase, context.userId);
    const { readAdminUsers, serviceEmailDirectory } = await import("./admin-users.server");
    return readAdminUsers(context.supabase, await serviceEmailDirectory(), data);
  });
