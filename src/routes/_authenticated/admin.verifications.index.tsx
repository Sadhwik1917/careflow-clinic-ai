import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { PageTitle } from "@/components/careflow/page-title";
import { EmptyState, StatusBadge } from "@/components/careflow/feedback";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { pageMetadata } from "@/lib/navigation";
import { statusLabel, statusTone, type VerificationStatus } from "@/lib/verification";

const listQuery = queryOptions({
  queryKey: ["admin-verifications"],
  queryFn: async () => {
    const { data, error } = await supabase.from("clinic_verifications").select("clinic_id, status, submitted_at, cycle, clinic:clinics(name, display_name, state, city)").order("submitted_at", { ascending: false, nullsFirst: false });
    if (error) throw new Error("We couldn't load applications.");
    return data ?? [];
  },
});

export const Route = createFileRoute("/_authenticated/admin/verifications/")({
  head: () => pageMetadata("Verifications", "PLATFORM_ADMIN"),
  component: Page,
});

const statuses: (VerificationStatus | "ALL")[] = ["PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "DRAFT", "ALL"];

function Page() {
  const { data } = useSuspenseQuery(listQuery);
  const [status, setStatus] = useState<VerificationStatus | "ALL">("PENDING_REVIEW");
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const rows = data.filter(r => (status === "ALL" || r.status === status)
    && (!q || `${r.clinic?.name} ${r.clinic?.display_name}`.toLowerCase().includes(q.toLowerCase()))
    && (!state || (r.clinic?.state ?? "").toLowerCase().includes(state.toLowerCase())));
  return <>
    <PageTitle title="Clinic verifications" description="Review clinic applications and documents." />
    <div className="space-y-4 border-t px-4 py-6 md:px-6">
      <div className="flex flex-wrap gap-3">
        <select aria-label="Status" value={status} onChange={e => setStatus(e.target.value as VerificationStatus | "ALL")} className="h-9 rounded-md border bg-background px-3 text-sm">
          {statuses.map(s => <option key={s} value={s}>{s === "ALL" ? "All statuses" : statusLabel[s]}</option>)}
        </select>
        <Input aria-label="Search clinic name" placeholder="Search clinic name" value={q} onChange={e => setQ(e.target.value)} className="max-w-xs" />
        <Input aria-label="State" placeholder="State" value={state} onChange={e => setState(e.target.value)} className="max-w-[10rem]" />
      </div>
      {rows.length === 0 ? <div className="rounded-lg border bg-card"><EmptyState icon={ShieldCheck} title="No applications" description="Nothing matches these filters." /></div> :
        <ul className="divide-y rounded-lg border bg-card">{rows.map(r => <li key={r.clinic_id}>
          <Link to="/admin/verifications/$clinicId" params={{ clinicId: r.clinic_id }} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/50">
            <span><span className="block font-medium">{r.clinic?.display_name} <span className="text-muted-foreground">· {r.clinic?.name}</span></span>
              <span className="text-xs text-muted-foreground">{[r.clinic?.city, r.clinic?.state].filter(Boolean).join(", ") || "No location"} · {r.submitted_at ? `Submitted ${new Date(r.submitted_at).toLocaleDateString()}` : "Not submitted"}</span></span>
            <StatusBadge tone={statusTone[r.status]}>{statusLabel[r.status]}</StatusBadge>
          </Link></li>)}</ul>}
    </div>
  </>;
}
