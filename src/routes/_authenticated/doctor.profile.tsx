import { createFileRoute, useRouter } from "@tanstack/react-router";
import { DoctorSelfProfile } from "@/components/careflow/doctor-self-profile";
import { ErrorState, LoadingState } from "@/components/careflow/feedback";
import { doctorSelfProfileQuery } from "@/lib/team-queries";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/doctor/profile")({
  head: () => pageMetadata("Profile", "DOCTOR"),
  loader: async ({ context }) => {
    const clinicId = context.membership?.clinic_id;
    if (!clinicId) throw new Error("No clinic selected.");
    await context.queryClient.ensureQueryData(doctorSelfProfileQuery(clinicId));
  },
  pendingComponent: () => <LoadingState label="Loading doctor profile…" />,
  errorComponent: DoctorProfileError,
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  const clinicId = membership?.clinic_id ?? "";
  return <DoctorSelfProfile userId={user.id} clinicId={clinicId} />;
}

function DoctorProfileError() {
  const router = useRouter();
  return (
    <ErrorState
      title="Doctor profile couldn't load"
      description="Check your clinic access and connection, then try again."
      onRetry={() => void router.invalidate()}
    />
  );
}

