import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { PatientProfile } from "@/components/careflow/patient-profile";
import { EmptyState, ErrorState, LoadingState } from "@/components/careflow/feedback";
import { patientQuery } from "@/lib/patient-queries";
import { pageMetadata } from "@/lib/navigation";
export const Route = createFileRoute("/_authenticated/clinic/patients/$patientId")({
  head: () => pageMetadata("Patient details", "OWNER"),
  validateSearch: (input): { registered?: boolean } => ({ registered: input['registered'] === true ? true : undefined }),
  loader: async ({ context, params }) => {
    if (!z.string().uuid().safeParse(params.patientId).success) throw notFound();
    const clinicId = context.membership?.clinic_id;
    if (!clinicId) throw new Error("No clinic selected.");
    await context.queryClient.ensureQueryData(patientQuery(context.user.id, clinicId, params.patientId));
  },
  pendingComponent: () => <LoadingState label="Loading patient…" />,
  errorComponent: PatientError,
  notFoundComponent: () => <EmptyState title="Patient unavailable" description="This patient isn't available in your selected clinic." />,
  component: Page,
});
function Page() { const { user, membership } = Route.useRouteContext(); return <>{Route.useSearch().registered && <p role="status" className="mb-4 text-sm text-success-foreground">Patient registered successfully.</p>}<PatientProfile userId={user.id} clinicId={membership?.clinic_id ?? ""} patientId={Route.useParams().patientId} /></>; }
function PatientError() { const router = useRouter(); return <ErrorState title="Patient couldn't load" onRetry={() => void router.invalidate()} />; }
