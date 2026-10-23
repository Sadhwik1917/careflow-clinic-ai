import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { doctorQuery } from "@/lib/team-queries";
import { updateClinicDoctor } from "@/lib/team.functions";
import { doctorStatusLabel } from "@/lib/team";
import { PageTitle } from "./page-title";
import { StatusBadge, type StatusTone } from "./feedback";
import { DoctorForm } from "./doctor-form";

const statusTone: Record<string, StatusTone> = { ACTIVE: "success", INACTIVE: "neutral", ON_LEAVE: "warning" };

export function DoctorProfile({ userId, clinicId, doctorId }: { userId: string; clinicId: string; doctorId: string }) {
  const query = doctorQuery(userId, clinicId, doctorId);
  const { data: d } = useSuspenseQuery(query);
  const qc = useQueryClient(); const update = useServerFn(updateClinicDoctor);
  const [editing, setEditing] = useState(false); const [saved, setSaved] = useState(false);
  return <><div className="mb-4"><Button variant="ghost" asChild size="sm"><Link to="/clinic/doctors" search={{ search: "", status: "ALL", page: 0 }}><ArrowLeft />Doctors</Link></Button></div><PageTitle title={d.display_name ?? "Doctor"} description={d.specialization} actions={!editing && <Button variant="outline" onClick={() => { setEditing(true); setSaved(false); }}><Pencil />Edit profile</Button>} />
    {saved && <p role="status" className="mb-4 text-sm text-success-foreground">Doctor changes saved.</p>}
    <div className="border-t py-6">{editing ? <DoctorForm key={d.updated_at} doctor={d} onCancel={() => setEditing(false)} onSave={async fields => {
      const result = await update({ data: { clinicId, doctorId, updatedAt: d.updated_at, fields } });
      qc.setQueryData(query.queryKey, { ...result, display_name: d.display_name });
      await qc.invalidateQueries({ queryKey: ["doctors", userId, clinicId] });
      setEditing(false); setSaved(true);
    }} /> : <dl className="grid max-w-3xl gap-x-8 gap-y-6 text-sm sm:grid-cols-2">{[
      ["Status", <StatusBadge tone={statusTone[d.status]}>{doctorStatusLabel[d.status]}</StatusBadge>],
      ["Specialty", d.specialization], ["Department", d.department], ["Qualification", d.qualification],
      ["Experience", `${d.experience_years} year${d.experience_years === 1 ? "" : "s"}`], ["License number", d.license_number],
      ["Consultation fee", d.consultation_fee != null ? `₹${d.consultation_fee}` : null],
      ["Joined", new Date(d.created_at).toLocaleString()], ["Last updated", new Date(d.updated_at).toLocaleString()], ["Bio", d.bio],
    ].map(([label, value]) => <div key={String(label)} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value || "Not recorded"}</dd></div>)}</dl>}</div></>;
}
