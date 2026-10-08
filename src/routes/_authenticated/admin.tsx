import { createFileRoute } from "@tanstack/react-router";
import { AreaError, AreaLayout, AreaPending } from "@/components/careflow/area-layout";
import { guardArea } from "@/lib/access";

// Navigation guard only: the database's row-level security remains the authorization boundary.
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context, location }) => guardArea("PLATFORM_ADMIN", context, location.href),
  pendingComponent: AreaPending,
  errorComponent: AreaError,
  component: Layout,
});

function Layout() {
  const { access, membership } = Route.useRouteContext();
  return <AreaLayout role="PLATFORM_ADMIN" access={access} membership={membership} />;
}
