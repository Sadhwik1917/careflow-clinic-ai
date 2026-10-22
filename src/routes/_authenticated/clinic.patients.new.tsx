import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { PatientForm } from "@/components/careflow/patient-form";
import { PageTitle } from "@/components/careflow/page-title";
import { registerClinicPatient } from "@/lib/patients.functions";
import { patientQuery } from "@/lib/patient-queries";
import { pageMetadata } from "@/lib/navigation";
export const Route = createFileRoute("/_authenticated/clinic/patients/new")({
  head: () => pageMetadata("New patient", "OWNER"),
  component: Page,
});
function Page() {
  const { user, membership } = Route.useRouteContext();
  const clinicId = membership?.clinic_id ?? "";
  const register = useServerFn(registerClinicPatient); const qc = useQueryClient(); const navigate = useNavigate();
  return <><PageTitle title="Register patient" /><div className="border-t py-6"><PatientForm onCancel={() => void navigate({ to: "/clinic/patients" })} onSave={async fields => {
    const p = await register({ data: { clinicId, fields } });
    qc.setQueryData(patientQuery(user.id, clinicId, p.id).queryKey, p);
    await qc.invalidateQueries({ queryKey: ["patients", user.id, clinicId] });
    await navigate({ to: "/clinic/patients/$patientId", params: { patientId: p.id } });
  }} /></div></>;
}
