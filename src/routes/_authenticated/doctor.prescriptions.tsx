import { createFileRoute } from "@tanstack/react-router";
import { PrescriptionsList } from "@/components/careflow/prescriptions-list";
import { PageTitle } from "@/components/careflow/page-title";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/doctor/prescriptions")({
  head: () => pageMetadata("Prescriptions", "DOCTOR"),
  component: Page,
});

function Page() {
  const { membership } = Route.useRouteContext();
  return (
    <div className="space-y-6">
      <PageTitle
        title="Doctor Prescriptions"
        description="View, search, and print official e-prescriptions issued to your clinic's patients."
      />
      <PrescriptionsList clinicId={membership?.clinic_id ?? ""} />
    </div>
  );
}
