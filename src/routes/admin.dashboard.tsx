import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/careflow/workspace-page";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => pageMetadata("Dashboard", "PLATFORM_ADMIN"),
  component: Page,
});

function Page() {
  return <WorkspacePage role="PLATFORM_ADMIN" title="Dashboard" dashboard />;
}
