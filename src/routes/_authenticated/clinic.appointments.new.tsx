import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppointmentForm } from "@/components/careflow/appointment-form";
import { PageTitle } from "@/components/careflow/page-title";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/clinic/appointments/new")({
  head: () => pageMetadata("New appointment", "OWNER"),
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-4xl">
      <PageTitle
        title="Schedule New Appointment"
        description="Select a patient and doctor, choose an available time slot, and confirm the booking."
      />
      <AppointmentForm
        userId={user.id}
        clinicId={membership?.clinic_id ?? ""}
        onSuccess={() => {
          void navigate({ to: "/clinic/appointments" });
        }}
        onCancel={() => {
          void navigate({ to: "/clinic/appointments" });
        }}
      />
    </div>
  );
}
