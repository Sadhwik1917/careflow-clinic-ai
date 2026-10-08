import { createFileRoute } from "@tanstack/react-router";
import { AreaError, AreaLayout, AreaPending } from "@/components/careflow/area-layout";
import { guardArea } from "@/lib/access";

// Navigation guard only: the database's row-level security remains the authorization boundary.
export const Route = createFileRoute("/_authenticated/patient")({
  beforeLoad: ({ context, location }) => guardArea("PATIENT", context, location.href),
  pendingComponent: AreaPending,
  errorComponent: AreaError,
  component: Layout,
});

function Layout() {
  const { access, membership } = Route.useRouteContext();
  return <AreaLayout role="PATIENT" access={access} membership={membership} />;
}
