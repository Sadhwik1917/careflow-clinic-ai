import { createFileRoute } from "@tanstack/react-router";
import { DoctorQueueView } from "@/components/careflow/doctor-queue-view";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/doctor/queue")({
  head: () => pageMetadata("Queue", "DOCTOR"),
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  return (
    <DoctorQueueView
      userId={user.id}
      clinicId={membership?.clinic_id ?? ""}
    />
  );
}
