import { useEffect, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Search, Users } from "lucide-react";
import { PageTitle } from "./page-title";
import { EmptyState, StatusBadge } from "./feedback";
import { MotionDialogContent, MotionReveal, DialogTitle, DialogDescription } from "./motion-primitives";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { adminUsersQuery } from "@/lib/admin-users";
import { dateLabel } from "@/lib/admin-subscription-rules";
import { memberRoleLabel, memberStatusLabel, USER_PAGE_SIZE, userCategory, type AdminUserRow, type UserFilters } from "@/lib/admin-user-rules";

const roleOptions: [UserFilters["role"], string][] = [["ALL", "All roles"], ["PLATFORM_ADMIN", "Platform admin"], ["OWNER", "Clinic owner"], ["DOCTOR", "Doctor"], ["STAFF", "Staff"], ["PATIENT", "Patient"]];

export function AdminUsersPage({ filters }: { filters: UserFilters }) {
  const q = useSuspenseQuery(adminUsersQuery(filters));
  const navigate = useNavigate();
  const [search, setSearch] = useState(filters.search);
  useEffect(() => setSearch(filters.search), [filters.search]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = q.data.rows.find(r => r.id === selectedId);
  const change = (patch: Partial<UserFilters>) => navigate({ to: "/admin/users", search: { ...filters, ...patch } });
  const pages = Math.max(1, Math.ceil(q.data.count / USER_PAGE_SIZE));
  const filtered = Boolean(filters.search || filters.role !== "ALL" || filters.status !== "ALL");
  useEffect(() => {
    if (filters.page >= pages) void navigate({ to: "/admin/users", search: { ...filters, page: pages - 1 }, replace: true });
  }, [filters, pages, navigate]);
  return <>
    <PageTitle title="Users" description="Accounts, platform roles and clinic memberships." />
    <MotionReveal className="space-y-5 border-t px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <form className="flex w-full gap-2 sm:max-w-sm" onSubmit={e => { e.preventDefault(); void change({ search: search.trim(), page: 0 }); }}>
          <Input aria-label="Search users" placeholder="Name or email" value={search} onChange={e => setSearch(e.target.value)} maxLength={120} />
          <Button type="submit" size="icon" variant="outline" aria-label="Search"><Search /></Button>
        </form>
        <Select value={filters.role} onValueChange={role => void change({ role: role as UserFilters["role"], page: 0 })}><SelectTrigger aria-label="Role" className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent>{roleOptions.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
        <Select value={filters.status} onValueChange={status => void change({ status: status as UserFilters["status"], page: 0 })}><SelectTrigger aria-label="Account status" className="w-full sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All statuses</SelectItem><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="INACTIVE">Not active</SelectItem></SelectContent></Select>
        <TooltipProvider><Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label="Refresh users" disabled={q.isFetching} onClick={() => void q.refetch()}><RefreshCw className={q.isFetching ? "animate-spin" : ""} /></Button></TooltipTrigger><TooltipContent>Refresh users</TooltipContent></Tooltip></TooltipProvider>
        {filtered && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); void change({ search: "", role: "ALL", status: "ALL", page: 0 }); }}>Clear filters</Button>}
      </div>
      {q.isRefetchError && <p role="alert" className="text-sm text-destructive">Refresh failed. Showing the last loaded records.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span aria-live="polite">{q.data.count} user{q.data.count === 1 ? "" : "s"}</span><span>Newest first</span></div>
      {q.data.rows.length === 0 ? <EmptyState icon={Users} title={filtered ? "No matching users" : "No users recorded"} {...(filtered ? { description: "Try a different search or filter." } : {})} />
        : <UserTable rows={q.data.rows} onDetails={r => setSelectedId(r.id)} />}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm"><span className="text-muted-foreground">Page {filters.page + 1} of {pages}</span><div className="flex gap-2">
        <Button size="sm" variant="outline" aria-label="Previous page" disabled={filters.page === 0} onClick={() => void change({ page: filters.page - 1 })}><ChevronLeft />Previous</Button>
        <Button size="sm" variant="outline" aria-label="Next page" disabled={filters.page + 1 >= pages} onClick={() => void change({ page: filters.page + 1 })}>Next<ChevronRight /></Button>
      </div></div>
    </MotionReveal>
    {selected && <UserDetails row={selected} onClose={() => setSelectedId(null)} />}
  </>;
}

const statusBadge = (status: string) => <StatusBadge tone={status === "ACTIVE" ? "success" : "neutral"}>{status === "ACTIVE" ? "Active" : status.charAt(0) + status.slice(1).toLowerCase()}</StatusBadge>;
const clinicName = (m: AdminUserRow["memberships"][number]) => m.clinic?.display_name || m.clinic?.name || "Clinic unavailable";

export function UserTable({ rows, onDetails }: { rows: AdminUserRow[]; onDetails: (row: AdminUserRow) => void }) {
  return <Table><TableHeader><TableRow>{["User", "Category", "Clinics", "Status", "Created", ""].map((h, i) => <TableHead key={h || i} className="whitespace-nowrap">{h || <span className="sr-only">Actions</span>}</TableHead>)}</TableRow></TableHeader>
    <TableBody>{rows.map(row => <TableRow key={row.id}>
      <TableCell className="min-w-48 max-w-72"><p className="font-medium">{row.display_name || "Name not set"}</p><span className="block break-all text-xs text-muted-foreground">{row.email ?? "Email unavailable"}</span></TableCell>
      <TableCell className="min-w-36">{userCategory(row)}</TableCell>
      <TableCell className="min-w-48 max-w-64">{row.memberships.length ? <ul className="space-y-1">{row.memberships.slice(0, 3).map(m => <li key={m.id} className="text-sm">{clinicName(m)}<span className="text-xs text-muted-foreground"> · {memberRoleLabel[m.role]}</span></li>)}{row.memberships.length > 3 && <li className="text-xs text-muted-foreground">+{row.memberships.length - 3} more</li>}</ul> : <span className="text-muted-foreground">None</span>}</TableCell>
      <TableCell className="whitespace-nowrap">{statusBadge(row.status)}</TableCell>
      <TableCell className="whitespace-nowrap">{dateLabel(row.created_at)}</TableCell>
      <TableCell><Button variant="outline" size="sm" aria-label={`View user ${row.display_name || row.email || row.id}`} onClick={() => onDetails(row)}>View details</Button></TableCell>
    </TableRow>)}</TableBody></Table>;
}

export function UserDetails({ row, onClose }: { row: AdminUserRow; onClose: () => void }) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><MotionDialogContent onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }} onCloseAutoFocus={event => { event.preventDefault(); returnFocus.current?.focus(); }}>
    <div className="mb-5 space-y-2 pr-9"><DialogTitle>{row.display_name || "Name not set"}</DialogTitle><DialogDescription className="break-all">{row.email ?? "Email unavailable"}</DialogDescription></div>
    <dl className="grid grid-cols-1 gap-x-5 gap-y-4 text-sm sm:grid-cols-2">
      {[["Category", userCategory(row)], ["Platform role", row.platform_role === "PLATFORM_ADMIN" ? "Platform admin" : "User"], ["Account status", statusBadge(row.status)], ["Created", dateLabel(row.created_at)]].map(([label, value]) =>
        <div key={label as string} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}
    </dl>
    <div className="mt-6 border-t pt-4"><h3 className="mb-2 text-sm font-semibold">Clinic memberships</h3>
      {row.memberships.length === 0 ? <p className="text-sm text-muted-foreground">No clinic memberships.</p> : <ul className="divide-y">{row.memberships.map(m => <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div className="min-w-0 break-words text-sm">{clinicName(m)}<span className="block text-xs text-muted-foreground">{m.clinic?.clinic_code} · {memberRoleLabel[m.role]} · {memberStatusLabel[m.status]}{m.joined_at ? ` · joined ${dateLabel(m.joined_at)}` : ""}</span></div>
        {m.clinic && <Button asChild size="sm" variant="outline"><Link to="/admin/clinics/$clinicId" params={{ clinicId: m.clinic.id }}>View clinic<ExternalLink aria-hidden="true" /></Link></Button>}
      </li>)}</ul>}
    </div>
  </MotionDialogContent></Dialog>;
}
