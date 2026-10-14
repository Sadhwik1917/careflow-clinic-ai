import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { BadgeCheck, Building2, ClipboardCheck, CreditCard, FlaskConical, ShieldBan, ShieldOff, Users, LineChart as TrendIcon } from "lucide-react";
import { PageTitle } from "./page-title";
import { StatisticsCard } from "./statistics-card";
import { EmptyState } from "./feedback";
import { MotionReveal } from "./motion-primitives";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
import { adminAnalyticsQuery } from "@/lib/admin-analytics";
import { ANALYTICS_RANGES, rangeLabel, type AnalyticsRange } from "@/lib/admin-analytics-rules";
import { subscriptionLabel } from "@/lib/admin-data";

const trendConfig = { users: { label: "Users", color: "var(--chart-2)" }, clinics: { label: "Clinics", color: "var(--chart-3)" } } satisfies ChartConfig;
const distConfig = { count: { label: "Subscriptions", color: "var(--chart-2)" } } satisfies ChartConfig;

export function AdminAnalyticsPage({ range }: { range: AnalyticsRange }) {
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(adminAnalyticsQuery(range));
  const unavailable = (v: number | null) => (v === null ? "Couldn't be calculated" : undefined);
  const trendMissing = data.trend.some(t => t.users === null || t.clinics === null);
  const trendEmpty = !trendMissing && data.trend.every(t => !t.users && !t.clinics);
  const dist = data.statusDistribution.map(d => ({ status: subscriptionLabel[d.status], count: d.count }));
  const distMissing = dist.some(d => d.count === null);

  const cards = [
    { label: "Registered users", value: data.users, icon: Users, detail: "All accounts" },
    { label: "Clinics", value: data.clinics, icon: Building2, detail: "All registered clinics" },
    { label: "Awaiting verification", value: data.pendingReview, icon: ClipboardCheck, detail: "Submitted for review" },
    { label: "Approved", value: data.approved, icon: BadgeCheck, detail: "Approved and not suspended" },
    { label: "Suspended", value: data.suspended, icon: ShieldOff, detail: "Suspended by an administrator" },
    { label: "Revoked", value: data.revoked, icon: ShieldBan, detail: "Approval revoked" },
    { label: "Active paid subscriptions", value: data.activePaid, icon: CreditCard, detail: "Status Active" },
    { label: "Running trials", value: data.runningTrials, icon: FlaskConical, detail: "Trial active and not past its end date" },
  ];

  return <>
    <PageTitle title="Analytics" description="Platform-wide figures from live records" />
    <MotionReveal>
      <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(c => <StatisticsCard key={c.label} label={c.label} value={c.value} detail={unavailable(c.value) ?? c.detail} icon={c.icon} />)}
      </section>
    </MotionReveal>

    <div className="mt-8 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
      <Card className="rounded-lg shadow-none">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><CardTitle className="text-base">Registrations</CardTitle><CardDescription>New users and clinics over the last {rangeLabel[range]}</CardDescription></div>
          <ToggleGroup type="single" size="sm" variant="outline" value={range} aria-label="Time range"
            onValueChange={v => v && navigate({ to: "/admin/analytics", search: { range: v as AnalyticsRange }, replace: true })}>
            {ANALYTICS_RANGES.map(r => <ToggleGroupItem key={r} value={r} aria-label={rangeLabel[r]}>{r}</ToggleGroupItem>)}
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          {trendMissing ? <EmptyState icon={TrendIcon} title="Trend couldn't be calculated" description="Some registration counts failed to load. Try again shortly." />
            : trendEmpty ? <EmptyState icon={TrendIcon} title="No registrations in this period" description="Choose a longer time range to see earlier activity." />
            : <ChartContainer config={trendConfig} className="aspect-auto h-72 w-full" role="img" aria-label={`Registrations over the last ${rangeLabel[range]}: ${data.trend.map(t => `${t.label} ${t.users} users, ${t.clinics} clinics`).join("; ")}`}>
              <LineChart data={data.trend} margin={{ left: -16, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line dataKey="users" type="monotone" stroke="var(--color-users)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="clinics" type="monotone" stroke="var(--color-clinics)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ChartContainer>}
        </CardContent>
      </Card>

      <Card className="rounded-lg shadow-none">
        <CardHeader><CardTitle className="text-base">Subscription status</CardTitle><CardDescription>Current status of every subscription record</CardDescription></CardHeader>
        <CardContent>
          {distMissing ? <EmptyState icon={CreditCard} title="Distribution couldn't be calculated" description="Some subscription counts failed to load." />
            : dist.every(d => !d.count) ? <EmptyState icon={CreditCard} title="No subscriptions yet" description="Statuses appear once clinics enrol." />
            : <ChartContainer config={distConfig} className="aspect-auto h-72 w-full" role="img" aria-label={`Subscription status: ${dist.map(d => `${d.status} ${d.count}`).join(", ")}`}>
              <BarChart data={dist} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="status" width={110} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent hideLabel={false} />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} isAnimationActive={false} />
              </BarChart>
            </ChartContainer>}
        </CardContent>
      </Card>
    </div>
  </>;
}
