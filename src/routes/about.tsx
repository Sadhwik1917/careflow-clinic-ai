import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/careflow/auth-ui";
import { PageTitle } from "@/components/careflow/page-title";
import { publicMeta } from "@/lib/public-meta";

export const Route = createFileRoute("/about")({
  head: () => publicMeta("About", "About CAREFLOW AI, a clinic management workspace for owners, doctors, staff and patients."),
  component: () => <PublicLayout><PageTitle title="About CAREFLOW AI" /><div className="max-w-2xl space-y-4 text-base leading-relaxed text-muted-foreground"><p>CAREFLOW AI is a clinic management workspace for clinic owners, doctors, front-desk staff and patients.</p><p>Each clinic keeps its own records separate, and every person sees only what their role in that clinic allows. AI features are designed to assist clinicians, never to replace their judgement.</p></div></PublicLayout>,
});
