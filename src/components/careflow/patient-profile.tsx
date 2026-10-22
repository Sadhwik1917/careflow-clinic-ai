import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { patientQuery } from "@/lib/patient-queries";
import { updateClinicPatient } from "@/lib/patients.functions";
import { patientStatus } from "@/lib/patients";
import { PageTitle } from "./page-title";
import { StatusBadge } from "./feedback";
import { PatientForm } from "./patient-form";

export function PatientProfile({ userId, clinicId, patientId }: { userId: string; clinicId: string; patientId: string }) {
  const query = patientQuery(userId, clinicId, patientId);
  const { data: p } = useSuspenseQuery(query);
  const qc = useQueryClient(); const update = useServerFn(updateClinicPatient);
  const [editing, setEditing] = useState(false); const [saved, setSaved] = useState(false);
  return <><div className="mb-4"><Button variant="ghost" asChild size="sm"><Link to="/clinic/patients"><ArrowLeft />Patients</Link></Button></div><PageTitle title={[p.first_name, p.last_name].filter(Boolean).join(" ")} description={p.patient_number} actions={!editing && <Button variant="outline" onClick={() => { setEditing(true); setSaved(false); }}><Pencil />Edit patient</Button>} />
    {saved && <p role="status" className="mb-4 text-sm text-success-foreground">Patient changes saved.</p>}
    <div className="border-t py-6">{editing ? <PatientForm key={p.updated_at} patient={p} onCancel={() => setEditing(false)} onSave={async values => {
      const { patient_number, ...fields } = values;
      const result = await update({ data: { clinicId, patientId, updatedAt: p.updated_at, fields } });
      qc.setQueryData(query.queryKey, result);
      await qc.invalidateQueries({ queryKey: ["patients", userId, clinicId] });
      setEditing(false); setSaved(true);
    }} /> : <dl className="grid max-w-3xl gap-x-8 gap-y-6 text-sm sm:grid-cols-2">{[
      ["Status", <StatusBadge tone={p.status === "ACTIVE" ? "success" : "neutral"}>{patientStatus(p.status)}</StatusBadge>],
      ["Date of birth", p.date_of_birth], ["Gender", p.gender], ["Phone", p.phone], ["Email", p.email], ["Address", p.address],
      ["Emergency contact", p.emergency_contact_name], ["Emergency contact phone", p.emergency_contact_phone],
      ["Registered", new Date(p.created_at).toLocaleString()], ["Last updated", new Date(p.updated_at).toLocaleString()], ["Notes", p.notes],
    ].map(([label, value]) => <div key={String(label)} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value || "Not recorded"}</dd></div>)}</dl>}</div></>;
}