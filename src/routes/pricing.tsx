import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { PublicLayout } from "@/components/careflow/auth-ui";
import { EmptyState } from "@/components/careflow/feedback";
import { PageTitle } from "@/components/careflow/page-title";
import { publicMeta } from "@/lib/public-meta";

export const Route = createFileRoute("/pricing")({
  head: () => publicMeta("Pricing", "Subscription plans for CAREFLOW AI clinics."),
  component: () => <PublicLayout><PageTitle title="Pricing" description="Subscription plans for clinics of every size." /><div className="rounded-lg border bg-card"><EmptyState icon={CreditCard} title="Plans are not published yet" description="Subscription plans will appear here once they are available." /></div></PublicLayout>,
});
