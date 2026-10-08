import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/careflow/workspace-page";
import { pageMetadata } from "@/lib/navigation";
export const Route = createFileRoute("/_authenticated/clinic/billing/new")({
  head: () => pageMetadata("New invoice", "OWNER"),
  component: Page,
});
function Page() { return <WorkspacePage role="OWNER" title="New invoice" />; }
