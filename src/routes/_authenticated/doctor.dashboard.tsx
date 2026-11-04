import { createFileRoute } from "@tanstack/react-router";
import { DoctorDashboardView } from "@/components/careflow/doctor-dashboard-view";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/doctor/dashboard")({
  head: () => pageMetadata("Dashboard", "DOCTOR"),
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  const clinicId = membership?.clinic_id ?? "";

  return <DoctorDashboardView userId={user.id} clinicId={clinicId} />;
}

