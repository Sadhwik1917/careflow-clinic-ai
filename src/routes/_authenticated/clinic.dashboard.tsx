import { createFileRoute } from "@tanstack/react-router";
import { ClinicOwnerDashboardView } from "@/components/careflow/clinic-owner-dashboard-view";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/clinic/dashboard")({
  head: () => pageMetadata("Dashboard", "OWNER"),
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  const clinicId = membership?.clinic_id ?? "";

  return <ClinicOwnerDashboardView userId={user.id} clinicId={clinicId} />;
}

