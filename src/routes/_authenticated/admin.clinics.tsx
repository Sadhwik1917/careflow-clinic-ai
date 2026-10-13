import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageTitle } from "@/components/careflow/page-title";
import { ErrorState, LoadingState } from "@/components/careflow/feedback";
import { AdminClinicRows, ClinicListHeader } from "@/components/careflow/admin-clinic-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminClinicsQuery } from "@/lib/admin-data";
import { pageMetadata } from "@/lib/navigation";
import { statusLabel, type VerificationStatus } from "@/lib/verification";

export const Route = createFileRoute("/_authenticated/admin/clinics")({
  head: () => pageMetadata("Clinics", "PLATFORM_ADMIN"),
  component: Page,
});

const PAGE = 20;
const filters: (VerificationStatus | "ALL" | "NONE")[] = ["ALL", "PENDING_REVIEW", "APPROVED", "CHANGES_REQUESTED", "REJECTED", "DRAFT", "NONE"];

function Page() {
  const q = useQuery(adminClinicsQuery);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof filters)[number]>("ALL");
  const [page, setPage] = useState(0);
  const rows = useMemo(() => (q.data ?? []).filter(c =>
    (status === "ALL" || (status === "NONE" ? c.verification === null : c.verification === status))
    && (!search || `${c.display_name} ${c.name} ${c.clinic_code} ${c.city ?? ""} ${c.state ?? ""}`.toLowerCase().includes(search.toLowerCase()))), [q.data, search, status]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages - 1);
  return <>
    <PageTitle title="Clinics" description="All clinics registered on CareFlow." />
    <div className="space-y-4 border-t px-4 py-6 md:px-6">
      <div className="flex flex-wrap gap-3">
        <Input aria-label="Search clinics" placeholder="Search name, code or location" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="max-w-xs" />
        <select aria-label="Verification status" value={status} onChange={e => { setStatus(e.target.value as typeof status); setPage(0); }} className="h-9 rounded-md border bg-background px-3 text-sm">
          {filters.map(s => <option key={s} value={s}>{s === "ALL" ? "All statuses" : s === "NONE" ? "Not submitted" : statusLabel[s]}</option>)}
        </select>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <ClinicListHeader />
        {q.isPending ? <div className="px-5"><LoadingState label="Loading clinics…" /></div>
          : q.isError ? <ErrorState title="Clinics couldn't load" description="Check your connection or admin access, then try again." onRetry={() => q.refetch()} />
          : <AdminClinicRows rows={rows.slice(cur * PAGE, cur * PAGE + PAGE)} {...((q.data?.length ?? 0) > 0 ? { emptyTitle: "No matching clinics", emptyDescription: "Try a different search or filter." } : {})} />}
      </div>
      {q.isSuccess && rows.length > PAGE && <div className="flex items-center justify-end gap-3 text-sm">
        <span className="text-muted-foreground">Page {cur + 1} of {pages}</span>
        <Button variant="outline" size="sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</Button>
      </div>}
    </div>
  </>;
}
