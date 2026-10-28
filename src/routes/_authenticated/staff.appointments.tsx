import { createFileRoute } from "@tanstack/react-router";
import { AppointmentsList } from "@/components/careflow/appointments-list";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/staff/appointments")({
  head: () => pageMetadata("Appointments", "STAFF"),
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  return (
    <AppointmentsList
      userId={user.id}
      clinicId={membership?.clinic_id ?? ""}
      role="STAFF"
    />
  );
}
