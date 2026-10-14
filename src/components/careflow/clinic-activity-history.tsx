import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "./feedback";
import { clinicActivityQuery, type ClinicActivity } from "@/lib/clinic-activity";

export function ClinicActivityList({ items }: { items: ClinicActivity[] }) {
  if (items.length === 0) return <EmptyState icon={History} title="No activity recorded" description="Verification and administrative actions for this clinic will appear here." />;
  return <ol className="mt-3 divide-y text-sm">{items.map(a => <li key={a.id} className="py-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="font-medium">{a.label}{a.result && <span className="font-normal text-muted-foreground"> · {a.result}</span>}</span>
      <time dateTime={a.created_at} className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</time>
    </div>
    <p className="text-xs text-muted-foreground">By {a.actor ?? "Unknown user"}</p>
    {a.reason && <p className="mt-1 break-words">{a.reason}</p>}
  </li>)}</ol>;
}

export function ClinicActivityHistory({ clinicId }: { clinicId: string }) {
  const q = useQuery(clinicActivityQuery(clinicId));
  return <section className="rounded-lg border bg-card p-5" aria-label="Activity history">
    <h2 className="text-base font-semibold">Activity history</h2>
    <p className="mt-1 text-sm text-muted-foreground">Newest first, latest 50 entries.</p>
    {q.isPending ? <LoadingState label="Loading activity…" /> : q.isError ? <ErrorState title="Activity couldn't load" onRetry={() => q.refetch()} /> : <ClinicActivityList items={q.data} />}
  </section>;
}
