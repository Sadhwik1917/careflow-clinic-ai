import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/careflow/workspace-page";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/patient/dashboard")({
  head: () => pageMetadata("Dashboard", "PATIENT"),
  component: Page,
});

function Page() {
  return <WorkspacePage role="PATIENT" title="Dashboard" dashboard />;
}
