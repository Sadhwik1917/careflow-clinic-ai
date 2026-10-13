import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Building2, ClipboardCheck, ListOrdered, Receipt, Users } from "lucide-react";
import { PageTitle } from "./page-title";
import { StatisticsCard } from "./statistics-card";
import { EmptyState, ErrorState, LoadingState } from "./feedback";
import { AdminClinicRows, ClinicListHeader } from "./admin-clinic-list";
import { Button } from "@/components/ui/button";
import { adminActivityQuery, adminClinicsQuery, adminStatsQuery } from "@/lib/admin-data";
import { navigation } from "@/lib/navigation";

export function AdminDashboard() {
  const stats = useQuery(adminStatsQuery);
  const clinics = useQuery(adminClinicsQuery);
  const activity = useQuery(adminActivityQuery);
  const val = (n: number | null | undefined) => (stats.isPending ? "…" : n ?? null);
  const det = (n: number | null | undefined, ok: string) => (stats.isPending ? "Loading" : n === null || n === undefined ? "Couldn't load" : ok);
  const items = navigation.PLATFORM_ADMIN.filter(i => i.group === "Workspace" && i.title !== "Dashboard").slice(0, 3);
  return <>
    <PageTitle title="Platform overview" description="Platform administrator workspace" />
    <section aria-label="Overview statistics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatisticsCard label="Clinics" value={val(stats.data?.clinics)} detail={det(stats.data?.clinics, "All registered clinics")} icon={Building2} />
      <StatisticsCard label="Subscriptions" value={val(stats.data?.subscriptions)} detail={det(stats.data?.subscriptions, "Active paid plans and running trials")} icon={Receipt} />
      <StatisticsCard label="Users" value={val(stats.data?.users)} detail={det(stats.data?.users, "Registered accounts")} icon={Users} />
      <StatisticsCard label="Pending reviews" value={val(stats.data?.pending)} detail={det(stats.data?.pending, "Clinics awaiting verification")} icon={ClipboardCheck} />
    </section>
    {stats.isError && <div className="mt-4"><ErrorState title="Statistics couldn't load" onRetry={() => stats.refetch()} /></div>}
    <div className="mt-9 grid gap-8 xl:grid-cols-[1.8fr_1fr]">
      <section><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-base font-semibold">Clinics</h2><Button asChild variant="ghost" size="sm" className="text-primary"><Link to="/admin/clinics">View all<ArrowUpRight /></Link></Button></div>
        <div className="overflow-hidden rounded-lg border bg-card"><ClinicListHeader />
          {clinics.isPending ? <div className="px-5"><LoadingState label="Loading clinics…" /></div>
            : clinics.isError ? <ErrorState title="Clinics couldn't load" onRetry={() => clinics.refetch()} />
            : <AdminClinicRows rows={clinics.data.slice(0, 5)} />}
        </div></section>
      <section><div className="mb-4 flex min-h-8 items-center"><h2 className="text-base font-semibold">Platform activity</h2></div>
        <div className="border-t border-b">
          {activity.isPending ? <LoadingState label="Loading activity…" />
            : activity.isError ? <ErrorState title="Activity couldn't load" onRetry={() => activity.refetch()} />
            : activity.data.length === 0 ? <EmptyState icon={ListOrdered} title="No activity recorded" description="Audit events will appear here as they are logged." />
            : <ul className="divide-y">{activity.data.map(a => <li key={a.id} className="py-3 text-sm"><span className="block font-medium">{a.action}</span><span className="text-xs text-muted-foreground">{a.entity_type} · {new Date(a.created_at).toLocaleString()}</span></li>)}</ul>}
        </div></section>
    </div>
    <section className="mt-9"><h2 className="mb-4 text-base font-semibold">Workspace</h2><div className="grid gap-4 md:grid-cols-3">{items.map(item => <Button key={item.path} asChild variant="outline" className="h-auto justify-start gap-4 whitespace-normal bg-card p-5 text-left shadow-none"><Link to={item.path}><span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary"><item.icon className="size-5" strokeWidth={1.6} /></span><span className="flex-1 font-medium">{item.title}</span><ArrowUpRight className="text-muted-foreground" /></Link></Button>)}</div></section>
  </>;
}
