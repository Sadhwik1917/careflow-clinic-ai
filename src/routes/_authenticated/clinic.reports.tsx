import { createFileRoute } from "@tanstack/react-router";
import { AttendanceAnalyticsView } from "@/components/careflow/attendance-analytics-view";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/clinic/reports")({
  head: () => pageMetadata("Reports", "OWNER"),
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  const clinicId = membership?.clinic_id ?? "";

  return <AttendanceAnalyticsView userId={user.id} clinicId={clinicId} />;
}
