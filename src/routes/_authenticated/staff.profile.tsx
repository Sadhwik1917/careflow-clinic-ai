import { createFileRoute, useRouter } from "@tanstack/react-router";
import { StaffSelfProfile } from "@/components/careflow/staff-self-profile";
import { ErrorState, LoadingState } from "@/components/careflow/feedback";
import { staffSelfProfileQuery } from "@/lib/team-queries";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/staff/profile")({
  head: () => pageMetadata("Profile", "STAFF"),
  loader: async ({ context }) => {
    const clinicId = context.membership?.clinic_id;
    if (!clinicId) throw new Error("No clinic selected.");
    await context.queryClient.ensureQueryData(staffSelfProfileQuery(clinicId));
  },
  pendingComponent: () => <LoadingState label="Loading staff profile…" />,
  errorComponent: StaffProfileError,
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  const clinicId = membership?.clinic_id ?? "";
  return <StaffSelfProfile userId={user.id} clinicId={clinicId} />;
}

function StaffProfileError() {
  const router = useRouter();
  return (
    <ErrorState
      title="Staff profile couldn't load"
      description="Check your clinic access and connection, then try again."
      onRetry={() => void router.invalidate()}
    />
  );
}

