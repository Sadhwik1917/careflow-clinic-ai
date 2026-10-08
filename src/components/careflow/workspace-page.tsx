import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CalendarDays, Users, ListOrdered, ClipboardCheck, Info, Receipt, Building2, Pill, type LucideIcon } from "lucide-react";
import { PageTitle } from "./page-title";
import { StatisticsCard } from "./statistics-card";
import { EmptyState, StatusBadge } from "./feedback";
import { Button } from "@/components/ui/button";
import { navigation, roleLabels, type AppRole } from "@/lib/navigation";

const metrics: Record<AppRole, { label: string; icon: LucideIcon }[]> = {
  OWNER: [{ label: "Today's patients", icon: Users }, { label: "Appointments", icon: CalendarDays }, { label: "Waiting patients", icon: ListOrdered }, { label: "Completed consultations", icon: ClipboardCheck }],
  DOCTOR: [{ label: "Today's appointments", icon: CalendarDays }, { label: "Current queue", icon: ListOrdered }, { label: "Recent patients", icon: Users }, { label: "Pending consultations", icon: ClipboardCheck }],
  STAFF: [{ label: "Today's appointments", icon: CalendarDays }, { label: "Patient registration", icon: Users }, { label: "Queue", icon: ListOrdered }, { label: "Billing", icon: Receipt }],
  PATIENT: [{ label: "Appointments", icon: CalendarDays }, { label: "Prescriptions", icon: Pill }, { label: "Bills", icon: Receipt }, { label: "Medical history", icon: ClipboardCheck }],
  PLATFORM_ADMIN: [{ label: "Clinics", icon: Building2 }, { label: "Subscriptions", icon: Receipt }, { label: "Users", icon: Users }, { label: "Analytics", icon: ClipboardCheck }],
};

export function WorkspacePage({ role, title, dashboard = false }: { role: AppRole; title: string; dashboard?: boolean }) {
  if (!dashboard) return <><PageTitle title={title} description={`${roleLabels[role]} workspace`} actions={<StatusBadge>Preview</StatusBadge>} /><div className="border-t"><EmptyState title={`${title} workspace is not connected`} description="Live records and actions will be available in a later phase." icon={navigation[role].find(item => item.title === title)?.icon ?? ClipboardCheck} /></div></>;
  const heading = role === "OWNER" ? "Clinic overview" : role === "PATIENT" ? "Your care overview" : role === "PLATFORM_ADMIN" ? "Platform overview" : role === "DOCTOR" ? "Clinical overview" : "Daily overview";
  const items = navigation[role].filter(item => item.group === "Workspace" && item.title !== "Dashboard").slice(0, 3);
  return <>
    <PageTitle title={heading} description={role === "OWNER" ? "A clear view of your clinic, all in one place." : `${roleLabels[role]} workspace`} actions={<StatusBadge>Preview</StatusBadge>} />
    <div className="mb-6 flex items-start gap-3 border-l-2 border-primary bg-secondary/50 px-4 py-3 text-sm text-secondary-foreground"><Info className="mt-0.5 size-4 shrink-0" /><p>This is a design preview. Clinic records, totals, and actions are not connected.</p></div>
    <section aria-label="Overview statistics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics[role].map(metric => <StatisticsCard key={metric.label} label={metric.label} value={null} detail="Not connected" icon={metric.icon} />)}</section>
    <div className="mt-9 grid gap-8 xl:grid-cols-[1.8fr_1fr]">
      <section><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{role === "PLATFORM_ADMIN" ? "Clinics" : "Appointments"}</h2><Button asChild variant="ghost" size="sm" className="text-primary"><Link to={role === "PLATFORM_ADMIN" ? "/admin/clinics" : navigation[role].find(item => item.title === "Appointments")?.path ?? "/clinic/appointments"}>View all<ArrowUpRight /></Link></Button></div><div className="overflow-hidden rounded-lg border bg-card"><div className="flex items-center justify-between gap-3 border-b bg-muted/50 px-5 py-3 text-xs font-medium text-muted-foreground"><span>{role === "PLATFORM_ADMIN" ? "Clinic" : "Patient"}</span><span>{role === "PLATFORM_ADMIN" ? "Subscription" : "Appointment"}</span><span>Status</span></div><EmptyState title={role === "PLATFORM_ADMIN" ? "Clinic list not connected" : "Appointment list not connected"} description="No records are loaded in this design preview." icon={CalendarDays} /></div></section>
      <section><div className="mb-4 flex min-h-8 items-center justify-between"><h2 className="text-base font-semibold">{role === "PLATFORM_ADMIN" ? "Platform activity" : "Queue overview"}</h2><StatusBadge>Not connected</StatusBadge></div><div className="border-t border-b"><EmptyState title="Nothing to display yet" description="Live activity will appear here once this workspace is connected." icon={ListOrdered} /></div></section>
    </div>
    <section className="mt-9"><h2 className="mb-4 text-base font-semibold">Workspace</h2><div className="grid gap-4 md:grid-cols-3">{items.map(item => <Button key={item.path} asChild variant="outline" className="h-auto justify-start gap-4 whitespace-normal bg-card p-5 text-left shadow-none"><Link to={item.path}><span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary"><item.icon className="size-5" strokeWidth={1.6} /></span><span className="flex-1 font-medium">{item.title}</span><ArrowUpRight className="text-muted-foreground" /></Link></Button>)}</div></section>
  </>;
}