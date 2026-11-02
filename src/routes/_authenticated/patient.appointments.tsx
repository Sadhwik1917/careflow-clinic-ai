import { createFileRoute } from "@tanstack/react-router";
import { PatientAppointmentsView } from "@/components/careflow/patient-appointments-view";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/patient/appointments")({
  head: () => pageMetadata("Appointments", "PATIENT"),
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  return <PatientAppointmentsView userId={user.id} clinicId={membership?.clinic_id} />;
}
