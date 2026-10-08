import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/careflow/workspace-page";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/patient/profile")({
  head: () => pageMetadata("Profile", "PATIENT"),
  component: Page,
});

function Page() {
  return <WorkspacePage role="PATIENT" title="Profile" />;
}
