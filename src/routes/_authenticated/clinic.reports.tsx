import { createFileRoute } from "@tanstack/react-router";
import { ClinicAnalyticsPage } from "@/components/careflow/clinic-analytics-page";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/clinic/reports")({
  head: () => pageMetadata("Analytics", "OWNER"),
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  const clinicId = membership?.clinic_id ?? "";

  return <ClinicAnalyticsPage userId={user.id} clinicId={clinicId} />;
}
