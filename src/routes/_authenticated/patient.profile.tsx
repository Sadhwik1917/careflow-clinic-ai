import { createFileRoute } from "@tanstack/react-router";
import { PatientSelfProfile } from "@/components/careflow/patient-self-profile";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/patient/profile")({
  head: () => pageMetadata("Profile", "PATIENT"),
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  return <PatientSelfProfile userId={user.id} clinicId={membership?.clinic_id} />;
}
