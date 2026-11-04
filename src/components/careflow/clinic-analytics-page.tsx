import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Receipt,
  Users,
  Stethoscope,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  LineChart as TrendIcon,
  Clock,
  CheckCircle2,
  XCircle,
  CreditCard,
  Building2,
  CalendarCheck,
  RefreshCw,
} from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { PageTitle } from "./page-title";
import { StatisticsCard } from "./statistics-card";
import { LiquidGauge } from "./liquid-gauge";
import { MotionReveal } from "./motion-primitives";
import { FutureAnalyticsCard } from "./future-analytics-card";
import { AttendanceAnalyticsView } from "./attendance-analytics-view";
import { EmptyState, LoadingState, ErrorState } from "./feedback";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { clinicAnalyticsQuery } from "@/lib/clinic-analytics";
import {
  CLINIC_ANALYTICS_RANGES,
  clinicRangeLabel,
  CLINIC_FUTURE_VISUALIZATIONS,
  type ClinicAnalyticsRange,
} from "@/lib/clinic-analytics-rules";
import { doctorsQuery } from "@/lib/team-queries";

const apptChartConfig = {
  count: { label: "Total Booked", color: "var(--chart-2)" },
  completed: { label: "Completed", color: "var(--chart-3)" },
} satisfies ChartConfig;

const revenueChartConfig = {
  billed: { label: "Billed", color: "var(--chart-1)" },
  collected: { label: "Collected", color: "var(--chart-2)" },
} satisfies ChartConfig;

const statusChartConfig = {
  count: { label: "Appointments", color: "var(--chart-2)" },
} satisfies ChartConfig;

const patientTrendConfig = {
  newPatients: { label: "New Patients", color: "var(--chart-3)" },
} satisfies ChartConfig;

interface ClinicAnalyticsPageProps {
  userId: string;
  clinicId: string;
}

export function ClinicAnalyticsPage({ userId, clinicId }: ClinicAnalyticsPageProps) {
  const [range, setRange] = React.useState<ClinicAnalyticsRange>("30d");
  const [selectedDoctorId, setSelectedDoctorId] = React.useState<string>("");

  // Doctors for filter dropdown
  const { data: doctorsData } = useQuery(
    doctorsQuery(userId, clinicId, { status: "ACTIVE", page: 0, search: "" })
  );
  const activeDoctors = doctorsData?.rows ?? [];

  // Main analytics query
  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery(clinicAnalyticsQuery(clinicId, range, selectedDoctorId));

  if (isLoading) {
    return (
      <div className="p-8">
        <LoadingState label="Loading clinic analytics & operational metrics…" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8">
        <ErrorState
          title="Couldn't load clinic analytics"
          description="Verify your clinic owner access and connectivity, then try again."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const { appointments, financials, patients, clinical, aiUsage, operationalAlerts, currency } = data;

  // Comparison helper badge
  const renderComparison = (pct: number | null, direction: string) => {
    if (pct === null || direction === "none") return null;
    const isUp = direction === "increase";
    const isDown = direction === "decrease";
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-xs font-medium ${
          isUp ? "text-emerald-600 dark:text-emerald-400" : isDown ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
        }`}
      >
        {isUp ? <TrendingUp className="size-3" /> : isDown ? <TrendingDown className="size-3" /> : null}
        {Math.abs(pct)}% vs prior period
      </span>
    );
  };

  const noshowDef =
    data.futureVisualizations?.find(v => v.id === "noshow-risk-predictor") ??
    CLINIC_FUTURE_VISUALIZATIONS[0]!;
  const capacityDef =
    data.futureVisualizations?.find(v => v.id === "capacity-utilization-forecast") ??
    CLINIC_FUTURE_VISUALIZATIONS[1]!;
  const cashInflowDef =
    data.futureVisualizations?.find(v => v.id === "cash-inflow-forecast") ??
    CLINIC_FUTURE_VISUALIZATIONS[2]!;

  return (
    <div className="space-y-6">
      {/* Header with Title and Global Dimension Filters */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <PageTitle
            title="Clinic Analytics"
            description={`Comprehensive operations, appointments, revenue, and clinical performance for ${data.clinicName}.`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Doctor Dimension Filter */}
          <div className="w-48">
            <Select
              value={selectedDoctorId || "ALL"}
              onValueChange={val => setSelectedDoctorId(val === "ALL" ? "" : val)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All Doctors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-xs">
                  All Doctors
                </SelectItem>
                {activeDoctors.map((doc: { id: string; display_name: string | null }) => (
                  <SelectItem key={doc.id} value={doc.id} className="text-xs">
                    Dr. {doc.display_name ?? "Doctor"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time Range Selector */}
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={range}
            aria-label="Analytics range"
            onValueChange={v => v && setRange(v as ClinicAnalyticsRange)}
          >
            {CLINIC_ANALYTICS_RANGES.map(r => (
              <ToggleGroupItem key={r} value={r} className="text-xs" aria-label={clinicRangeLabel[r]}>
                {r === "12m" ? "1Y" : r}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {/* Refresh Button */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Refresh data"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Top Executive KPI Row */}
      <MotionReveal>
        <section aria-label="Key Clinic Metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatisticsCard
            label="Total Appointments"
            value={appointments.total}
            detail={`${appointments.completionRate}% completed (${appointments.completed})`}
            icon={CalendarDays}
          />

          <StatisticsCard
            label="Revenue Collected"
            value={`${currency} ${financials.totalCollected.toLocaleString("en-IN")}`}
            detail={`${financials.collectionRate}% collected of ${currency} ${financials.totalBilled.toLocaleString("en-IN")} billed`}
            icon={Receipt}
          />

          <StatisticsCard
            label="Active Patients"
            value={patients.totalActive}
            detail={`${patients.newRegistrations} new registered in this period`}
            icon={Users}
          />

          <StatisticsCard
            label="Doctor Attendance"
            value={`${clinical.doctorAttendanceRate}%`}
            detail={`${clinical.doctorsPresentDays} days present vs ${clinical.doctorsAbsentDays} absent`}
            icon={Stethoscope}
          />
        </section>
      </MotionReveal>

      {/* Operational Alerts if any */}
      {operationalAlerts.length > 0 && (
        <div className="space-y-2">
          {operationalAlerts.map(alert => (
            <div
              key={alert.id}
              className={`flex items-start gap-3 rounded-lg border p-4 text-xs ${
                alert.type === "warning"
                  ? "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200"
                  : "border-blue-500/30 bg-blue-500/5 text-blue-900 dark:text-blue-200"
              }`}
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">{alert.title}</p>
                <p className="mt-0.5 text-muted-foreground">{alert.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Insight Tabs */}
      <Tabs defaultValue="appointments" className="space-y-6">
        <TabsList className="bg-muted/60 p-1">
          <TabsTrigger value="appointments" className="text-xs">
            Appointments & Flow
          </TabsTrigger>
          <TabsTrigger value="revenue" className="text-xs">
            Revenue & Billing
          </TabsTrigger>
          <TabsTrigger value="team" className="text-xs">
            Clinical & Team
          </TabsTrigger>
          <TabsTrigger value="growth" className="text-xs">
            Patient Growth & AI
          </TabsTrigger>
          <TabsTrigger value="attendance_log" className="text-xs">
            Daily Attendance Log
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Appointments & Flow */}
        <TabsContent value="appointments" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            {/* Appointment Trend Chart */}
            <Card className="rounded-lg shadow-none">
              <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">Appointment Volume & Completion</CardTitle>
                  <CardDescription>
                    Booked vs completed consultations over {clinicRangeLabel[range].toLowerCase()}
                  </CardDescription>
                </div>
                <div className="pt-1">
                  {renderComparison(appointments.comparison.changePercentage, appointments.comparison.direction)}
                </div>
              </CardHeader>
              <CardContent>
                {appointments.total === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="No appointments in this period"
                    description="Booked appointments will populate this trend curve."
                  />
                ) : (
                  <ChartContainer config={apptChartConfig} className="aspect-auto h-72 w-full">
                    <AreaChart data={appointments.trend} margin={{ left: -16, right: 8 }}>
                      <defs>
                        <linearGradient id="fill-count" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="fill-completed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-completed)" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="var(--color-completed)" stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Area
                        dataKey="count"
                        type="monotone"
                        stroke="var(--color-count)"
                        fill="url(#fill-count)"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Area
                        dataKey="completed"
                        type="monotone"
                        stroke="var(--color-completed)"
                        fill="url(#fill-completed)"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* Status Distribution */}
            <Card className="rounded-lg shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Status Breakdown</CardTitle>
                <CardDescription>Distribution of scheduled, completed, and missed slots</CardDescription>
              </CardHeader>
              <CardContent>
                {appointments.statusBreakdown.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="No status data"
                    description="Statuses appear once appointments are booked."
                  />
                ) : (
                  <ChartContainer config={statusChartConfig} className="aspect-auto h-72 w-full">
                    <BarChart
                      data={appointments.statusBreakdown}
                      layout="vertical"
                      margin={{ left: 8, right: 16 }}
                    >
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                      <YAxis
                        type="category"
                        dataKey="status"
                        width={90}
                        tickLine={false}
                        axisLine={false}
                        className="text-[11px]"
                      />
                      <ChartTooltip content={<ChartTooltipContent hideLabel={false} />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={4} isAnimationActive={false} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Future-Ready Visualization */}
          <div className="mt-6">
            <FutureAnalyticsCard definition={noshowDef} />
          </div>
        </TabsContent>

        {/* Tab 2: Revenue & Billing */}
        <TabsContent value="revenue" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            {/* Revenue Trend */}
            <Card className="rounded-lg shadow-none">
              <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">Revenue Inflow</CardTitle>
                  <CardDescription>
                    Total billed vs actual payments collected over {clinicRangeLabel[range].toLowerCase()}
                  </CardDescription>
                </div>
                <div className="pt-1">
                  {renderComparison(financials.comparisonCollected.changePercentage, financials.comparisonCollected.direction)}
                </div>
              </CardHeader>
              <CardContent>
                {financials.totalBilled === 0 && financials.totalCollected === 0 ? (
                  <EmptyState
                    icon={Receipt}
                    title="No billing activity in this period"
                    description="Invoices and settled payments will render your cash flow curve here."
                  />
                ) : (
                  <ChartContainer config={revenueChartConfig} className="aspect-auto h-72 w-full">
                    <AreaChart data={financials.trend} margin={{ left: -8, right: 8 }}>
                      <defs>
                        <linearGradient id="fill-billed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-billed)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="var(--color-billed)" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="fill-collected" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-collected)" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="var(--color-collected)" stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Area
                        dataKey="billed"
                        type="monotone"
                        stroke="var(--color-billed)"
                        fill="url(#fill-billed)"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Area
                        dataKey="collected"
                        type="monotone"
                        stroke="var(--color-collected)"
                        fill="url(#fill-collected)"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* Collection Health Gauge */}
            <Card className="rounded-lg shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Collection Efficiency</CardTitle>
                <CardDescription>Ratio of collected payments to total billed invoiced amount</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-6">
                  <div className="flex items-center gap-6">
                    <LiquidGauge
                      value={financials.collectionRate}
                      label="Collection efficiency rate"
                      size={100}
                    />
                    <div className="space-y-1 text-sm">
                      <p className="font-medium text-foreground">
                        {currency} {financials.totalCollected.toLocaleString("en-IN")} collected
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Out of {currency} {financials.totalBilled.toLocaleString("en-IN")} billed
                      </p>
                    </div>
                  </div>

                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Outstanding Balance (Receivables)</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
                      {currency} {financials.outstandingBalance.toLocaleString("en-IN")}
                    </p>
                  </div>

                  {financials.paymentMethodsBreakdown.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <p className="text-xs font-medium text-muted-foreground">Settlement Methods</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {financials.paymentMethodsBreakdown.map(p => (
                          <div key={p.method} className="rounded bg-muted/40 p-2">
                            <span className="font-medium">{p.method}</span>: {currency}{" "}
                            {p.amount.toLocaleString("en-IN")}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Future-Ready Visualization */}
          <div className="mt-6">
            <FutureAnalyticsCard definition={cashInflowDef} />
          </div>
        </TabsContent>

        {/* Tab 3: Clinical & Team */}
        <TabsContent value="team" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="rounded-lg shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Consultations & Clinical Flow</CardTitle>
                <CardDescription>Physician encounters and consultation record states</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-md bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Total Encounters</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{clinical.consultationsTotal}</p>
                  </div>
                  <div className="rounded-md bg-emerald-500/10 p-3 text-emerald-950 dark:text-emerald-200">
                    <p className="text-xs">Completed</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{clinical.consultationsCompleted}</p>
                  </div>
                  <div className="rounded-md bg-amber-500/10 p-3 text-amber-950 dark:text-amber-200">
                    <p className="text-xs">In Draft / Progress</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{clinical.consultationsDraft}</p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Consultation records maintain complete clinical immutability and atomic e-prescription link
                  enforcement once completed.
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-lg shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Physician & Staff Attendance</CardTitle>
                <CardDescription>Attendance compliance recorded across the team</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Doctor Attendance</span>
                      <Badge variant="outline" className="text-xs">
                        {clinical.doctorsCount} active
                      </Badge>
                    </div>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                      {clinical.doctorAttendanceRate}%
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {clinical.doctorsPresentDays} days present / {clinical.doctorsAbsentDays} absent
                    </p>
                  </div>

                  <div className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Staff Attendance</span>
                      <Badge variant="outline" className="text-xs">
                        {clinical.staffCount} active
                      </Badge>
                    </div>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                      {clinical.staffAttendanceRate}%
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Recorded presence</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Future-Ready Visualization */}
          <div className="mt-6">
            <FutureAnalyticsCard definition={capacityDef} />
          </div>
        </TabsContent>

        {/* Tab 4: Patient Growth & AI */}
        <TabsContent value="growth" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            {/* Patient Registration Trend */}
            <Card className="rounded-lg shadow-none">
              <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">New Patient Registrations</CardTitle>
                  <CardDescription>
                    Growth in registered patient profiles over {clinicRangeLabel[range].toLowerCase()}
                  </CardDescription>
                </div>
                <div className="pt-1">
                  {renderComparison(patients.comparisonNew.changePercentage, patients.comparisonNew.direction)}
                </div>
              </CardHeader>
              <CardContent>
                {patients.newRegistrations === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="No new patient registrations"
                    description="Registered patients will form your clinic's patient growth trend."
                  />
                ) : (
                  <ChartContainer config={patientTrendConfig} className="aspect-auto h-72 w-full">
                    <AreaChart data={patients.trend} margin={{ left: -16, right: 8 }}>
                      <defs>
                        <linearGradient id="fill-newPatients" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-newPatients)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="var(--color-newPatients)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area
                        dataKey="newPatients"
                        type="monotone"
                        stroke="var(--color-newPatients)"
                        fill="url(#fill-newPatients)"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* AI Usage */}
            <Card className="rounded-lg shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Clinic AI Credits Utilization</CardTitle>
                <CardDescription>Metered CAREFLOW AI credits used by this clinic</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Credits Used in Selected Period</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-bold tabular-nums text-primary">
                      {aiUsage.totalCredits.toLocaleString("en-IN")}
                    </span>
                    <span className="text-xs text-muted-foreground">credits</span>
                  </div>
                </div>

                {aiUsage.features.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No metered AI interactions in this range.</p>
                ) : (
                  <ul className="space-y-2 border-t pt-3">
                    {aiUsage.features.map(f => (
                      <li key={f.feature} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">{f.feature}</span>
                        <span className="tabular-nums text-muted-foreground">{f.credits} credits</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 5: Daily Attendance Log (preserves existing workflow) */}
        <TabsContent value="attendance_log" className="space-y-6">
          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Attendance Management & Daily Log</CardTitle>
              <CardDescription>
                Record presence, mark physician absences, and inspect daily check-in rosters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AttendanceAnalyticsView userId={userId} clinicId={clinicId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
