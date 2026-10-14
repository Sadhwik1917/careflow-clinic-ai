import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MotionDialogContent, MotionReveal, DialogTitle, DialogDescription } from "./motion-primitives";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "./feedback";
import { adminSubscriptionHistoryQuery } from "@/lib/admin-subscriptions";
import { dateLabel, moneyLabel, SUBSCRIPTION_PAGE_SIZE, trialLabel, type SubscriptionRow } from "@/lib/admin-subscription-rules";
import { subscriptionLabel } from "@/lib/admin-data";

export function SubscriptionDetails({ row, onClose }: { row: SubscriptionRow; onClose: () => void }) {
  const [tab, setTab] = useState("overview");
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><MotionDialogContent>
    <div className="mb-5 space-y-2 pr-9"><DialogTitle>Subscription details</DialogTitle><DialogDescription>{row.plan?.name ?? "Plan unavailable"}</DialogDescription>
      <p className="break-all font-mono text-xs text-muted-foreground">{row.id}</p></div>
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList aria-label="Subscription details" className="mb-4"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="payments">Payments</TabsTrigger><TabsTrigger value="trials">Trial history</TabsTrigger></TabsList>
      <TabsContent value="overview"><MotionReveal key="overview"><dl className="grid grid-cols-1 gap-x-5 gap-y-4 text-sm sm:grid-cols-2">
        {[
          ["Status", subscriptionLabel[row.status]], ["Billing", `${moneyLabel(Number(row.amount), row.currency)} / ${row.billing_cycle}`],
          ["Type / scope", `${row.subscription_type === "TRIAL" ? "Trial" : "Paid"} · ${row.clinic_scope === "MULTI" ? "Multi-clinic" : row.clinic_scope === "SINGLE" ? "Single clinic" : "Not recorded"}`],
          ["Created", dateLabel(row.created_at)], [row.status === "PENDING_PAYMENT" ? "Recorded start (awaiting activation)" : "Start date", dateLabel(row.start_date)],
          ["Next billing", dateLabel(row.next_billing_date)], ["Renewal date", dateLabel(row.renewal_date)], ["Cancelled", dateLabel(row.cancelled_at)],
          ["Auto-renew", row.auto_renew ? "Enabled" : "Disabled"], ["Mandate", row.mandate_status ? row.mandate_status.replaceAll("_", " ").toLowerCase() : "Not recorded"],
          ["Trial", trialLabel(row)], ["Trial start", dateLabel(row.trial_start_date)], ["Trial expiry", dateLabel(row.trial_end_date)], ["Trial cancelled", dateLabel(row.trial_cancelled_at)],
        ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}
      </dl><div className="mt-6 border-t pt-4"><h3 className="mb-2 text-sm font-semibold">Associated clinics</h3>
        {row.links.length === 0 ? <p className="text-sm text-muted-foreground">No clinic linked.</p> : <ul className="divide-y">{row.links.map((link, index) => <li key={link.clinic?.id ?? index} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div className="min-w-0 break-words text-sm">{link.clinic?.display_name || link.clinic?.name || "Clinic unavailable"}<span className="block text-xs text-muted-foreground">{link.clinic?.clinic_code}</span></div>
          {link.clinic && <Button asChild size="sm" variant="outline"><Link to="/admin/clinics/$clinicId" params={{ clinicId: link.clinic.id }}>View clinic<ExternalLink aria-hidden="true" /></Link></Button>}
        </li>)}</ul>}</div></MotionReveal></TabsContent>
      <TabsContent value="payments"><History key="payments" id={row.id} kind="payments" /></TabsContent>
      <TabsContent value="trials"><History key="trials" id={row.id} kind="trials" /></TabsContent>
    </Tabs>
  </MotionDialogContent></Dialog>;
}

function History({ id, kind }: { id: string; kind: "payments" | "trials" }) {
  const [page, setPage] = useState(0);
  const q = useQuery(adminSubscriptionHistoryQuery(id, kind, page));
  if (q.isPending) return <LoadingState label={`Loading ${kind === "payments" ? "payments" : "trial history"}…`} />;
  if (q.isError) return <ErrorState title="History couldn't load" onRetry={() => q.refetch()} />;
  const result = q.data;
  const pages = Math.max(1, Math.ceil(result.count / SUBSCRIPTION_PAGE_SIZE));
  return <MotionReveal key={`${kind}-${page}`}>
    {result.rows.length === 0 ? <EmptyState title={kind === "payments" ? "No payments recorded" : "No trial events recorded"} />
      : <ul className="divide-y">{result.kind === "payments" ? result.rows.map(p => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
        <div><p className="font-medium">{moneyLabel(Number(p.amount), p.currency)}</p><p className="text-xs text-muted-foreground">{dateLabel(p.paid_at ?? p.created_at)} · {p.payment_method ?? "Method not recorded"}</p></div>
        <StatusBadge tone={p.status === "SUCCESS" ? "success" : p.status === "FAILED" ? "danger" : "neutral"}>{p.status.toLowerCase()}</StatusBadge>
      </li>) : result.rows.map(t => <li key={t.id} className="py-3 text-sm"><p className="font-medium">{t.event_type.replaceAll("_", " ").toLowerCase()}</p><p className="mt-1 text-xs text-muted-foreground">{dateLabel(t.event_date)}</p></li>)}</ul>}
    {pages > 1 && <div className="mt-4 flex items-center justify-between gap-2 text-xs"><span>Page {page + 1} of {pages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
  </MotionReveal>;
}