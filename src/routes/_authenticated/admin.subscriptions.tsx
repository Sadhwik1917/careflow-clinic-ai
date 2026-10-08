import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/careflow/workspace-page";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/admin/subscriptions")({
  head: () => pageMetadata("Subscriptions", "PLATFORM_ADMIN"),
  component: Page,
});

function Page() {
  return <WorkspacePage role="PLATFORM_ADMIN" title="Subscriptions" />;
}
