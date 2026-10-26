import { createFileRoute } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { PublicLayout } from "@/components/careflow/auth-ui";
import { EmptyState } from "@/components/careflow/feedback";
import { PageTitle } from "@/components/careflow/page-title";
import { publicMeta } from "@/lib/public-meta";

export const Route = createFileRoute("/contact")({
  head: () =>
    publicMeta(
      "Contact",
      "Get in touch with the CAREFLOW AI team for clinic onboarding, support inquiries, or practice management questions.",
      "/contact"
    ),
  component: () => <PublicLayout><PageTitle title="Contact" description="Get in touch with the CAREFLOW AI team." /><div className="rounded-lg border bg-card"><EmptyState icon={Mail} title="Contact details coming soon" description="Our contact information will be published here." /></div></PublicLayout>,
});
