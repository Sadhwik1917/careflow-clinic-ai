import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { doctorsQuery } from "@/lib/team-queries";
import { TEAM_PAGE_SIZE, doctorStatusLabel, type DoctorFilters } from "@/lib/team";
import { PageTitle } from "./page-title";
import { EmptyState, StatusBadge, type StatusTone } from "./feedback";
import { MotionReveal } from "./motion-primitives";
import { InviteMemberDialog } from "./invite-member-dialog";

const statusTone: Record<string, StatusTone> = { ACTIVE: "success", INACTIVE: "neutral", ON_LEAVE: "warning" };

export function DoctorsDirectory({ userId, clinicId, filters }: { userId: string; clinicId: string; filters: DoctorFilters }) {
  const { data, isRefetchError } = useSuspenseQuery(doctorsQuery(userId, clinicId, filters));
  const navigate = useNavigate();
  const [search, setSearch] = useState(filters.search);
  useEffect(() => setSearch(filters.search), [filters.search]);
  const pages = Math.max(1, Math.ceil(data.count / TEAM_PAGE_SIZE));
  const change = (patch: Partial<DoctorFilters>) => navigate({ to: "/clinic/doctors", search: { ...filters, ...patch } });
  useEffect(() => { if (filters.page >= pages) void navigate({ to: "/clinic/doctors", search: { ...filters, page: pages - 1 }, replace: true }); }, [filters, pages, navigate]);
  return <><PageTitle
      title="Doctors"
      description="Doctor profiles in your clinic."
      actions={<InviteMemberDialog userId={userId} clinicId={clinicId} defaultRole="DOCTOR" triggerLabel="Invite doctor" />}
    />
    <MotionReveal className="space-y-5 border-t py-6">
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex max-w-md flex-1 gap-2" onSubmit={e => { e.preventDefault(); void change({ search: search.trim(), page: 0 }); }}><Input aria-label="Search doctors" placeholder="Name, specialty or department" maxLength={100} value={search} onChange={e => setSearch(e.target.value)} /><Button type="submit" variant="outline" size="icon" aria-label="Search"><Search /></Button>{filters.search && <Button type="button" variant="ghost" onClick={() => { setSearch(""); void change({ search: "", page: 0 }); }}>Clear</Button>}</form>
        <Select value={filters.status} onValueChange={status => void change({ status: status as DoctorFilters["status"], page: 0 })}><SelectTrigger className="w-36" aria-label="Filter by status"><SelectValue /></SelectTrigger><SelectContent>{(["ALL", "ACTIVE", "INACTIVE", "ON_LEAVE"] as const).map(s => <SelectItem key={s} value={s}>{s === "ALL" ? "All statuses" : doctorStatusLabel[s]}</SelectItem>)}</SelectContent></Select>
      </div>
      {isRefetchError && <p role="alert" className="text-sm text-destructive">Refresh failed. Showing the last loaded doctors.</p>}
      <p aria-live="polite" className="text-sm text-muted-foreground">{data.count} doctor{data.count === 1 ? "" : "s"}</p>
      {!data.rows.length ? (
        <EmptyState
          icon={Stethoscope}
          title={filters.search || filters.status !== "ALL" ? "No matching doctors" : "No doctors yet"}
          description={
            filters.search || filters.status !== "ALL"
              ? "Try adjusting your search or status filter."
              : "Invite doctors to build your clinic's medical team."
          }
          action={
            !filters.search && filters.status === "ALL" ? (
              <InviteMemberDialog userId={userId} clinicId={clinicId} defaultRole="DOCTOR" triggerLabel="Invite doctor" />
            ) : undefined
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {["Doctor", "Specialty", "Department", "Fee", "Status", ""].map((h, i) => (
                <TableHead key={i}>{h || <span className="sr-only">Profile</span>}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map(d => (
              <TableRow key={d.id}>
                <TableCell className="min-w-40 font-medium">{d.display_name ?? "Name not available"}</TableCell>
                <TableCell className="min-w-32">{d.specialization}</TableCell>
                <TableCell>{d.department ?? "—"}</TableCell>
                <TableCell>{d.consultation_fee != null ? `₹${d.consultation_fee}` : "—"}</TableCell>
                <TableCell>
                  <StatusBadge tone={statusTone[d.status] ?? "neutral"}>{doctorStatusLabel[d.status]}</StatusBadge>
                </TableCell>
                <TableCell>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/clinic/doctors/$doctorId" params={{ doctorId: d.id }} search={filters}>
                      View profile
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><span className="text-sm text-muted-foreground">Page {filters.page + 1} of {pages}</span><div className="flex gap-2"><Button variant="outline" size="sm" aria-label="Previous page" disabled={filters.page === 0} onClick={() => void change({ page: filters.page - 1 })}><ChevronLeft />Previous</Button><Button variant="outline" size="sm" aria-label="Next page" disabled={filters.page + 1 >= pages} onClick={() => void change({ page: filters.page + 1 })}>Next<ChevronRight /></Button></div></div>
    </MotionReveal></>;
}
