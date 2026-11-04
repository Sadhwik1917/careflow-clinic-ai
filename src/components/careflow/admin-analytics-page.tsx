import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { LiquidGauge } from "./liquid-gauge";
import {
  BadgeCheck,
  Building2,
  ClipboardCheck,
  CreditCard,
  FlaskConical,
  ShieldBan,
  ShieldOff,
  Users,
  Sparkles,
  Receipt,
  LineChart as TrendIcon,
} from "lucide-react";
import { PageTitle } from "./page-title";
import { StatisticsCard } from "./statistics-card";
import { EmptyState } from "./feedback";
import { MotionReveal } from "./motion-primitives";
import { FutureAnalyticsCard } from "./future-analytics-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { adminAnalyticsQuery } from "@/lib/admin-analytics";
import {
  ANALYTICS_RANGES,
  rangeLabel,
  ADMIN_FUTURE_VISUALIZATIONS,
  type AnalyticsRange,
} from "@/lib/admin-analytics-rules";
import { subscriptionLabel } from "@/lib/admin-data";

const trendConfig = {
  users: { label: "Users", color: "var(--chart-2)" },
  clinics: { label: "Clinics", color: "var(--chart-3)" },
} satisfies ChartConfig;

const distConfig = {
  count: { label: "Subscriptions", color: "var(--chart-2)" },
} satisfies ChartConfig;

const aiTrendConfig = {
  credits: { label: "AI Credits", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function AdminAnalyticsPage({ range }: { range: AnalyticsRange }) {
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(adminAnalyticsQuery(range));
  const unavailable = (v: number | null) => (v === null ? "Couldn't be calculated" : undefined);

  // Adoption trend
  const trendMissing = data.trend.some(t => t.users === null || t.clinics === null);
  const trendEmpty = !trendMissing && data.trend.every(t => !t.users && !t.clinics);

  // Subscriptions distribution
  const dist = data.statusDistribution.map(d => ({ status: subscriptionLabel[d.status], count: d.count }));
  const distMissing = dist.some(d => d.count === null);

  // AI Usage
  const aiTrend = data.aiTrend ?? [];
  const aiFeatures = data.aiFeatures ?? [];
  const aiTrendEmpty = aiTrend.length === 0 || aiTrend.every(t => !t.credits);

  // Future visualization definitions
  const churnForecastDef =
    data.futureVisualizations?.find(v => v.id === "clinic-churn-risk-forecast") ??
    ADMIN_FUTURE_VISUALIZATIONS[0]!;
  const aiVelocityDef =
    data.futureVisualizations?.find(v => v.id === "ai-token-cost-velocity") ??
    ADMIN_FUTURE_VISUALIZATIONS[1]!;

  const cards = [
    { label: "Registered users", value: data.users, icon: Users, detail: "All accounts" },
    { label: "Clinics", value: data.clinics, icon: Building2, detail: "All registered clinics" },
    { label: "Approved clinics", value: data.approved, icon: BadgeCheck, detail: "Operational and verified" },
    { label: "Awaiting review", value: data.pendingReview, icon: ClipboardCheck, detail: "Submitted for verification" },
    { label: "Active paid subs", value: data.activePaid, icon: CreditCard, detail: "Active paid plans" },
    {
      label: "Estimated platform MRR",
      value: data.estimatedMrr !== null && data.estimatedMrr !== undefined ? `₹${data.estimatedMrr.toLocaleString("en-IN")}` : null,
      icon: Receipt,
      detail: "Run-rate from active paid plans",
    },
    { label: "Running trials", value: data.runningTrials, icon: FlaskConical, detail: "Trial active & not expired" },
    {
      label: "Platform AI credits",
      value: data.totalAiCredits !== undefined ? data.totalAiCredits : null,
      icon: Sparkles,
      detail: "Total credits consumed",
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle
          title="Platform Analytics"
          description="Platform performance, clinic adoption, verification, subscriptions, and AI utilization"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Range:</span>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={range}
            aria-label="Time range"
            onValueChange={v =>
              v && navigate({ to: "/admin/analytics", search: { range: v as AnalyticsRange }, replace: true })
            }
          >
            {ANALYTICS_RANGES.map(r => (
              <ToggleGroupItem key={r} value={r} aria-label={rangeLabel[r]}>
                {r}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <MotionReveal>
        <section aria-label="Executive platform metrics" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(c => (
            <StatisticsCard
              key={c.label}
              label={c.label}
              value={c.value}
              detail={c.value === null ? "Couldn't be calculated" : c.detail}
              icon={c.icon}
            />
          ))}
        </section>
      </MotionReveal>

      {/* Structured Category Tabs */}
      <Tabs defaultValue="adoption" className="mt-8 space-y-6">
        <TabsList className="bg-muted/60 p-1">
          <TabsTrigger value="adoption" className="text-xs">
            Adoption & Growth
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="text-xs">
            Subscriptions & Revenue
          </TabsTrigger>
          <TabsTrigger value="ai" className="text-xs">
            AI Credit Utilization
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Platform Adoption */}
        <TabsContent value="adoption" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            <Card className="rounded-lg shadow-none">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">Registrations Growth</CardTitle>
                  <CardDescription>
                    New users and clinics registered over the last {rangeLabel[range]}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {trendMissing ? (
                  <EmptyState
                    icon={TrendIcon}
                    title="Trend couldn't be calculated"
                    description="Some registration counts failed to load. Try again shortly."
                  />
                ) : trendEmpty ? (
                  <EmptyState
                    icon={TrendIcon}
                    title="No registrations in this period"
                    description="Choose a longer time range to see earlier activity."
                  />
                ) : (
                  <ChartContainer
                    config={trendConfig}
                    className="aspect-auto h-72 w-full"
                    role="img"
                    aria-label={`Registrations over the last ${rangeLabel[range]}: ${data.trend.map(t => `${t.label} ${t.users} users, ${t.clinics} clinics`).join("; ")}`}
                  >
                    <AreaChart data={data.trend} margin={{ left: -16, right: 8 }}>
                      <defs>
                        {(["users", "clinics"] as const).map(k => (
                          <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.02} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Area
                        dataKey="users"
                        type="monotone"
                        stroke="var(--color-users)"
                        fill="url(#fill-users)"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Area
                        dataKey="clinics"
                        type="monotone"
                        stroke="var(--color-clinics)"
                        fill="url(#fill-clinics)"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-lg shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Verification Health</CardTitle>
                <CardDescription>Share of registered clinics approved and operational</CardDescription>
              </CardHeader>
              <CardContent>
                {data.approved === null || data.clinics === null ? (
                  <EmptyState
                    icon={BadgeCheck}
                    title="Approval rate couldn't be calculated"
                    description="Some clinic counts failed to load."
                    className="min-h-40"
                  />
                ) : data.clinics === 0 ? (
                  <EmptyState
                    icon={BadgeCheck}
                    title="No clinics yet"
                    description="The approval rate appears once clinics register."
                    className="min-h-40"
                  />
                ) : (
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center gap-6">
                      <LiquidGauge
                        value={(data.approved / data.clinics) * 100}
                        label="Approved clinics as a share of all clinics"
                        size={100}
                      />
                      <div className="space-y-1 text-sm">
                        <p className="font-medium text-foreground">
                          {data.approved} of {data.clinics} clinics approved
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Platform requires verification before operational activation.
                        </p>
                      </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 border-t pt-4 text-xs sm:grid-cols-3">
                      <div className="rounded-md bg-muted/40 p-2.5">
                        <dt className="text-muted-foreground">Pending Review</dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                          {data.pendingReview ?? "—"}
                        </dd>
                      </div>
                      <div className="rounded-md bg-muted/40 p-2.5">
                        <dt className="text-muted-foreground">Suspended</dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums text-destructive">
                          {data.suspended ?? "—"}
                        </dd>
                      </div>
                      <div className="rounded-md bg-muted/40 p-2.5">
                        <dt className="text-muted-foreground">Revoked</dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums text-muted-foreground">
                          {data.revoked ?? "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Future Visualization in Adoption */}
          <div className="mt-6">
            <FutureAnalyticsCard definition={churnForecastDef} />
          </div>
        </TabsContent>

        {/* Tab 2: Subscriptions & Revenue */}
        <TabsContent value="subscriptions" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="rounded-lg shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Subscription Status Distribution</CardTitle>
                <CardDescription>Live breakdown across all clinic subscription records</CardDescription>
              </CardHeader>
              <CardContent>
                {distMissing ? (
                  <EmptyState
                    icon={CreditCard}
                    title="Distribution couldn't be calculated"
                    description="Some subscription counts failed to load."
                  />
                ) : dist.every(d => !d.count) ? (
                  <EmptyState
                    icon={CreditCard}
                    title="No subscriptions yet"
                    description="Statuses appear once clinics enrol."
                  />
                ) : (
                  <ChartContainer
                    config={distConfig}
                    className="aspect-auto h-72 w-full"
                    role="img"
                    aria-label={`Subscription status: ${dist.map(d => `${d.status} ${d.count}`).join(", ")}`}
                  >
                    <BarChart data={dist} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="status" width={110} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent hideLabel={false} />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={4} isAnimationActive={false} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-lg shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Subscription Health & Retention</CardTitle>
                <CardDescription>Key health indicators from active payment mandates</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Estimated Monthly Recurring Revenue</p>
                      <p className="text-xs text-muted-foreground">Derived from active paid subscriptions</p>
                    </div>
                    <span className="text-2xl font-bold tabular-nums text-primary">
                      {data.estimatedMrr !== null && data.estimatedMrr !== undefined
                        ? `₹${data.estimatedMrr.toLocaleString("en-IN")}`
                        : "—"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-md bg-muted/30 p-3">
                    <p className="text-muted-foreground">Active Paid Plans</p>
                    <p className="mt-1 text-lg font-semibold">{data.activePaid ?? "—"}</p>
                  </div>
                  <div className="rounded-md bg-muted/30 p-3">
                    <p className="text-muted-foreground">Active Trials</p>
                    <p className="mt-1 text-lg font-semibold">{data.runningTrials ?? "—"}</p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Mandate status and renewals are synchronized via signed Razorpay webhooks.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 3: AI Utilization */}
        <TabsContent value="ai" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            <Card className="rounded-lg shadow-none">
              <CardHeader>
                <CardTitle className="text-base">AI Credit Consumption Velocity</CardTitle>
                <CardDescription>Platform-wide AI credits consumed over the last {rangeLabel[range]}</CardDescription>
              </CardHeader>
              <CardContent>
                {aiTrendEmpty ? (
                  <EmptyState
                    icon={Sparkles}
                    title="No AI usage recorded yet"
                    description="AI credits will appear as clinics use clinical notes, patient intake, or assistant features."
                  />
                ) : (
                  <ChartContainer config={aiTrendConfig} className="aspect-auto h-72 w-full">
                    <BarChart data={aiTrend} margin={{ left: -16, right: 8 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="credits" fill="var(--color-credits)" radius={4} isAnimationActive={false} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-lg shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Feature Breakdown</CardTitle>
                <CardDescription>AI credits grouped by clinical capability</CardDescription>
              </CardHeader>
              <CardContent>
                {aiFeatures.length === 0 ? (
                  <EmptyState
                    icon={Sparkles}
                    title="No feature activity"
                    description="Usage by feature will populate as interactions complete."
                    className="min-h-48"
                  />
                ) : (
                  <ul className="space-y-3">
                    {aiFeatures.map(feat => (
                      <li key={feat.feature} className="flex items-center justify-between text-xs">
                        <span className="font-medium">{feat.feature}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {feat.credits.toLocaleString("en-IN")} credits
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Future Visualization in AI */}
          <div className="mt-6">
            <FutureAnalyticsCard definition={aiVelocityDef} />
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
