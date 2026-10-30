import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ListOrdered,
  Stethoscope,
  Pill,
  Clock,
  ArrowUpRight,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  Play,
  UserCheck,
  User,
  Activity,
  CircleUserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageTitle } from "@/components/careflow/page-title";
import { StatisticsCard } from "@/components/careflow/statistics-card";
import { StatusBadge, EmptyState, LoadingState } from "@/components/careflow/feedback";
import {
  appointmentsQuery,
  queueEntriesQuery,
  clinicHoursQuery,
  myDoctorProfileQuery,
} from "@/lib/appointment-queries";
import { doctorPrescriptionsQuery } from "@/lib/clinical-queries";
import {
  appointmentStatusLabel,
  formatQueueNumber,
  formatTime12h,
  getClinicLocalDate,
  getAppointmentRescheduleInfo,
  type AppointmentStatus,
} from "@/lib/appointments";

interface DoctorDashboardViewProps {
  userId: string;
  clinicId: string;
}

export function DoctorDashboardView({ userId, clinicId }: DoctorDashboardViewProps) {
  // Clinic metadata for timezone & operating hours
  const { data: clinicHoursData } = useQuery(clinicHoursQuery(userId, clinicId));
  const timeZone = clinicHoursData?.timezone || "Asia/Kolkata";
  const todayStr = getClinicLocalDate(new Date(), timeZone);

  // Doctor's own profile in this clinic
  const { data: doctorProfile } = useQuery(myDoctorProfileQuery(clinicId));

  // Doctor's live queue (automatically scoped to caller doctor)
  const { data: queueData, isLoading: loadingQueue } = useQuery(
    queueEntriesQuery(userId, clinicId, todayStr)
  );

  // Doctor's assigned appointments for today
  const { data: appointmentsData, isLoading: loadingAppointments } = useQuery({
    ...appointmentsQuery(userId, clinicId, {
      date: todayStr,
      doctor_id: doctorProfile?.id ?? "",
      status: "ALL",
      search: "",
      page: 0,
    }),
    enabled: !!doctorProfile?.id,
  });

  // Doctor's recent prescriptions (automatically scoped to caller doctor)
  const { data: prescriptions = [], isLoading: loadingPrescriptions } = useQuery(
    doctorPrescriptionsQuery(clinicId, doctorProfile?.id)
  );

  // Derived queue metrics
  const queueEntries = queueData ?? [];
  const waitingEntries = queueEntries.filter((q) => q.status === "WAITING");
  const nextWaitingEntry = waitingEntries[0];
  const inConsultationEntry = queueEntries.find((q) => q.status === "IN_CONSULTATION");
  const calledEntry = queueEntries.find((q) => q.status === "CALLED");
  const activeSpotlightEntry = inConsultationEntry || calledEntry;
  const completedQueueCount = queueEntries.filter((q) => q.status === "COMPLETED").length;

  // Derived appointment metrics
  const appointments = appointmentsData?.rows ?? [];
  const totalAssignedToday = appointmentsData?.count ?? appointments.length;

  return (
    <div className="space-y-8">
      {/* Page Title & Actions */}
      <PageTitle
        title="Clinical overview"
        description="Your daily consultation schedule, live patient queue, and clinical work."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {doctorProfile && (
              <StatusBadge tone="info">
                {doctorProfile.specialization || "Physician"}
              </StatusBadge>
            )}
            <Button asChild size="sm">
              <Link to="/doctor/consultations">
                <ClipboardList className="mr-2 size-4" /> Go to consultations
              </Link>
            </Button>
          </div>
        }
      />

      {/* Active Consultation Spotlight */}
      {activeSpotlightEntry ? (
        <Card className="rounded-lg border-primary/40 bg-primary/5 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <span className="flex size-2.5 rounded-full bg-primary animate-pulse" />
              <CardTitle className="text-base font-semibold text-primary">
                {activeSpotlightEntry.status === "IN_CONSULTATION"
                  ? "Active consultation in progress"
                  : "Patient called to consultation room"}
              </CardTitle>
            </div>
            <StatusBadge tone={activeSpotlightEntry.status === "IN_CONSULTATION" ? "success" : "warning"}>
              {formatQueueNumber(activeSpotlightEntry.queue_number)}
            </StatusBadge>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="size-6" />
                </span>
                <div>
                  <p className="text-lg font-bold text-foreground">
                    {activeSpotlightEntry.patient
                      ? `${activeSpotlightEntry.patient.first_name} ${activeSpotlightEntry.patient.last_name ?? ""}`.trim()
                      : "Patient"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    File #{activeSpotlightEntry.patient?.patient_number || "—"} ·{" "}
                    {activeSpotlightEntry.patient?.gender || "Patient"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild size="sm">
                  <Link to="/doctor/consultations">
                    <ClipboardList className="mr-1.5 size-4" /> Open consultation
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : nextWaitingEntry ? (
        <Card className="rounded-lg border-dashed bg-muted/20 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
                <ListOrdered className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Next patient ready: {nextWaitingEntry.patient ? `${nextWaitingEntry.patient.first_name} ${nextWaitingEntry.patient.last_name ?? ""}`.trim() : "Patient"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Token {formatQueueNumber(nextWaitingEntry.queue_number)} is waiting in the clinic lobby.
                </p>
              </div>
            </div>
            <Button asChild size="sm">
              <Link to="/doctor/consultations">
                <Play className="mr-1.5 size-3.5 fill-current" /> Call next patient
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Clinical Overview Statistics Cards */}
      <section aria-label="Clinical statistics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatisticsCard
          label="Today's appointments"
          value={loadingAppointments ? null : totalAssignedToday}
          detail={`${completedQueueCount} completed consultations today`}
          icon={CalendarDays}
        />
        <StatisticsCard
          label="Patients waiting"
          value={loadingQueue ? null : waitingEntries.length}
          detail={waitingEntries.length > 0 ? "Patients in waiting room" : "No patients waiting"}
          icon={ListOrdered}
        />
        <StatisticsCard
          label="Active consultation"
          value={activeSpotlightEntry ? formatQueueNumber(activeSpotlightEntry.queue_number) : "Idle"}
          detail={activeSpotlightEntry ? "Currently in consultation room" : "Ready for next patient"}
          icon={Stethoscope}
        />
        <StatisticsCard
          label="Prescriptions written"
          value={loadingPrescriptions ? null : prescriptions.length}
          detail="Total finalized e-prescriptions"
          icon={Pill}
        />
      </section>

      {/* Main Grid: Schedule & Clinical Shortcuts */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
        {/* Left Column: Assigned Appointments Schedule */}
        <div className="space-y-6 xl:col-span-2">
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Today's assigned schedule</CardTitle>
                <CardDescription className="text-xs">
                  {todayStr} ({timeZone})
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
                <Link to="/doctor/appointments">
                  View all <ArrowUpRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {loadingAppointments ? (
                <LoadingState label="Loading assigned appointments…" />
              ) : appointments.length === 0 ? (
                <EmptyState
                  title="No appointments assigned today"
                  description="You have no patient appointments booked on your schedule for today."
                  icon={CalendarDays}
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
                              {timeLabel} · {appt.reason || "General Consultation"}
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

          {/* Quick Doctor Workflows */}
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Clinical workspace shortcuts</CardTitle>
              <CardDescription className="text-xs">
                Quick access to daily doctor workflows.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Button
                  asChild
                  variant="outline"
                  className="h-auto justify-start gap-3 p-4 text-left shadow-none transition-colors hover:border-primary/40"
                >
                  <Link to="/doctor/consultations">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <ClipboardList className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">Consultations</p>
                      <p className="text-xs text-muted-foreground">Queue &amp; clinical encounter</p>
                    </div>
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  className="h-auto justify-start gap-3 p-4 text-left shadow-none transition-colors hover:border-primary/40"
                >
                  <Link to="/doctor/appointments">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <CalendarDays className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">Appointments</p>
                      <p className="text-xs text-muted-foreground">Schedule &amp; slot booking</p>
                    </div>
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  className="h-auto justify-start gap-3 p-4 text-left shadow-none transition-colors hover:border-primary/40"
                >
                  <Link to="/doctor/prescriptions">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Pill className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">e-Prescriptions</p>
                      <p className="text-xs text-muted-foreground">Issued prescriptions</p>
                    </div>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Live Queue & Prescriptions */}
        <div className="space-y-6 xl:col-span-1">
          {/* Live Queue Breakdown Card */}
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Queue status</CardTitle>
                <CardDescription className="text-xs">
                  {queueEntries.length} patient{queueEntries.length === 1 ? "" : "s"} today
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
                <Link to="/doctor/consultations">
                  View <ArrowUpRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md border bg-muted/40 p-2">
                  <span className="text-muted-foreground">Waiting</span>
                  <p className="text-base font-semibold text-foreground">{waitingEntries.length}</p>
                </div>
                <div className="rounded-md border bg-muted/40 p-2">
                  <span className="text-muted-foreground">Active</span>
                  <p className="text-base font-semibold text-foreground">{activeSpotlightEntry ? 1 : 0}</p>
                </div>
                <div className="rounded-md border bg-muted/40 p-2">
                  <span className="text-muted-foreground">Done</span>
                  <p className="text-base font-semibold text-foreground">{completedQueueCount}</p>
                </div>
              </div>

              {loadingQueue ? (
                <LoadingState label="Loading queue…" />
              ) : waitingEntries.length === 0 ? (
                <EmptyState
                  title="No waiting patients"
                  description="When patients check in with reception, they will appear here."
                  icon={ListOrdered}
                  className="min-h-32 py-3"
                />
              ) : (
                <div className="space-y-2">
                  {waitingEntries.slice(0, 4).map((entry) => {
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
                        <StatusBadge tone="neutral">Waiting</StatusBadge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Prescriptions Card */}
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Recent prescriptions</CardTitle>
                <CardDescription className="text-xs">
                  Finalized e-prescriptions
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
                <Link to="/doctor/prescriptions">
                  All <ArrowUpRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {loadingPrescriptions ? (
                <LoadingState label="Loading prescriptions…" />
              ) : prescriptions.length === 0 ? (
                <EmptyState
                  title="No prescriptions yet"
                  description="Finalized prescriptions written during consultations will appear here."
                  icon={Pill}
                  className="min-h-32 py-3"
                />
              ) : (
                <div className="space-y-2">
                  {prescriptions.slice(0, 3).map((rx) => {
                    const patientName = rx.patient
                      ? `${rx.patient.first_name} ${rx.patient.last_name ?? ""}`.trim()
                      : "Patient";

                    return (
                      <div
                        key={rx.id}
                        className="flex items-center justify-between rounded-md border p-2.5 text-xs"
                      >
                        <div>
                          <p className="font-medium text-foreground">{patientName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {rx.prescription_date} · {rx.items?.length || 0} med{(rx.items?.length || 0) === 1 ? "" : "s"}
                          </p>
                        </div>
                        <StatusBadge tone="success">Finalized</StatusBadge>
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
