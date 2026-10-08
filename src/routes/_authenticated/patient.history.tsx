import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/careflow/workspace-page";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/patient/history")({
  head: () => pageMetadata("Medical history", "PATIENT"),
  component: Page,
});

function Page() {
  return <WorkspacePage role="PATIENT" title="Medical history" />;
}
