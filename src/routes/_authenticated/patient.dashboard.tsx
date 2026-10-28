import { createFileRoute } from "@tanstack/react-router";
import { PatientDashboardView } from "@/components/careflow/patient-dashboard-view";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/patient/dashboard")({
  head: () => pageMetadata("Dashboard", "PATIENT"),
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();

  return <PatientDashboardView userId={user.id} clinicId={membership?.clinic_id} />;
}

