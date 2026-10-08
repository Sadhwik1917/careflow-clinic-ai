import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/careflow/workspace-page";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/admin/analytics")({
  head: () => pageMetadata("Analytics", "PLATFORM_ADMIN"),
  component: Page,
});

function Page() {
  return <WorkspacePage role="PLATFORM_ADMIN" title="Analytics" />;
}
