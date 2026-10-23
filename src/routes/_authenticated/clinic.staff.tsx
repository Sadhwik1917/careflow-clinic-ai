import { createFileRoute, useRouter } from "@tanstack/react-router";
import { StaffRoster } from "@/components/careflow/staff-roster";
import { ErrorState, LoadingState } from "@/components/careflow/feedback";
import { invitationsQuery, staffQuery } from "@/lib/team-queries";
import { staffFiltersSchema } from "@/lib/team";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/clinic/staff")({
  head: () => pageMetadata("Staff", "OWNER"),
  validateSearch: input => staffFiltersSchema.parse(input),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const clinicId = context.membership?.clinic_id;
    if (!clinicId) throw new Error("No clinic selected.");
    await context.queryClient.ensureQueryData(staffQuery(context.user.id, clinicId, deps));
    context.queryClient.prefetchQuery(invitationsQuery(context.user.id, clinicId));
  },
  pendingComponent: () => <LoadingState label="Loading staff…" />,
  errorComponent: StaffError,
  component: Page,
});

function Page() {
  const { membership, user } = Route.useRouteContext();
  return <StaffRoster userId={user.id} clinicId={membership?.clinic_id ?? ""} filters={Route.useSearch()} />;
}
function StaffError() { const router = useRouter(); return <ErrorState title="Staff couldn't load" description="Check your connection and clinic access, then try again." onRetry={() => void router.invalidate()} />; }
