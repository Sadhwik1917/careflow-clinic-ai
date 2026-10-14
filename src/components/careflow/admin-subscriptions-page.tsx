import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, CreditCard, Search, RefreshCw } from "lucide-react";
import { PageTitle } from "./page-title";
import { EmptyState, StatusBadge } from "./feedback";
import { MotionReveal } from "./motion-primitives";
import { SubscriptionDetails } from "./subscription-details";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { adminSubscriptionsQuery } from "@/lib/admin-subscriptions";
import { subscriptionLabel } from "@/lib/admin-data";
import { dateLabel, moneyLabel, trialLabel, subscriptionStatuses, SUBSCRIPTION_PAGE_SIZE, type SubscriptionFilters, type SubscriptionRow } from "@/lib/admin-subscription-rules";

export function AdminSubscriptionsPage({ filters }: { filters: SubscriptionFilters }) {
  const q = useSuspenseQuery(adminSubscriptionsQuery(filters));
  const navigate = useNavigate();
  const [search, setSearch] = useState(filters.search);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = q.data.rows.find(r => r.id === selectedId);
  const change = (patch: Partial<SubscriptionFilters>) => navigate({ to: "/admin/subscriptions", search: { ...filters, ...patch } });
  const pages = Math.max(1, Math.ceil(q.data.count / SUBSCRIPTION_PAGE_SIZE));
  return <>
    <PageTitle title="Subscriptions" description="Clinic plans, trials and payment records." />
    <MotionReveal className="space-y-5 border-t px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <form className="flex w-full gap-2 sm:max-w-sm" onSubmit={e => { e.preventDefault(); void change({ search: search.trim(), page: 0 }); }}>
          <Input aria-label="Search subscriptions" placeholder="Clinic name, code, plan or subscription ID" value={search} onChange={e => setSearch(e.target.value)} maxLength={120} />
          <Button type="submit" size="icon" variant="outline" aria-label="Search"><Search /></Button>
        </form>
        <Select value={filters.status} onValueChange={status => void change({ status: status as SubscriptionFilters["status"], page: 0 })}><SelectTrigger aria-label="Subscription status" className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All statuses</SelectItem>{subscriptionStatuses.map(s => <SelectItem key={s} value={s}>{subscriptionLabel[s]}</SelectItem>)}</SelectContent></Select>
        <Select value={filters.type} onValueChange={type => void change({ type: type as SubscriptionFilters["type"], page: 0 })}><SelectTrigger aria-label="Subscription type" className="w-full sm:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All types</SelectItem><SelectItem value="PAID">Paid plans</SelectItem><SelectItem value="TRIAL">Trials</SelectItem></SelectContent></Select>
        <TooltipProvider><Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label="Refresh subscriptions" disabled={q.isFetching} onClick={() => void q.refetch()}><RefreshCw className={q.isFetching ? "animate-spin" : ""} /></Button></TooltipTrigger><TooltipContent>Refresh subscriptions</TooltipContent></Tooltip></TooltipProvider>
        {(filters.search || filters.status !== "ALL" || filters.type !== "ALL") && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); void change({ search: "", status: "ALL", type: "ALL", page: 0 }); }}>Clear filters</Button>}
      </div>
      {q.isRefetchError && <p role="alert" className="text-sm text-destructive">Refresh failed. Showing the last loaded records.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span aria-live="polite">{q.data.count} subscription{q.data.count === 1 ? "" : "s"}</span><span>Newest first</span></div>
      {q.data.rows.length === 0 ? <EmptyState icon={CreditCard} title={filters.search || filters.status !== "ALL" || filters.type !== "ALL" ? "No matching subscriptions" : "No subscriptions recorded"} description={filters.search || filters.status !== "ALL" || filters.type !== "ALL" ? "Try a different search or filter." : undefined} />
        : <SubscriptionTable rows={q.data.rows} onDetails={r => setSelectedId(r.id)} />}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm"><span className="text-muted-foreground">Page {filters.page + 1} of {pages}</span><div className="flex gap-2">
        <Button size="sm" variant="outline" aria-label="Previous page" disabled={filters.page === 0} onClick={() => void change({ page: filters.page - 1 })}><ChevronLeft />Previous</Button>
        <Button size="sm" variant="outline" aria-label="Next page" disabled={filters.page + 1 >= pages} onClick={() => void change({ page: filters.page + 1 })}>Next<ChevronRight /></Button>
      </div></div>
    </MotionReveal>
    {selected && <SubscriptionDetails row={selected} onClose={() => setSelectedId(null)} />}
  </>;
}

export function SubscriptionTable({ rows, onDetails }: { rows: SubscriptionRow[]; onDetails: (row: SubscriptionRow) => void }) {
  return <Table><TableHeader><TableRow>{["Clinic", "Plan / subscription", "Status", "Billing", "Start date", "Renewal / end", "Trial", "Latest payment", ""].map((h, i) => <TableHead key={h || i} className="whitespace-nowrap">{h || <span className="sr-only">Actions</span>}</TableHead>)}</TableRow></TableHeader>
    <TableBody>{rows.map(row => <TableRow key={row.id}>
      <TableCell className="min-w-48 max-w-64"><ul className="space-y-2">{row.links.length ? row.links.map((l, i) => <li key={l.clinic?.id ?? i}>{l.clinic ? <Link className="font-medium text-primary hover:underline" to="/admin/clinics/$clinicId" params={{ clinicId: l.clinic.id }}>{l.clinic.display_name || l.clinic.name}<span className="block text-xs font-normal text-muted-foreground">{l.clinic.clinic_code}</span></Link> : "Clinic unavailable"}</li>) : <span className="text-muted-foreground">No clinic linked</span>}</ul></TableCell>
      <TableCell className="min-w-48 max-w-64"><p className="font-medium">{row.plan?.name ?? "Plan unavailable"}</p><span title={row.id} className="block text-xs text-muted-foreground">{row.subscription_type === "TRIAL" ? "Trial" : "Paid"} · {row.id.slice(0, 8)}</span></TableCell>
      <TableCell className="whitespace-nowrap"><StatusBadge tone={row.status === "ACTIVE" ? "success" : row.status === "TRIAL_ACTIVE" ? "info" : row.status === "PAST_DUE" ? "danger" : row.status === "PENDING_PAYMENT" ? "warning" : "neutral"}>{subscriptionLabel[row.status]}</StatusBadge></TableCell>
      <TableCell className="whitespace-nowrap"><p className="font-medium tabular-nums">{moneyLabel(Number(row.amount), row.currency)}</p><p className="text-xs text-muted-foreground">{row.billing_cycle}</p></TableCell>
      <TableCell className="whitespace-nowrap">{dateLabel(row.start_date)}{row.status === "PENDING_PAYMENT" && <p className="text-xs text-muted-foreground">Awaiting activation</p>}</TableCell>
      <TableCell className="whitespace-nowrap">{dateLabel(row.cancelled_at ?? (row.status === "TRIAL_ACTIVE" ? row.trial_end_date : row.next_billing_date ?? row.renewal_date ?? row.trial_end_date))}<p className="text-xs text-muted-foreground">{row.cancelled_at ? "Cancelled" : row.status === "TRIAL_ACTIVE" ? "Trial expiry" : row.next_billing_date ? "Next billing" : row.renewal_date ? "Renewal" : row.trial_end_date ? "Trial end" : "Not recorded"}</p></TableCell>
      <TableCell className="whitespace-nowrap">{trialLabel(row)}{row.subscription_type === "TRIAL" && <p className="text-xs text-muted-foreground">{dateLabel(row.trial_end_date)}</p>}</TableCell>
      <TableCell className="whitespace-nowrap">{row.payments[0] ? <><span className="capitalize">{row.payments[0].status.toLowerCase()}</span><p className="text-xs text-muted-foreground">{dateLabel(row.payments[0].paid_at ?? row.payments[0].created_at)}</p></> : <span className="text-muted-foreground">Not recorded</span>}</TableCell>
      <TableCell><Button variant="outline" size="sm" aria-label={`View subscription ${row.id}`} onClick={() => onDetails(row)}>View details</Button></TableCell>
    </TableRow>)}</TableBody></Table>;
}