import { createFileRoute, useRouter } from "@tanstack/react-router";
import { StaffPatientsView } from "@/components/careflow/staff-patients-view";
import { ErrorState, LoadingState } from "@/components/careflow/feedback";
import { staffPatientsQuery } from "@/lib/patient-queries";
import { patientFiltersSchema, type PatientFilters } from "@/lib/patients";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/staff/patients")({
  head: () => pageMetadata("Patients", "STAFF"),
  validateSearch: (input: Record<string, unknown>): { search?: string; page?: number } =>
    patientFiltersSchema.parse(input),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const clinicId = context.membership?.clinic_id;
    if (!clinicId) throw new Error("No clinic selected.");
    const filters: PatientFilters = {
      search: deps.search ?? "",
      page: deps.page ?? 0,
    };
    await context.queryClient.ensureQueryData(
      staffPatientsQuery(context.user.id, clinicId, filters)
    );
  },
  pendingComponent: () => <LoadingState label="Loading patients…" />,
  errorComponent: PatientError,
  notFoundComponent: () => <ErrorState title="Patients not found" />,
  component: Page,
});

function Page() {
  const { membership, user } = Route.useRouteContext();
  const search = Route.useSearch();
  const filters: PatientFilters = {
    search: search.search ?? "",
    page: search.page ?? 0,
  };
  return (
    <StaffPatientsView
      userId={user.id}
      clinicId={membership?.clinic_id ?? ""}
      filters={filters}
    />
  );
}

function PatientError() {
  const router = useRouter();
  return (
    <ErrorState
      title="Patients couldn't load"
      description="Check your connection and clinic access, then try again."
      onRetry={() => void router.invalidate()}
    />
  );
}
