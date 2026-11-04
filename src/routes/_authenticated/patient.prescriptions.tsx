import { createFileRoute } from "@tanstack/react-router";
import { PatientPrescriptionsView } from "@/components/careflow/patient-prescriptions-view";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/patient/prescriptions")({
  head: () => pageMetadata("Prescriptions", "PATIENT"),
  component: Page,
});

function Page() {
  const { membership } = Route.useRouteContext();
  return <PatientPrescriptionsView clinicId={membership?.clinic_id} />;
}
