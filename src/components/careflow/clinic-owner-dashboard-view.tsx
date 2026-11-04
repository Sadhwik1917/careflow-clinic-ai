import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ListOrdered,
  Users,
  Receipt,
  UserPlus,
  CalendarPlus,
  ArrowUpRight,
  Stethoscope,
  ShieldCheck,
  CreditCard,
  Building2,
  Clock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageTitle } from "@/components/careflow/page-title";
import { StatisticsCard } from "@/components/careflow/statistics-card";
import { StatusBadge, EmptyState, LoadingState } from "@/components/careflow/feedback";
import { InviteMemberDialog } from "@/components/careflow/invite-member-dialog";
import { toast } from "@/lib/toast";
import {
  appointmentsQuery,
  queueEntriesQuery,
  clinicHoursQuery,
} from "@/lib/appointment-queries";
import { doctorsQuery, staffQuery } from "@/lib/team-queries";
import { patientsQuery } from "@/lib/patient-queries";
import { clinicInvoicesQuery } from "@/lib/clinical-queries";
import { planStateQuery } from "@/lib/plan-state";
import {
  appointmentStatusLabel,
  formatQueueNumber,
  formatTime12h,
  getClinicLocalDate,
  getAppointmentRescheduleInfo,
  type AppointmentStatus,
} from "@/lib/appointments";

interface ClinicOwnerDashboardViewProps {
  userId: string;
  clinicId: string;
}

export function ClinicOwnerDashboardView({ userId, clinicId }: ClinicOwnerDashboardViewProps) {
  // Gmail integration callback feedback
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("gmail_connected");
    const error = params.get("gmail_error");
    if (connected === "success") {
      toast.success({
        title: "Gmail connected",
        description: "Your clinic Gmail account has been authorized to send team invitations.",
      });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error) {
      toast.error({
        title: "Gmail authorization failed",
        description: decodeURIComponent(error),
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

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

  // Team counts
  const { data: doctorsData } = useQuery(
    doctorsQuery(userId, clinicId, { status: "ACTIVE", page: 0, search: "" })
  );
  const { data: staffData } = useQuery(
    staffQuery(userId, clinicId, { status: "ACTIVE", page: 0, search: "" })
  );

  // Total patients
  const { data: patientsData } = useQuery(
    patientsQuery(userId, clinicId, { page: 0, search: "" })
  );

  // Billing / Invoices summary
  const { data: invoicesData } = useQuery(clinicInvoicesQuery(clinicId));

  // Plan state
  const { data: planData } = useQuery(planStateQuery(clinicId));

  // Derived statistics
  const appointments = appointmentsData?.rows ?? [];
  const totalAppointmentsToday = appointmentsData?.count ?? appointments.length;
  const confirmedCount = appointments.filter(
    (a) => a.status === "CONFIRMED" || a.status === "CHECKED_IN"
  ).length;
  const completedApptsCount = appointments.filter((a) => a.status === "COMPLETED").length;

  const queueEntries = queueData ?? [];
  const waitingQueueCount = queueEntries.filter((q) => q.status === "WAITING").length;
  const inConsultCount = queueEntries.filter((q) => q.status === "IN_CONSULTATION").length;
  const calledCount = queueEntries.filter((q) => q.status === "CALLED").length;

  const totalPatientsCount = patientsData?.count ?? 0;
  const activeDoctorsCount = doctorsData?.count ?? doctorsData?.rows?.length ?? 0;
  const activeStaffCount = staffData?.count ?? staffData?.rows?.length ?? 0;

  const invoices = invoicesData ?? [];
  const totalInvoiced = invoices.reduce((acc, inv) => acc + (Number(inv.total_amount) || 0), 0);
  const totalCollected = invoices.reduce((acc, inv) => acc + (Number(inv.amount_paid) || 0), 0);
  const totalDue = invoices.reduce((acc, inv) => acc + (Number(inv.amount_due) || 0), 0);

  // Plan status badge tone and text
  const currentPlan = planData?.current;
  const isTrial = currentPlan?.type === "TRIAL";
  const planBadgeTone = isTrial ? "warning" : currentPlan ? "success" : "neutral";
  const planBadgeLabel = isTrial
    ? "Free Trial Active"
    : currentPlan
      ? "Active Plan"
      : "Verified Clinic";

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <PageTitle
        title="Clinic overview"
        description="Comprehensive operational snapshot of today's schedule, live queue, team, and billing."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={planBadgeTone}>{planBadgeLabel}</StatusBadge>
            <InviteMemberDialog userId={userId} clinicId={clinicId} />
          </div>
        }
      />

      {/* Team Growth Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card/60 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Clinic team</p>
            <p className="text-xs text-muted-foreground">
              {activeDoctorsCount} doctor{activeDoctorsCount === 1 ? "" : "s"} and {activeStaffCount} staff member{activeStaffCount === 1 ? "" : "s"} currently active.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/clinic/reports">Attendance &amp; Analytics</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/clinic/doctors" search={{ search: "", status: "ALL", page: 0 }}>View doctors</Link>
          </Button>
          <InviteMemberDialog userId={userId} clinicId={clinicId} />
        </div>
      </div>

      {/* High-level Operational Metric Cards */}
      <section aria-label="Overview statistics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatisticsCard
          label="Today's appointments"
          value={loadingAppointments ? null : totalAppointmentsToday}
          detail={
            totalAppointmentsToday > 0
              ? `${confirmedCount} confirmed · ${completedApptsCount} completed`
              : "No appointments scheduled today"
          }
          icon={CalendarDays}
        />
        <StatisticsCard
          label="Waiting in queue"
          value={loadingQueue ? null : waitingQueueCount}
          detail={
            inConsultCount > 0 || calledCount > 0
              ? `${inConsultCount} in consultation · ${calledCount} called`
              : "Ready for patient arrivals"
          }
          icon={ListOrdered}
        />
        <StatisticsCard
          label="Registered patients"
          value={totalPatientsCount}
          detail="Total registered patient files"
          icon={Users}
        />
        <StatisticsCard
          label="Total billed"
          value={`₹${totalInvoiced.toLocaleString("en-IN")}`}
          detail={`₹${totalCollected.toLocaleString("en-IN")} collected · ₹${totalDue.toLocaleString("en-IN")} due`}
          icon={Receipt}
        />
      </section>

      {/* Main Operational Split Layout */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
        {/* Left Column: Appointments & Quick Actions */}
        <div className="space-y-6 xl:col-span-2">
          {/* Today's Appointments List Card */}
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Today's appointments</CardTitle>
                <CardDescription className="text-xs">
                  {todayStr} ({timeZone})
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
                <Link to="/clinic/appointments">
                  View all <ArrowUpRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {loadingAppointments ? (
                <LoadingState label="Loading today's appointments…" />
              ) : appointments.length === 0 ? (
                <EmptyState
                  title="No appointments scheduled today"
                  description="There are no patient appointments scheduled for today yet."
                  icon={CalendarDays}
                  action={
                    <Button asChild size="sm" variant="outline">
                      <Link to="/clinic/appointments/new">
                        <CalendarPlus className="mr-2 size-4" /> Schedule appointment
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
                          {getAppointmentRescheduleInfo(appt.notes).isRescheduled && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-medium border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            >
                              Rescheduled
                            </Badge>
                          )}
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

          {/* Quick Clinic Operations */}
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Quick operations</CardTitle>
              <CardDescription className="text-xs">
                Common front-desk and clinical workflows for your team.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button
                  asChild
                  variant="outline"
                  className="h-auto justify-start gap-3 p-4 text-left shadow-none transition-colors hover:border-primary/40"
                >
                  <Link to="/clinic/appointments/new">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <CalendarPlus className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">New appointment</p>
                      <p className="text-xs text-muted-foreground">Book and slot a patient</p>
                    </div>
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  className="h-auto justify-start gap-3 p-4 text-left shadow-none transition-colors hover:border-primary/40"
                >
                  <Link to="/clinic/patients/new">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <UserPlus className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">Register patient</p>
                      <p className="text-xs text-muted-foreground">Create medical record</p>
                    </div>
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  className="h-auto justify-start gap-3 p-4 text-left shadow-none transition-colors hover:border-primary/40"
                >
                  <Link to="/clinic/queue">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <ListOrdered className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">Live queue</p>
                      <p className="text-xs text-muted-foreground">Call &amp; track arrivals</p>
                    </div>
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  className="h-auto justify-start gap-3 p-4 text-left shadow-none transition-colors hover:border-primary/40"
                >
                  <Link to="/clinic/billing">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Receipt className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">Billing &amp; invoices</p>
                      <p className="text-xs text-muted-foreground">Collect clinic revenue</p>
                    </div>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Queue & Clinic Management */}
        <div className="space-y-6 xl:col-span-1">
          {/* Live Queue Overview Card */}
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Live queue</CardTitle>
                <CardDescription className="text-xs">
                  {queueEntries.length} patient{queueEntries.length === 1 ? "" : "s"} checked in today
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
                <Link to="/clinic/queue">
                  Open <ArrowUpRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border bg-muted/40 p-2">
                  <span className="text-xs text-muted-foreground">Waiting</span>
                  <p className="text-lg font-semibold text-foreground">{waitingQueueCount}</p>
                </div>
                <div className="rounded-md border bg-muted/40 p-2">
                  <span className="text-xs text-muted-foreground">Called</span>
                  <p className="text-lg font-semibold text-foreground">{calledCount}</p>
                </div>
                <div className="rounded-md border bg-muted/40 p-2">
                  <span className="text-xs text-muted-foreground">Consulting</span>
                  <p className="text-lg font-semibold text-foreground">{inConsultCount}</p>
                </div>
              </div>

              {loadingQueue ? (
                <LoadingState label="Loading queue entries…" />
              ) : queueEntries.length === 0 ? (
                <EmptyState
                  title="Queue is empty"
                  description="Patients who check in today will appear in this live queue."
                  icon={ListOrdered}
                  className="min-h-36 py-4"
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

          {/* Clinical Team Card */}
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Doctors</CardTitle>
                <CardDescription className="text-xs">
                  {activeDoctorsCount} registered doctor{activeDoctorsCount === 1 ? "" : "s"}
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
                <Link to="/clinic/doctors" search={{ search: "", status: "ALL", page: 0 }}>
                  Manage <ArrowUpRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {activeDoctorsCount === 0 ? (
                <EmptyState
                  title="No doctors added yet"
                  description="Invite licensed doctors to consult patients in this clinic."
                  icon={Stethoscope}
                  className="min-h-36 py-4"
                />
              ) : (
                <div className="space-y-2">
                  {(doctorsData?.rows ?? []).slice(0, 3).map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-md border p-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                          <Stethoscope className="size-3.5" />
                        </span>
                        <div>
                          <p className="font-medium text-foreground">
                            Dr. {doc.display_name || "Doctor"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{doc.specialization}</p>
                        </div>
                      </div>
                      <StatusBadge tone="success">Active</StatusBadge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Subscription & Verification Card */}
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Clinic plan &amp; status</CardTitle>
              <CardDescription className="text-xs">
                Subscription and regulatory verification status.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-md border p-2.5">
                <div className="flex items-center gap-2">
                  <CreditCard className="size-4 text-primary" />
                  <span className="font-medium">Subscription</span>
                </div>
                <StatusBadge tone={planBadgeTone}>{planBadgeLabel}</StatusBadge>
              </div>
              <div className="flex items-center justify-between rounded-md border p-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" />
                  <span className="font-medium">Verification</span>
                </div>
                <StatusBadge tone="success">Approved</StatusBadge>
              </div>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/clinic/plans">Manage plans &amp; billing</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
