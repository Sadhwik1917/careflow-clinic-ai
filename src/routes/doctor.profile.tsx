import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/careflow/workspace-page";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/doctor/profile")({
  head: () => pageMetadata("Profile", "DOCTOR"),
  component: Page,
});

function Page() {
  return <WorkspacePage role="DOCTOR" title="Profile" />;
}
