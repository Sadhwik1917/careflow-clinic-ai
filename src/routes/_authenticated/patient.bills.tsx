import { createFileRoute } from "@tanstack/react-router";
import { PatientBillsView } from "@/components/careflow/patient-bills-view";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/patient/bills")({
  head: () => pageMetadata("Bills", "PATIENT"),
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  return <PatientBillsView userId={user.id} clinicId={membership?.clinic_id} />;
}
