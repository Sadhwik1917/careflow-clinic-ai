import { createFileRoute } from "@tanstack/react-router";
import { ClinicBillingPage } from "@/components/careflow/clinic-billing-page";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/clinic/billing/")({
  head: () => pageMetadata("Billing", "OWNER"),
  component: Page,
});

function Page() {
  const { membership } = Route.useRouteContext();
  return <ClinicBillingPage clinicId={membership?.clinic_id ?? ""} />;
}
