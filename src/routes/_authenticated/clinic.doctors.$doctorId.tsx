import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { DoctorProfile } from "@/components/careflow/doctor-profile";
import { EmptyState, ErrorState, LoadingState } from "@/components/careflow/feedback";
import { doctorQuery } from "@/lib/team-queries";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/clinic/doctors/$doctorId")({
  head: () => pageMetadata("Doctor details", "OWNER"),
  loader: async ({ context, params }) => {
    if (!z.string().uuid().safeParse(params.doctorId).success) throw notFound();
    const clinicId = context.membership?.clinic_id;
    if (!clinicId) throw new Error("No clinic selected.");
    await context.queryClient.ensureQueryData(doctorQuery(context.user.id, clinicId, params.doctorId));
  },
  pendingComponent: () => <LoadingState label="Loading doctor…" />,
  errorComponent: DoctorError,
  notFoundComponent: () => <EmptyState title="Doctor unavailable" description="This doctor isn't available in your selected clinic." />,
  component: Page,
});

function Page() { const { user, membership } = Route.useRouteContext(); return <DoctorProfile userId={user.id} clinicId={membership?.clinic_id ?? ""} doctorId={Route.useParams().doctorId} />; }
function DoctorError() { const router = useRouter(); return <ErrorState title="Doctor couldn't load" onRetry={() => void router.invalidate()} />; }
