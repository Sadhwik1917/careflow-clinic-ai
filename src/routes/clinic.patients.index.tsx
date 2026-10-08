import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/careflow/workspace-page";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/clinic/patients/")({
  head: () => pageMetadata("Patients", "OWNER"),
  component: Page,
});

function Page() {
  return <WorkspacePage role="OWNER" title="Patients" />;
}
