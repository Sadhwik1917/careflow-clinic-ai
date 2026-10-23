import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { invitationsQuery, staffQuery } from "@/lib/team-queries";
import { cancelClinicInvitation, setClinicMemberStatus } from "@/lib/team.functions";
import { TEAM_PAGE_SIZE, invitationState, type MemberRow, type StaffFilters } from "@/lib/team";
import { PageTitle } from "./page-title";
import { EmptyState, StatusBadge, type StatusTone } from "./feedback";
import { MotionReveal } from "./motion-primitives";
import { InviteMemberDialog } from "./invite-member-dialog";

const memberStatus: Record<string, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: "Active", tone: "success" }, INVITED: { label: "Invited", tone: "info" },
  SUSPENDED: { label: "Suspended", tone: "warning" }, REMOVED: { label: "Removed", tone: "neutral" },
};

function MemberActions({ member, onChange, pending }: { member: MemberRow; onChange: (status: "ACTIVE" | "SUSPENDED" | "REMOVED") => void; pending: boolean }) {
  if (member.status === "REMOVED") return null;
  return <div className="flex flex-wrap gap-2">
    {member.status === "ACTIVE" && <Button variant="outline" size="sm" disabled={pending} onClick={() => onChange("SUSPENDED")}>Suspend</Button>}
    {member.status === "SUSPENDED" && <Button variant="outline" size="sm" disabled={pending} onClick={() => onChange("ACTIVE")}>Reactivate</Button>}
    <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" size="sm" disabled={pending}>Remove</Button></AlertDialogTrigger>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove {member.display_name ?? "this member"}?</AlertDialogTitle><AlertDialogDescription>They will immediately lose access to this clinic. This is recorded in the activity history.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => onChange("REMOVED")}>Remove member</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

export function StaffRoster({ userId, clinicId, filters }: { userId: string; clinicId: string; filters: StaffFilters }) {
  const { data, isRefetchError } = useSuspenseQuery(staffQuery(userId, clinicId, filters));
  const { data: invitations } = useSuspenseQuery(invitationsQuery(userId, clinicId));
  const navigate = useNavigate(); const qc = useQueryClient();
  const setStatus = useServerFn(setClinicMemberStatus); const cancelInvite = useServerFn(cancelClinicInvitation);
  const [search, setSearch] = useState(filters.search);
  useEffect(() => setSearch(filters.search), [filters.search]);
  const pages = Math.max(1, Math.ceil(data.count / TEAM_PAGE_SIZE));
  const change = (patch: Partial<StaffFilters>) => navigate({ to: "/clinic/staff", search: { ...filters, ...patch } });
  useEffect(() => { if (filters.page >= pages) void navigate({ to: "/clinic/staff", search: { ...filters, page: pages - 1 }, replace: true }); }, [filters, pages, navigate]);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["staff", userId, clinicId] }), qc.invalidateQueries({ queryKey: ["invitations", userId, clinicId] }), qc.invalidateQueries({ queryKey: ["doctors", userId, clinicId] })]);
  const statusMutation = useMutation({ mutationFn: (v: { memberId: string; status: "ACTIVE" | "SUSPENDED" | "REMOVED" }) => setStatus({ data: { clinicId, ...v } }), onSuccess: refresh });
  const cancelMutation = useMutation({ mutationFn: (invitationId: string) => cancelInvite({ data: { clinicId, invitationId } }), onSuccess: refresh });
  return <><PageTitle title="Staff" description="Staff members and team invitations for your clinic." actions={<InviteMemberDialog userId={userId} clinicId={clinicId} />} />
    <MotionReveal className="space-y-5 border-t py-6">
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex max-w-md flex-1 gap-2" onSubmit={e => { e.preventDefault(); void change({ search: search.trim(), page: 0 }); }}><Input aria-label="Search staff" placeholder="Staff name" maxLength={100} value={search} onChange={e => setSearch(e.target.value)} /><Button type="submit" variant="outline" size="icon" aria-label="Search"><Search /></Button>{filters.search && <Button type="button" variant="ghost" onClick={() => { setSearch(""); void change({ search: "", page: 0 }); }}>Clear</Button>}</form>
        <Select value={filters.status} onValueChange={status => void change({ status: status as StaffFilters["status"], page: 0 })}><SelectTrigger className="w-36" aria-label="Filter by status"><SelectValue /></SelectTrigger><SelectContent>{(["ALL", "ACTIVE", "INVITED", "SUSPENDED", "REMOVED"] as const).map(s => <SelectItem key={s} value={s}>{s === "ALL" ? "All statuses" : memberStatus[s].label}</SelectItem>)}</SelectContent></Select>
      </div>
      {isRefetchError && <p role="alert" className="text-sm text-destructive">Refresh failed. Showing the last loaded staff.</p>}
      {statusMutation.isError && <p role="alert" className="text-sm text-destructive">{statusMutation.error instanceof Error ? statusMutation.error.message : "The member status could not be changed."}</p>}
      <p aria-live="polite" className="text-sm text-muted-foreground">{data.count} staff member{data.count === 1 ? "" : "s"}</p>
      {!data.rows.length ? <EmptyState icon={UserRoundCog} title={filters.search || filters.status !== "ALL" ? "No matching staff" : "No staff yet"} description={!filters.search && filters.status === "ALL" ? "Invite staff members to help run your clinic." : undefined} /> : <Table><TableHeader><TableRow>{["Name", "Joined", "Status", ""].map((h, i) => <TableHead key={i}>{h || <span className="sr-only">Actions</span>}</TableHead>)}</TableRow></TableHeader><TableBody>{data.rows.map(m => <TableRow key={m.id}><TableCell className="min-w-40 font-medium">{m.display_name ?? "Name not available"}</TableCell><TableCell>{m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "—"}</TableCell><TableCell><StatusBadge tone={memberStatus[m.status].tone}>{memberStatus[m.status].label}</StatusBadge></TableCell><TableCell><MemberActions member={m} pending={statusMutation.isPending} onChange={status => statusMutation.mutate({ memberId: m.id, status })} /></TableCell></TableRow>)}</TableBody></Table>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><span className="text-sm text-muted-foreground">Page {filters.page + 1} of {pages}</span><div className="flex gap-2"><Button variant="outline" size="sm" aria-label="Previous page" disabled={filters.page === 0} onClick={() => void change({ page: filters.page - 1 })}><ChevronLeft />Previous</Button><Button variant="outline" size="sm" aria-label="Next page" disabled={filters.page + 1 >= pages} onClick={() => void change({ page: filters.page + 1 })}>Next<ChevronRight /></Button></div></div>
      <section className="border-t pt-6"><h2 className="mb-4 text-base font-semibold">Invitations</h2>
        {cancelMutation.isError && <p role="alert" className="mb-3 text-sm text-destructive">{cancelMutation.error instanceof Error ? cancelMutation.error.message : "The invitation could not be cancelled."}</p>}
        {!invitations.length ? <p className="text-sm text-muted-foreground">No invitations sent yet.</p> : <Table><TableHeader><TableRow>{["Email", "Role", "Status", "Expires", ""].map((h, i) => <TableHead key={i}>{h || <span className="sr-only">Actions</span>}</TableHead>)}</TableRow></TableHeader><TableBody>{invitations.map(inv => { const state = invitationState(inv); return <TableRow key={inv.id}><TableCell className="min-w-48 break-all font-medium">{inv.email}</TableCell><TableCell>{inv.role === "DOCTOR" ? "Doctor" : "Staff"}</TableCell><TableCell><StatusBadge tone={state.tone}>{state.label}</StatusBadge></TableCell><TableCell>{new Date(inv.expires_at).toLocaleDateString()}</TableCell><TableCell>{inv.status === "PENDING" && new Date(inv.expires_at).getTime() > Date.now() && <Button variant="outline" size="sm" disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate(inv.id)}>Cancel</Button>}</TableCell></TableRow>; })}</TableBody></Table>}
      </section>
    </MotionReveal></>;
}
