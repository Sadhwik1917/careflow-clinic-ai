import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/careflow/workspace-page";
import { pageMetadata } from "@/lib/navigation";
export const Route = createFileRoute("/clinic/patients/$patientId")({
  head: () => pageMetadata("Patient details", "OWNER"),
  component: Page,
});
function Page() { return <WorkspacePage role="OWNER" title="Patient details" />; }
