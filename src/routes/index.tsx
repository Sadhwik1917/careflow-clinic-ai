import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/careflow/workspace-page";
import { pageMetadata } from "@/lib/navigation";
export const Route = createFileRoute("/")({
  head: () => pageMetadata("Clinic overview", "OWNER"),
  component: Index,
});
function Index() {
  return <WorkspacePage role="OWNER" title="Dashboard" dashboard />;
}
