import { createFileRoute } from "@tanstack/react-router";
import { PatientAppointmentsView } from "@/components/careflow/patient-appointments-view";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/patient/appointments")({
  head: () => pageMetadata("Appointments", "PATIENT"),
  component: Page,
});

function Page() {
  const { membership } = Route.useRouteContext();
  return <PatientAppointmentsView clinicId={membership?.clinic_id} />;
}
