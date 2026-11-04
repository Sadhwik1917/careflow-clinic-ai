import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  Clock,
  Building2,
  Stethoscope,
  Phone,
  FileText,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Pill,
  User,
  CalendarClock,
  CalendarPlus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge, EmptyState, LoadingState } from "@/components/careflow/feedback";
import { patientAppointmentsQuery } from "@/lib/clinical-queries";
import { PatientAppointmentBookingDialog } from "./patient-appointment-booking-dialog";
import {
  appointmentStatusLabel,
  appointmentTypeLabel,
  formatSlotLabel12h,
  formatTime12h,
  getClinicLocalDate,
  getAppointmentRescheduleInfo,
  type AppointmentStatus,
} from "@/lib/appointments";
import type { PatientAppointmentWithDetails } from "@/lib/clinical";

interface PatientAppointmentsViewProps {
  userId?: string | undefined;
  clinicId?: string | undefined;
}

export function PatientAppointmentsView({ userId, clinicId }: PatientAppointmentsViewProps) {
  const { data: appointments = [], isLoading, isError } = useQuery({
    ...patientAppointmentsQuery(clinicId),
  });

  const [activeTab, setActiveTab] = React.useState<"upcoming" | "past">("upcoming");
  const [isBookingOpen, setIsBookingOpen] = React.useState<boolean>(false);

  const upcomingAppointments = React.useMemo(() => {
    return appointments.filter(
      (a) =>
        a.status === "SCHEDULED" ||
        a.status === "CONFIRMED" ||
        a.status === "CHECKED_IN" ||
        a.status === "IN_QUEUE" ||
        a.status === "IN_PROGRESS"
    );
  }, [appointments]);

  const pastAppointments = React.useMemo(() => {
    return appointments.filter(
      (a) =>
        a.status === "COMPLETED" ||
        a.status === "CANCELLED" ||
        a.status === "NO_SHOW"
    );
  }, [appointments]);

  const displayedAppointments = activeTab === "upcoming" ? upcomingAppointments : pastAppointments;

  const getStatusTone = (status: string) => {
    switch (status) {
      case "CONFIRMED":
      case "SCHEDULED":
        return "info";
      case "CHECKED_IN":
      case "IN_QUEUE":
        return "warning";
      case "IN_PROGRESS":
      case "COMPLETED":
        return "success";
      case "CANCELLED":
        return "neutral";
      case "NO_SHOW":
        return "danger";
      default:
        return "neutral";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            My Appointments
          </h2>
          <p className="text-xs text-muted-foreground">
            View your upcoming clinic consultations, confirmed appointments, and past visit history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            size="sm"
            onClick={() => setIsBookingOpen(true)}
            className="gap-1.5"
          >
            <CalendarPlus className="size-4" />
            Book Appointment
          </Button>

          {/* Tab Toggle */}
          <div className="flex items-center rounded-lg border bg-muted p-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("upcoming")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all ${
                activeTab === "upcoming"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clock className="size-3.5" />
              Upcoming ({upcomingAppointments.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("past")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all ${
                activeTab === "past"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CheckCircle2 className="size-3.5" />
              Past Visits ({pastAppointments.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {isLoading ? (
        <LoadingState label="Loading your appointments..." />
      ) : isError ? (
        <EmptyState
          title="Could not load appointments"
          description="We encountered an issue fetching your appointment history. Please refresh the page."
        />
      ) : displayedAppointments.length === 0 ? (
        <EmptyState
          title={activeTab === "upcoming" ? "No upcoming appointments" : "No past appointments found"}
          description={
            activeTab === "upcoming"
              ? "You do not have any scheduled consultations. Choose an available clinic doctor and time slot to book your appointment."
              : "Completed, cancelled, or past consultation records will appear here."
          }
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              {activeTab === "upcoming" && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIsBookingOpen(true)}
                  className="gap-1.5"
                >
                  <CalendarPlus className="size-4" />
                  Book an Appointment
                </Button>
              )}
              <Button asChild variant="outline" size="sm">
                <Link to="/patient/dashboard">Return to Dashboard</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayedAppointments.map((appt) => {
            const startDate = new Date(appt.scheduled_start);
            const dateStr = startDate.toLocaleDateString([], {
              weekday: "short",
              year: "numeric",
              month: "short",
              day: "numeric",
            });
            const timeStr = formatSlotLabel12h(appt.scheduled_start, appt.scheduled_end);
            const rescheduleInfo = getAppointmentRescheduleInfo(appt.notes);

            return (
              <Card key={appt.id} className="overflow-hidden border shadow-sm">
                <CardHeader className="bg-muted/20 border-b pb-3 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-base text-foreground flex items-center gap-1.5">
                          <Stethoscope className="h-4 w-4 text-primary" />
                          Dr. {appt.doctor?.display_name || "Doctor"}
                        </span>
                        {appt.doctor?.specialization && (
                          <Badge variant="outline" className="text-[10px]">
                            {appt.doctor.specialization}
                          </Badge>
                        )}
                      </div>
                      {appt.clinic?.name && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Building2 className="size-3.5 text-muted-foreground/70" />
                          <span>{appt.clinic.name}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge tone={getStatusTone(appt.status)}>
                        {appointmentStatusLabel[appt.status as AppointmentStatus] ?? appt.status}
                      </StatusBadge>
                      {rescheduleInfo.isRescheduled && (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-medium border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        >
                          Rescheduled
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-3 text-xs">
                  {/* Date & Time */}
                  <div className="flex items-center justify-between rounded-md bg-muted/40 p-2.5">
                    <div className="flex items-center gap-2 text-foreground font-medium">
                      <CalendarDays className="size-4 text-primary" />
                      <span>{dateStr}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
                      <Clock className="size-3.5" />
                      <span>{timeStr}</span>
                    </div>
                  </div>

                  {/* Reschedule audit history */}
                  {rescheduleInfo.isRescheduled && (
                    <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 p-2.5 text-amber-800 dark:text-amber-300">
                      <CalendarClock className="size-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                      <div className="space-y-0.5">
                        <div className="font-medium">
                          Originally scheduled: <span>{rescheduleInfo.originalSchedule}</span>
                        </div>
                        {rescheduleInfo.reason && (
                          <div className="text-[11px] text-muted-foreground italic">
                            Reason: {rescheduleInfo.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Visit Details */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Appointment Type:</span>
                      <span className="font-medium text-foreground">
                        {appointmentTypeLabel[appt.appointment_type as keyof typeof appointmentTypeLabel] ??
                          appt.appointment_type}
                      </span>
                    </div>
                    {appt.reason && (
                      <div className="flex items-start justify-between gap-2 text-muted-foreground">
                        <span className="shrink-0">Reason:</span>
                        <span className="text-right text-foreground font-medium line-clamp-2">
                          {appt.reason}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Clinic Address & Phone */}
                  {(appt.clinic?.address || appt.clinic?.phone) && (
                    <div className="border-t pt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      {appt.clinic?.address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" />
                          {appt.clinic.address}
                        </span>
                      )}
                      {appt.clinic?.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="size-3" />
                          {appt.clinic.phone}
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Patient Appointment Booking Dialog */}
      <PatientAppointmentBookingDialog
        open={isBookingOpen}
        onOpenChange={setIsBookingOpen}
        userId={userId ?? ""}
        clinicId={clinicId}
        onSuccess={() => {
          setActiveTab("upcoming");
        }}
      />
    </div>
  );
}

