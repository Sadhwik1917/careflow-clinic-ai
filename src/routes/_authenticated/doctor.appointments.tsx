import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppointmentsList } from "@/components/careflow/appointments-list";
import { doctorSelfProfileQuery } from "@/lib/team-queries";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/doctor/appointments")({
  head: () => pageMetadata("Appointments", "DOCTOR"),
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  const clinicId = membership?.clinic_id ?? "";
  const { data: doctorProfile } = useQuery(doctorSelfProfileQuery(clinicId));

  return (
    <AppointmentsList
      userId={user.id}
      clinicId={clinicId}
      role="DOCTOR"
      initialDoctorId={doctorProfile?.id}
    />
  );
}
