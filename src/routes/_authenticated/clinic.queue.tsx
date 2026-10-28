import { createFileRoute } from "@tanstack/react-router";
import { QueueManagement } from "@/components/careflow/queue-management";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/clinic/queue")({
  head: () => pageMetadata("Queue", "OWNER"),
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  return (
    <QueueManagement
      userId={user.id}
      clinicId={membership?.clinic_id ?? ""}
      role="OWNER"
    />
  );
}
