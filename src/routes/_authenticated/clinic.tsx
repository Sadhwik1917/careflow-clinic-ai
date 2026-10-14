import { createFileRoute, redirect, useRouterState } from "@tanstack/react-router";
import { AreaError, AreaLayout, AreaPending } from "@/components/careflow/area-layout";
import { supabase } from "@/integrations/supabase/client";
import { availableWorkspaces, guardArea } from "@/lib/access";
import { ownerGateRedirect } from "@/lib/verification";
import { useQuery } from "@tanstack/react-query";
import { NavHiddenPaths, NavTitleOverrides } from "@/components/careflow/application-shell";
import { RestrictionGate } from "@/components/careflow/restriction-overlay";
import { clinicAiQuery, planStateQuery } from "@/lib/plan-state";
import { clinicRestrictionQuery, restrictionBlocks } from "@/lib/clinic-restriction";

// Navigation guard only: the database's row-level security remains the authorization boundary.
export const Route = createFileRoute("/_authenticated/clinic")({
  beforeLoad: async ({ context, location }) => {
    const ctx = await guardArea("OWNER", context, location.href);
    const clinicId = ctx.membership?.clinic_id;
    if (clinicId) {
      // Always the latest state for the selected clinic only; a read failure throws (never fails open).
      const restriction = await context.queryClient.fetchQuery({ ...clinicRestrictionQuery(clinicId), staleTime: 0 });
      // Suspended / revoked: the layout blocks every page with the notice instead of redirecting to Plans.
      if (restriction) return { ...ctx, restriction };
      const [v, op] = await Promise.all([
        supabase.from("clinic_verifications").select("status").eq("clinic_id", clinicId).maybeSingle(),
        supabase.rpc("clinic_is_operational", { p_clinic: clinicId }),
      ]);
      // Any read failure counts as "not operational": never fail open.
      const target = ownerGateRedirect(location.pathname, v.data?.status ?? null, op.data === true);
      if (target) throw redirect({ to: target as "/clinic/verification" | "/clinic/plans" });
    }
    return { ...ctx, restriction: null };
  },
  pendingComponent: AreaPending,
  errorComponent: AreaError,
  component: Layout,
});

function Layout() {
  const { access, membership, restriction: initial } = Route.useRouteContext();
  const pathname = useRouterState({ select: s => s.location.pathname });
  const clinicId = membership?.clinic_id ?? "";
  const live = useQuery({ ...clinicRestrictionQuery(clinicId), initialData: initial });
  const restriction = live.data ?? null;
  const plan = useQuery(planStateQuery(clinicId));
  const ai = useQuery(clinicAiQuery(clinicId));
  const overrides = plan.data?.current ? { "/clinic/plans": "Upgrade Plan" } : {};
  const hidden = ai.data === true ? [] : ["/clinic/ai"];
  const shell = <NavTitleOverrides.Provider value={overrides}><NavHiddenPaths.Provider value={hidden}><AreaLayout role="OWNER" access={access} membership={membership} /></NavHiddenPaths.Provider></NavTitleOverrides.Provider>;
  if (restriction && restrictionBlocks(pathname, restriction)) return <RestrictionGate restriction={restriction} canSwitch={availableWorkspaces(access).length > 1}>{shell}</RestrictionGate>;
  return shell;
}
