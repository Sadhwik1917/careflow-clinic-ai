import { createFileRoute, redirect } from "@tanstack/react-router";
import { AreaError, AreaLayout, AreaPending } from "@/components/careflow/area-layout";
import { supabase } from "@/integrations/supabase/client";
import { guardArea } from "@/lib/access";
import { ownerGateRedirect } from "@/lib/verification";

// Navigation guard only: the database's row-level security remains the authorization boundary.
export const Route = createFileRoute("/_authenticated/clinic")({
  beforeLoad: async ({ context, location }) => {
    const ctx = await guardArea("OWNER", context, location.href);
    const clinicId = ctx.membership?.clinic_id;
    if (clinicId) {
      const [v, op] = await Promise.all([
        supabase.from("clinic_verifications").select("status").eq("clinic_id", clinicId).maybeSingle(),
        supabase.rpc("clinic_is_operational", { p_clinic: clinicId }),
      ]);
      // Any read failure counts as "not operational": never fail open.
      const target = ownerGateRedirect(location.pathname, v.data?.status ?? null, op.data === true);
      if (target) throw redirect({ to: target });
    }
    return ctx;
  },
  pendingComponent: AreaPending,
  errorComponent: AreaError,
  component: Layout,
});

function Layout() {
  const { access, membership } = Route.useRouteContext();
  return <AreaLayout role="OWNER" access={access} membership={membership} />;
}
