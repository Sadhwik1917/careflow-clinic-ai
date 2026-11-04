import { createFileRoute } from "@tanstack/react-router";
import { ReceptionistDashboardView } from "@/components/careflow/receptionist-dashboard-view";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/staff/dashboard")({
  head: () => pageMetadata("Dashboard", "STAFF"),
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  const clinicId = membership?.clinic_id ?? "";

  return <ReceptionistDashboardView userId={user.id} clinicId={clinicId} />;
}

