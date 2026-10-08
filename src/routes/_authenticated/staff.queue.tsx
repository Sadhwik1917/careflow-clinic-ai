import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/careflow/workspace-page";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/staff/queue")({
  head: () => pageMetadata("Queue", "STAFF"),
  component: Page,
});

function Page() {
  return <WorkspacePage role="STAFF" title="Queue" />;
}
