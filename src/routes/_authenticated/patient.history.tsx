import { createFileRoute } from "@tanstack/react-router";
import { PatientMedicalHistoryView } from "@/components/careflow/patient-medical-history-view";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/patient/history")({
  head: () => pageMetadata("Medical history", "PATIENT"),
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  return <PatientMedicalHistoryView userId={user.id} clinicId={membership?.clinic_id} />;
}
