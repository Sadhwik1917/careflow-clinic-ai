import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Calendar as CalendarIcon,
  Clock,
  Search,
  Plus,
  UserCheck,
  CalendarClock,
  XCircle,
  Stethoscope,
  Filter,
  CheckCircle2,
  CalendarX2,
  AlertCircle,
  Loader2,
  DoorOpen,
  DoorClosed,
  AlertTriangle,
  Activity,
} from "lucide-react";
import { VitalsDialog } from "./vitals-dialog";
import { AppointmentForm } from "./appointment-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge, EmptyState, LoadingState } from "@/components/careflow/feedback";
import { PageTitle } from "@/components/careflow/page-title";
import { DatePicker } from "@/components/careflow/date-picker";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import {
  appointmentsQuery,
  doctorAvailabilityQuery,
  clinicHoursQuery,
  affectedAppointmentsQuery,
  clinicQueueDoctorsQuery,
} from "@/lib/appointment-queries";
import {
  checkInClinicPatient,
  rescheduleClinicAppointment,
  cancelClinicAppointment,
  setClinicDateOpen,
} from "@/lib/appointments.functions";
import {
  appointmentStatusLabel,
  appointmentTypeLabel,
  formatQueueNumber,
  formatSlotLabel12h,
  formatTime12h,
  getClinicLocalDate,
  type AppointmentStatus,
  type AppointmentWithDetails,
  type TimeSlot,
} from "@/lib/appointments";

interface AppointmentsListProps {
  userId: string;
  clinicId: string;
  role: "OWNER" | "STAFF" | "DOCTOR";
  initialDoctorId?: string | undefined;
}

export function AppointmentsList({
  userId,
  clinicId,
  role,
  initialDoctorId,
}: AppointmentsListProps) {
  const qc = useQueryClient();
  const checkInFn = useServerFn(checkInClinicPatient);
  const rescheduleFn = useServerFn(rescheduleClinicAppointment);
  const cancelFn = useServerFn(cancelClinicAppointment);
  const setClinicDateOpenFn = useServerFn(setClinicDateOpen);

  // Clinic Metadata for local date & timezone
  const { data: clinicHoursData } = useQuery(clinicHoursQuery(userId, clinicId));
  const timeZone = clinicHoursData?.timezone || "Asia/Kolkata";
  const workingHours = clinicHoursData?.working_hours;

  // Filters State: Use clinic local date as default (not UTC ISO slice)
  const [dateFilter, setDateFilter] = useState<string>(() =>
    getClinicLocalDate(new Date(), timeZone)
  );
  const [doctorFilter, setDoctorFilter] = useState<string>(initialDoctorId ?? "");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Sync initial date filter when clinic timezone loads if needed
  useEffect(() => {
    if (timeZone) {
      const todayInClinic = getClinicLocalDate(new Date(), timeZone);
      setDateFilter((prev) => (prev ? prev : todayInClinic));
    }
  }, [timeZone]);

  // Reschedule Modal State
  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentWithDetails | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>("");
  const [rescheduleSlot, setRescheduleSlot] = useState<TimeSlot | null>(null);

  // Cancel Modal State
  const [cancelTarget, setCancelTarget] = useState<AppointmentWithDetails | null>(null);
  const [cancelReason, setCancelReason] = useState<string>("");

  // Vitals Dialog State
  const [vitalsTarget, setVitalsTarget] = useState<AppointmentWithDetails | null>(null);

  // New Appointment Dialog State (for Staff and Doctor workflows)
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState<boolean>(false);

  // Queries
  const { data: doctorsData } = useQuery(
    clinicQueueDoctorsQuery(userId, clinicId, { search: "", status: "ACTIVE", page: 0 })
  );

  const { data: appointmentsData, isLoading } = useQuery(
    appointmentsQuery(userId, clinicId, {
      date: dateFilter,
      doctor_id: doctorFilter,
      status: statusFilter as any,
      search: searchTerm,
      page: 0,
    })
  );

  const { data: rescheduleAvailability, isLoading: loadingRescheduleSlots } = useQuery({
    ...doctorAvailabilityQuery(
      userId,
      clinicId,
      rescheduleTarget?.doctor_profile_id ?? "",
      rescheduleDate
    ),
    enabled: Boolean(rescheduleTarget && rescheduleDate),
  });

  const { data: affectedAppointments } = useQuery({
    ...affectedAppointmentsQuery(userId, clinicId, dateFilter),
    enabled: Boolean(workingHours?.closed_dates?.includes(dateFilter)),
  });

  // Realtime Subscription
  useEffect(() => {
    const channel = supabase
      .channel(`appointments-realtime-${clinicId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `clinic_id=eq.${clinicId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["appointments", clinicId] });
          qc.invalidateQueries({ queryKey: ["queue-entries", clinicId] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clinicId, qc]);

  // Mutations
  const checkInMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      return checkInFn({
        data: {
          clinicId,
          appointmentId,
        },
      });
    },
    onSuccess: (res) => {
      const qNum = formatQueueNumber(res.queueEntry.queue_number);
      toast.success(`Patient checked in successfully! Assigned Queue #${qNum}`);
      qc.invalidateQueries({ queryKey: ["appointments", clinicId] });
      qc.invalidateQueries({ queryKey: ["queue-entries", clinicId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to check in patient.");
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      if (!rescheduleTarget || !rescheduleSlot) {
        throw new Error("Please select an available time slot.");
      }
      return rescheduleFn({
        data: {
          clinicId,
          appointmentId: rescheduleTarget.id,
          scheduledStart: rescheduleSlot.start,
          scheduledEnd: rescheduleSlot.end,
        },
      });
    },
    onSuccess: () => {
      toast.success("Appointment rescheduled successfully.");
      setRescheduleTarget(null);
      setRescheduleSlot(null);
      qc.invalidateQueries({ queryKey: ["appointments", clinicId] });
      qc.invalidateQueries({ queryKey: ["doctor-availability", clinicId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to reschedule appointment.");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!cancelTarget) return;
      return cancelFn({
        data: {
          clinicId,
          appointmentId: cancelTarget.id,
          reason: cancelReason || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Appointment cancelled.");
      setCancelTarget(null);
      setCancelReason("");
      qc.invalidateQueries({ queryKey: ["appointments", clinicId] });
      qc.invalidateQueries({ queryKey: ["queue-entries", clinicId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not cancel appointment.");
    },
  });

  const toggleClinicOpenMutation = useMutation({
    mutationFn: async (isOpen: boolean) => {
      return setClinicDateOpenFn({
        data: {
          clinicId,
          date: dateFilter,
          isOpen,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.is_open
          ? `Clinic marked Open for ${dateFilter}`
          : `Clinic marked Closed for ${dateFilter}`
      );
      qc.invalidateQueries({ queryKey: ["clinic-hours", clinicId] });
      qc.invalidateQueries({ queryKey: ["doctor-availability", clinicId] });
      qc.invalidateQueries({ queryKey: ["affected-appointments", clinicId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to change clinic open status.");
    },
  });

  const doctors = doctorsData?.rows ?? [];
  const appointments = appointmentsData?.rows ?? [];

  const isClinicClosedOnSelectedDate =
    workingHours?.closed_dates?.includes(dateFilter) ?? false;

  const getStatusTone = (status: AppointmentStatus) => {
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageTitle
          title="Appointments"
          description="Schedule, check in patients, and manage consultation bookings."
        />
        {role === "STAFF" ? (
          <Button onClick={() => setIsNewAppointmentOpen(true)} className="gap-1.5">
            <Plus className="size-4" />
            New Appointment
          </Button>
        ) : role === "DOCTOR" ? (
          <Button onClick={() => setIsNewAppointmentOpen(true)} className="gap-1.5">
            <Plus className="size-4" />
            Schedule Follow-Up
          </Button>
        ) : (
          <Button asChild>
            <Link to="/clinic/appointments/new">
              <Plus className="mr-1.5 size-4" />
              New Appointment
            </Link>
          </Button>
        )}
      </div>

      {/* Filter Toolbar with Modern Clickable DatePicker */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 rounded-lg border bg-card p-4 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search patient name, #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div>
          <DatePicker
            value={dateFilter}
            onChange={(d) => setDateFilter(d)}
            timeZone={timeZone}
            placeholder="Filter by date"
          />
        </div>

        {role !== "DOCTOR" && (
          <div>
            <Select
              value={doctorFilter || "ALL"}
              onValueChange={(v) => setDoctorFilter(v === "ALL" ? "" : v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Doctors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Doctors</SelectItem>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.display_name ?? "Doctor"} ({d.specialization})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="SCHEDULED">Scheduled</SelectItem>
              <SelectItem value="CONFIRMED">Confirmed</SelectItem>
              <SelectItem value="CHECKED_IN">Checked In</SelectItem>
              <SelectItem value="IN_PROGRESS">In Consultation</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
              <SelectItem value="NO_SHOW">No Show</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Clinic Open / Closed Status Banner */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3.5 text-sm ${
          isClinicClosedOnSelectedDate
            ? "border-destructive/30 bg-destructive/5 text-destructive-foreground"
            : "border-success/30 bg-success/5 text-foreground"
        }`}
      >
        <div className="flex items-center gap-2">
          {isClinicClosedOnSelectedDate ? (
            <DoorClosed className="size-5 text-destructive" />
          ) : (
            <DoorOpen className="size-5 text-success" />
          )}
          <div>
            <span className="font-semibold">
              Clinic is {isClinicClosedOnSelectedDate ? "Closed" : "Open"} on {dateFilter}
            </span>
            <span className="ml-2 text-xs text-muted-foreground">
              {isClinicClosedOnSelectedDate
                ? "New appointment bookings are blocked for this date."
                : `Normal hours: ${workingHours?.opening_time || "09:00"} to ${
                    workingHours?.closing_time || "18:00"
                  }`}
            </span>
          </div>
        </div>

        {role === "OWNER" && (
          <Button
            size="sm"
            variant={isClinicClosedOnSelectedDate ? "default" : "outline"}
            disabled={toggleClinicOpenMutation.isPending}
            onClick={() => toggleClinicOpenMutation.mutate(isClinicClosedOnSelectedDate)}
            className="h-8 text-xs gap-1"
          >
            {toggleClinicOpenMutation.isPending && (
              <Loader2 className="size-3.5 animate-spin" />
            )}
            {isClinicClosedOnSelectedDate ? "Reopen Clinic on this Date" : "Mark Clinic Closed"}
          </Button>
        )}
      </div>

      {/* Affected Appointments Banner during Planned Closure */}
      {isClinicClosedOnSelectedDate && (affectedAppointments?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300 text-sm">
            <AlertTriangle className="size-4" />
            <span>
              {affectedAppointments?.length} Existing Appointment(s) on this Closed Date
            </span>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Appointments are preserved in history and are not automatically moved or cancelled.
            Please coordinate with patients to reschedule if needed.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {affectedAppointments?.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1.5 rounded bg-background/80 px-2.5 py-1 text-xs border text-foreground"
              >
                <strong>{formatTime12h(a.scheduled_start, timeZone)}</strong>:{" "}
                {a.patient?.first_name} {a.patient?.last_name} ({a.doctor?.display_name ?? "Doctor"})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Appointments List / Table */}
      {isLoading ? (
        <LoadingState label="Loading appointments..." />
      ) : appointments.length === 0 ? (
        <EmptyState
          title="No appointments found"
          description={
            searchTerm || dateFilter || doctorFilter || statusFilter !== "ALL"
              ? "Try adjusting your filters or date selection."
              : "No appointments scheduled for this clinic yet."
          }
          action={
            role === "STAFF" || role === "DOCTOR" ? (
              <Button variant="outline" size="sm" onClick={() => setIsNewAppointmentOpen(true)}>
                <Plus className="mr-1.5 size-4" />
                Schedule Appointment
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link to="/clinic/appointments/new">
                  <Plus className="mr-1.5 size-4" />
                  Schedule First Appointment
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Time &amp; Date</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3">Type &amp; Reason</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {appointments.map((appt) => {
                  // Phase 9: Display appointment times in 12-hour AM/PM format
                  const timeLabel = formatSlotLabel12h(
                    appt.scheduled_start,
                    appt.scheduled_end,
                    timeZone
                  );
                  const dateLabel = getClinicLocalDate(
                    new Date(appt.scheduled_start),
                    timeZone
                  );

                  const canCheckIn =
                    (appt.status === "SCHEDULED" || appt.status === "CONFIRMED") &&
                    role !== "DOCTOR";
                  const canManage =
                    appt.status !== "COMPLETED" && appt.status !== "CANCELLED";

                  return (
                    <tr key={appt.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="font-medium text-foreground font-mono">{timeLabel}</div>
                        <div className="text-xs text-muted-foreground">{dateLabel}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-foreground">
                          {appt.patient
                            ? `${appt.patient.first_name} ${appt.patient.last_name ?? ""}`.trim()
                            : "Patient"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          #{appt.patient?.patient_number}{" "}
                          {appt.patient?.phone ? `· ${appt.patient.phone}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-foreground">
                          {appt.doctor?.display_name ?? "Doctor"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {appt.doctor?.specialization}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 max-w-xs truncate">
                        <div className="font-medium text-foreground">
                          {appointmentTypeLabel[appt.appointment_type]}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {appt.reason || "Routine visit"}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <StatusBadge tone={getStatusTone(appt.status)}>
                          {appointmentStatusLabel[appt.status]}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {canCheckIn && (
                            <Button
                              size="sm"
                              variant="default"
                              disabled={checkInMutation.isPending}
                              onClick={() => checkInMutation.mutate(appt.id)}
                              className="h-8 gap-1"
                            >
                              <UserCheck className="size-3.5" />
                              Check In
                            </Button>
                          )}
                          {appt.status === "CHECKED_IN" && role !== "DOCTOR" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setVitalsTarget(appt)}
                              className="h-8 text-xs gap-1"
                            >
                              <Activity className="size-3.5 text-emerald-600" />
                              Vitals
                            </Button>
                          )}
                          {canManage && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setRescheduleTarget(appt);
                                  setRescheduleDate(
                                    getClinicLocalDate(new Date(appt.scheduled_start), timeZone)
                                  );
                                  setRescheduleSlot(null);
                                }}
                                className="h-8 text-xs"
                              >
                                Reschedule
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setCancelTarget(appt);
                                  setCancelReason("");
                                }}
                                className="h-8 text-xs text-destructive hover:bg-destructive/10"
                              >
                                Cancel
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reschedule Dialog using DatePicker and 12-Hour AM/PM Slots */}
      <Dialog open={Boolean(rescheduleTarget)} onOpenChange={(o) => !o && setRescheduleTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reschedule Appointment</DialogTitle>
            <DialogDescription>
              Select a new date and available time slot for{" "}
              <strong>
                {rescheduleTarget?.patient?.first_name} {rescheduleTarget?.patient?.last_name}
              </strong>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">New Date</label>
              <DatePicker
                value={rescheduleDate}
                onChange={(d) => {
                  setRescheduleDate(d);
                  setRescheduleSlot(null);
                }}
                minDate={getClinicLocalDate(new Date(), timeZone)}
                timeZone={timeZone}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-2">
                Available Time Slots
              </label>
              {loadingRescheduleSlots ? (
                <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Loading available slots...
                </div>
              ) : (rescheduleAvailability?.slots ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No slots available on this date.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {rescheduleAvailability?.slots.map((slot) => {
                    const isSelected = rescheduleSlot?.start === slot.start;
                    return (
                      <button
                        key={slot.start}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => setRescheduleSlot(slot)}
                        className={`rounded-md border p-2 text-xs font-mono transition-all text-center ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground font-semibold shadow-sm"
                            : slot.available
                            ? "border-border hover:border-primary/50 text-foreground"
                            : "opacity-40 cursor-not-allowed bg-muted text-muted-foreground"
                        }`}
                      >
                        {slot.timeLabel}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={!rescheduleSlot || rescheduleMutation.isPending}
              onClick={() => rescheduleMutation.mutate()}
            >
              {rescheduleMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Confirm Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={Boolean(cancelTarget)} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Appointment</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this appointment for{" "}
              <strong>
                {cancelTarget?.patient?.first_name} {cancelTarget?.patient?.last_name}
              </strong>
              ? If a queue entry was created, it will be cancelled as well.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="text-xs font-medium text-foreground">
              Cancellation Reason (Optional)
            </label>
            <Input
              placeholder="e.g. Patient requested reschedule, sickness..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              maxLength={200}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Keep Appointment
            </Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              {cancelMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receptionist Vitals Dialog */}
      {vitalsTarget && (
        <VitalsDialog
          open={Boolean(vitalsTarget)}
          onOpenChange={(o) => !o && setVitalsTarget(null)}
          clinicId={clinicId}
          appointmentId={vitalsTarget.id}
          patientName={`${vitalsTarget.patient?.first_name || ""} ${vitalsTarget.patient?.last_name || ""}`}
          patientNumber={vitalsTarget.patient?.patient_number}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["appointments", clinicId] });
            qc.invalidateQueries({ queryKey: ["queue-entries", clinicId] });
          }}
        />
      )}

      {/* New Appointment Dialog for Staff and Doctor workflows */}
      <Dialog open={isNewAppointmentOpen} onOpenChange={setIsNewAppointmentOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {role === "DOCTOR" ? "Schedule Follow-Up Appointment" : "Schedule New Appointment"}
            </DialogTitle>
            <DialogDescription>
              {role === "DOCTOR"
                ? "Select a patient and choose an available time slot for consultation."
                : "Select a patient and doctor, choose an available time slot, and confirm the booking."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <AppointmentForm
              userId={userId}
              clinicId={clinicId}
              defaultDoctorId={role === "DOCTOR" ? initialDoctorId : undefined}
              lockDoctor={role === "DOCTOR"}
              onSuccess={() => {
                setIsNewAppointmentOpen(false);
                qc.invalidateQueries({ queryKey: ["appointments", clinicId] });
                qc.invalidateQueries({ queryKey: ["doctor-availability", clinicId] });
              }}
              onCancel={() => setIsNewAppointmentOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
