import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { WorkspacePage } from "@/components/careflow/workspace-page";
import { EmptyState, LoadingState } from "@/components/careflow/feedback";
import { PageTitle } from "@/components/careflow/page-title";
import { Button } from "@/components/ui/button";
import { pageMetadata } from "@/lib/navigation";
import { clinicAiQuery } from "@/lib/plan-state";
import { AiUsageCard } from "@/components/careflow/ai-usage-card";

export const Route = createFileRoute("/_authenticated/clinic/ai")({
  head: () => pageMetadata("AI assistant", "OWNER"),
  component: Page,
});

function Page() {
  const { membership } = Route.useRouteContext();
  const ai = useQuery(clinicAiQuery(membership?.clinic_id ?? ""));
  if (ai.isPending) return <div className="px-6"><LoadingState label="Checking your plan…" /></div>;
  if (ai.data !== true) return <>
    <PageTitle title="AI assistant" />
    <div className="border-t px-4 py-6 md:px-6"><EmptyState icon={Sparkles} title="AI isn't included in your plan" description="Upgrade to a plan with AI to use the AI assistant." action={<Button asChild><Link to="/clinic/plans">View plans</Link></Button>} /></div>
  </>;
  return <><div className="px-4 pt-6 md:px-6"><AiUsageCard clinicId={membership?.clinic_id ?? ""} /></div><WorkspacePage role="OWNER" title="AI assistant" /></>;
}
