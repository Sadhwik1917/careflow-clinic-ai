import { createFileRoute, useRouter } from "@tanstack/react-router";
import { PatientsDirectory } from "@/components/careflow/patients-directory";
import { ErrorState, LoadingState } from "@/components/careflow/feedback";
import { patientsQuery } from "@/lib/patient-queries";
import { patientFiltersSchema } from "@/lib/patients";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/clinic/patients/")({
  head: () => pageMetadata("Patients", "OWNER"),
  validateSearch: input => patientFiltersSchema.parse(input),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const clinicId = context.membership?.clinic_id;
    if (!clinicId) throw new Error("No clinic selected.");
    await context.queryClient.ensureQueryData(patientsQuery(context.user.id, clinicId, deps));
  },
  pendingComponent: () => <LoadingState label="Loading patients…" />,
  errorComponent: PatientError,
  notFoundComponent: () => <ErrorState title="Patients not found" />,
  component: Page,
});

function Page() {
  const { membership, user } = Route.useRouteContext();
  return <PatientsDirectory userId={user.id} clinicId={membership?.clinic_id ?? ""} filters={Route.useSearch()} />;
}
function PatientError() { const router = useRouter(); return <ErrorState title="Patients couldn't load" description="Check your connection and clinic access, then try again." onRetry={() => void router.invalidate()} />; }
