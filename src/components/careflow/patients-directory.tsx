import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { patientsQuery } from "@/lib/patient-queries";
import { PATIENT_PAGE_SIZE, patientStatus, type PatientFilters } from "@/lib/patients";
import { PageTitle } from "./page-title";
import { EmptyState, StatusBadge } from "./feedback";
import { MotionReveal } from "./motion-primitives";

import { PatientQrDialog } from "./patient-qr-dialog";

export function PatientsDirectory({ userId, clinicId, filters }: { userId: string; clinicId: string; filters: PatientFilters }) {
  const { data, isRefetchError } = useSuspenseQuery(patientsQuery(userId, clinicId, filters));
  const navigate = useNavigate();
  const [search, setSearch] = useState(filters.search);
  useEffect(() => setSearch(filters.search), [filters.search]);
  const pages = Math.max(1, Math.ceil(data.count / PATIENT_PAGE_SIZE));
  const change = (patch: Partial<PatientFilters>) => navigate({ to: "/clinic/patients", search: { ...filters, ...patch } });
  useEffect(() => { if (filters.page >= pages) void navigate({ to: "/clinic/patients", search: { ...filters, page: pages - 1 }, replace: true }); }, [filters, pages, navigate]);
  return <><PageTitle title="Patients" actions={<div className="flex flex-wrap items-center gap-2"><PatientQrDialog clinicId={clinicId} /><Button asChild><Link to="/clinic/patients/new"><Plus />Register patient</Link></Button></div>} />
    <MotionReveal className="space-y-5 border-t py-6">
      <form className="flex max-w-md gap-2" onSubmit={e => { e.preventDefault(); void change({ search: search.trim(), page: 0 }); }}><Input aria-label="Search patients" placeholder="Patient name or number" maxLength={100} value={search} onChange={e => setSearch(e.target.value)} /><Button type="submit" variant="outline" size="icon" aria-label="Search"><Search /></Button>{filters.search && <Button type="button" variant="ghost" onClick={() => { setSearch(""); void change({ search: "", page: 0 }); }}>Clear</Button>}</form>
      {isRefetchError && <p role="alert" className="text-sm text-destructive">Refresh failed. Showing the last loaded patients.</p>}
      <p aria-live="polite" className="text-sm text-muted-foreground">{data.count} patient{data.count === 1 ? "" : "s"}</p>
      {!data.rows.length ? <EmptyState icon={Users} title={filters.search ? "No matching patients" : "No patients registered"} action={!filters.search && <Button asChild><Link to="/clinic/patients/new">Register patient</Link></Button>} /> : <Table><TableHeader><TableRow>{["Patient", "Patient number", "Contact", "Status", ""].map((h, i) => <TableHead key={i}>{h || <span className="sr-only">Profile</span>}</TableHead>)}</TableRow></TableHeader><TableBody>{data.rows.map(p => <TableRow key={p.id}><TableCell className="min-w-40 font-medium">{p.first_name} {p.last_name}</TableCell><TableCell>{p.patient_number}</TableCell><TableCell className="min-w-40"><span className="block">{p.phone || "—"}</span><span className="block break-all text-xs text-muted-foreground">{p.email}</span></TableCell><TableCell><StatusBadge tone={p.status === "ACTIVE" ? "success" : "neutral"}>{patientStatus(p.status)}</StatusBadge></TableCell><TableCell><Button asChild variant="outline" size="sm"><Link to="/clinic/patients/$patientId" params={{ patientId: p.id }}>View profile</Link></Button></TableCell></TableRow>)}</TableBody></Table>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><span className="text-sm text-muted-foreground">Page {filters.page + 1} of {pages}</span><div className="flex gap-2"><Button variant="outline" size="sm" aria-label="Previous page" disabled={filters.page === 0} onClick={() => void change({ page: filters.page - 1 })}><ChevronLeft />Previous</Button><Button variant="outline" size="sm" aria-label="Next page" disabled={filters.page + 1 >= pages} onClick={() => void change({ page: filters.page + 1 })}>Next<ChevronRight /></Button></div></div>
    </MotionReveal></>;
}