import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ListOrdered,
  Users,
  Receipt,
  UserCheck,
  CalendarPlus,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageTitle } from "@/components/careflow/page-title";
import { StatisticsCard } from "@/components/careflow/statistics-card";
import { StatusBadge, EmptyState, LoadingState } from "@/components/careflow/feedback";
import {
  appointmentsQuery,
  queueEntriesQuery,
  clinicHoursQuery,
} from "@/lib/appointment-queries";
import { clinicInvoicesQuery } from "@/lib/clinical-queries";
import {
  appointmentStatusLabel,
  formatQueueNumber,
  formatTime12h,
  getClinicLocalDate,
  type AppointmentStatus,
} from "@/lib/appointments";

interface ReceptionistDashboardViewProps {
  userId: string;
  clinicId: string;
}

export function ReceptionistDashboardView({ userId, clinicId }: ReceptionistDashboardViewProps) {
  // Clinic metadata for timezone & operating hours
  const { data: clinicHoursData } = useQuery(clinicHoursQuery(userId, clinicId));
  const timeZone = clinicHoursData?.timezone || "Asia/Kolkata";
  const todayStr = getClinicLocalDate(new Date(), timeZone);

  // Today's appointments
  const { data: appointmentsData, isLoading: loadingAppointments } = useQuery(
    appointmentsQuery(userId, clinicId, {
      date: todayStr,
      doctor_id: "",
      status: "ALL",
      search: "",
      page: 0,
    })
  );

  // Today's queue
  const { data: queueData, isLoading: loadingQueue } = useQuery(
    queueEntriesQuery(userId, clinicId, todayStr)
  );

  // Clinic invoices / billing status
  const { data: invoicesData, isLoading: loadingInvoices } = useQuery(
    clinicInvoicesQuery(clinicId)
  );

  // Derived statistics
  const appointments = appointmentsData?.rows ?? [];
  const totalAppointmentsToday = appointmentsData?.count ?? appointments.length;
  const checkedInCount = appointments.filter(
    (a) => a.status === "CHECKED_IN"
  ).length;
  const completedApptsCount = appointments.filter((a) => a.status === "COMPLETED").length;

  const queueEntries = queueData ?? [];
  const waitingCount = queueEntries.filter((q) => q.status === "WAITING").length;
  const inConsultCount = queueEntries.filter((q) => q.status === "IN_CONSULTATION").length;
  const calledCount = queueEntries.filter((q) => q.status === "CALLED").length;

  const invoices = invoicesData ?? [];
  const pendingInvoices = invoices.filter((i) => i.status === "ISSUED");
  const pendingCollectionAmount = pendingInvoices.reduce(
    (acc, inv) => acc + (Number(inv.amount_due) || 0),
    0
  );

  return (
    <div className="space-y-8">
      {/* Page Title & Actions */}
      <PageTitle
        title="Front-desk overview"
        description="Patient check-in, live queue management, daily appointments, and payment collection."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <Link to="/clinic/appointments/new">
                <CalendarPlus className="mr-2 size-4" /> Book appointment
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/staff/queue">
                <ListOrdered className="mr-2 size-4" /> Open queue
              </Link>
            </Button>
          </div>
        }
      />

      {/* Overview Statistics Cards */}
      <section aria-label="Front-desk statistics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatisticsCard
          label="Today's appointments"
          value={loadingAppointments ? null : totalAppointmentsToday}
          detail={
            totalAppointmentsToday > 0
              ? `${checkedInCount} checked in · ${completedApptsCount} completed`
              : "No appointments today"
          }
          icon={CalendarDays}
        />
        <StatisticsCard
          label="Waiting in queue"
          value={loadingQueue ? null : waitingCount}
          detail={
            calledCount > 0 || inConsultCount > 0
              ? `${calledCount} called · ${inConsultCount} in consultation`
              : "Waiting room status"
          }
          icon={ListOrdered}
        />
        <StatisticsCard
          label="Checked-in patients"
          value={loadingAppointments ? null : checkedInCount}
          detail="Patients arrived at clinic"
          icon={UserCheck}
        />
        <StatisticsCard
          label="Pending payments"
          value={loadingInvoices ? null : pendingInvoices.length}
          detail={`₹${pendingCollectionAmount.toLocaleString("en-IN")} pending collection`}
          icon={Receipt}
        />
      </section>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
        {/* Left Column: Today's Appointments & Front-Desk Actions */}
        <div className="space-y-6 xl:col-span-2">
          {/* Today's Schedule Card */}
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Today's appointments</CardTitle>
                <CardDescription className="text-xs">
                  {todayStr} ({timeZone})
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
                <Link to="/staff/appointments">
                  Manage all <ArrowUpRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {loadingAppointments ? (
                <LoadingState label="Loading appointments…" />
              ) : appointments.length === 0 ? (
                <EmptyState
                  title="No appointments scheduled today"
                  description="No patient visits are booked for today yet."
                  icon={CalendarDays}
                  action={
                    <Button asChild size="sm" variant="outline">
                      <Link to="/clinic/appointments/new">
                        <CalendarPlus className="mr-2 size-4" /> Book appointment
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <div className="divide-y divide-border overflow-hidden rounded-md border text-sm">
                  {appointments.slice(0, 5).map((appt) => {
                    const timeLabel = appt.scheduled_start
                      ? formatTime12h(appt.scheduled_start.slice(11, 16))
                      : "—";
                    const patientName = appt.patient
                      ? `${appt.patient.first_name} ${appt.patient.last_name ?? ""}`.trim()
                      : "Patient";
                    const doctorName = appt.doctor?.display_name || "Doctor";

                    return (
                      <div
                        key={appt.id}
                        className="flex flex-wrap items-center justify-between gap-3 p-3.5 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground font-mono text-xs">
                            <Clock className="size-4" />
                          </span>
                          <div>
                            <p className="font-medium text-foreground">{patientName}</p>
                            <p className="text-xs text-muted-foreground">
                              {timeLabel} · Dr. {doctorName}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge
                            tone={
                              appt.status === "COMPLETED"
                                ? "success"
                                : appt.status === "CHECKED_IN"
                                  ? "info"
                                  : appt.status === "CANCELLED"
                                    ? "danger"
                                    : "neutral"
                            }
                          >
                            {appointmentStatusLabel[appt.status as AppointmentStatus] || appt.status}
                          </StatusBadge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Front Desk Shortcuts */}
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Front-desk workflows</CardTitle>
              <CardDescription className="text-xs">
                Essential receptionist tools for reception and front-office.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button
                  asChild
                  variant="outline"
                  className="h-auto justify-start gap-3 p-4 text-left shadow-none transition-colors hover:border-primary/40"
                >
                  <Link to="/staff/appointments">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <UserCheck className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">Patient check-in</p>
                      <p className="text-xs text-muted-foreground">Check in arriving patients</p>
                    </div>
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  className="h-auto justify-start gap-3 p-4 text-left shadow-none transition-colors hover:border-primary/40"
                >
                  <Link to="/staff/queue">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <ListOrdered className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">Manage queue</p>
                      <p className="text-xs text-muted-foreground">Assign &amp; call tokens</p>
                    </div>
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  className="h-auto justify-start gap-3 p-4 text-left shadow-none transition-colors hover:border-primary/40"
                >
                  <Link to="/staff/billing">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Receipt className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">Collect payments</p>
                      <p className="text-xs text-muted-foreground">Process invoices &amp; cash/UPI</p>
                    </div>
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  className="h-auto justify-start gap-3 p-4 text-left shadow-none transition-colors hover:border-primary/40"
                >
                  <Link to="/staff/patients">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Users className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">Patient directory</p>
                      <p className="text-xs text-muted-foreground">Lookup patient records</p>
                    </div>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Live Queue & Pending Collections */}
        <div className="space-y-6 xl:col-span-1">
          {/* Live Queue Overview Card */}
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Live queue</CardTitle>
                <CardDescription className="text-xs">
                  {queueEntries.length} patient{queueEntries.length === 1 ? "" : "s"} today
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
                <Link to="/staff/queue">
                  View <ArrowUpRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md border bg-muted/40 p-2">
                  <span className="text-muted-foreground">Waiting</span>
                  <p className="text-base font-semibold text-foreground">{waitingCount}</p>
                </div>
                <div className="rounded-md border bg-muted/40 p-2">
                  <span className="text-muted-foreground">Called</span>
                  <p className="text-base font-semibold text-foreground">{calledCount}</p>
                </div>
                <div className="rounded-md border bg-muted/40 p-2">
                  <span className="text-muted-foreground">Done</span>
                  <p className="text-base font-semibold text-foreground">
                    {queueEntries.filter((q) => q.status === "COMPLETED").length}
                  </p>
                </div>
              </div>

              {loadingQueue ? (
                <LoadingState label="Loading queue entries…" />
              ) : queueEntries.length === 0 ? (
                <EmptyState
                  title="Queue is empty"
                  description="Patients who check in today will appear in this live queue."
                  icon={ListOrdered}
                  className="min-h-32 py-3"
                />
              ) : (
                <div className="space-y-2">
                  {queueEntries.slice(0, 4).map((entry) => {
                    const patientName = entry.patient
                      ? `${entry.patient.first_name} ${entry.patient.last_name ?? ""}`.trim()
                      : "Patient";

                    return (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between rounded-md border p-2.5 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono font-semibold text-primary">
                            {formatQueueNumber(entry.queue_number)}
                          </span>
                          <span className="font-medium text-foreground">{patientName}</span>
                        </div>
                        <StatusBadge
                          tone={
                            entry.status === "IN_CONSULTATION"
                              ? "success"
                              : entry.status === "CALLED"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {entry.status.replace(/_/g, " ")}
                        </StatusBadge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Collections / Invoices */}
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Pending payments</CardTitle>
                <CardDescription className="text-xs">
                  Uncollected patient invoices
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
                <Link to="/staff/billing">
                  Collect <ArrowUpRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {loadingInvoices ? (
                <LoadingState label="Loading invoices…" />
              ) : pendingInvoices.length === 0 ? (
                <EmptyState
                  title="No pending payments"
                  description="All issued invoices for this clinic are paid."
                  icon={CheckCircle2}
                  className="min-h-32 py-3"
                />
              ) : (
                <div className="space-y-2">
                  {pendingInvoices.slice(0, 4).map((inv) => {
                    const patientName = inv.patient
                      ? `${inv.patient.first_name} ${inv.patient.last_name ?? ""}`.trim()
                      : "Patient";

                    return (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between rounded-md border p-2.5 text-xs"
                      >
                        <div>
                          <p className="font-medium text-foreground">{patientName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {inv.invoice_number} · Due: ₹{Number(inv.amount_due).toLocaleString("en-IN")}
                          </p>
                        </div>
                        <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                          <Link to="/staff/billing">Collect</Link>
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
