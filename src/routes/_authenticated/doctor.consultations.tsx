import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/careflow/workspace-page";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/doctor/consultations")({
  head: () => pageMetadata("Consultations", "DOCTOR"),
  component: Page,
});

function Page() {
  return <WorkspacePage role="DOCTOR" title="Consultations" />;
}
