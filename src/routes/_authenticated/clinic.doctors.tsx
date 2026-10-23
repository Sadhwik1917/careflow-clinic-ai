import { createFileRoute, useRouter } from "@tanstack/react-router";
import { DoctorsDirectory } from "@/components/careflow/doctors-directory";
import { ErrorState, LoadingState } from "@/components/careflow/feedback";
import { doctorsQuery } from "@/lib/team-queries";
import { doctorFiltersSchema } from "@/lib/team";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/clinic/doctors")({
  head: () => pageMetadata("Doctors", "OWNER"),
  validateSearch: input => doctorFiltersSchema.parse(input),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const clinicId = context.membership?.clinic_id;
    if (!clinicId) throw new Error("No clinic selected.");
    await context.queryClient.ensureQueryData(doctorsQuery(context.user.id, clinicId, deps));
  },
  pendingComponent: () => <LoadingState label="Loading doctors…" />,
  errorComponent: DoctorsError,
  component: Page,
});

function Page() {
  const { membership, user } = Route.useRouteContext();
  return <DoctorsDirectory userId={user.id} clinicId={membership?.clinic_id ?? ""} filters={Route.useSearch()} />;
}
function DoctorsError() { const router = useRouter(); return <ErrorState title="Doctors couldn't load" description="Check your connection and clinic access, then try again." onRetry={() => void router.invalidate()} />; }
