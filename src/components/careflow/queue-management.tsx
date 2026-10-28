import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ListOrdered,
  Users,
  Stethoscope,
  Clock,
  ArrowRight,
  RotateCcw,
  SkipForward,
  UserX,
  Plus,
  Loader2,
  Calendar,
  CheckCircle2,
  Phone,
  Activity,
} from "lucide-react";
import { VitalsDialog } from "./vitals-dialog";
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
import { doctorsQuery } from "@/lib/team-queries";
import { queueEntriesQuery, clinicHoursQuery } from "@/lib/appointment-queries";
import {
  transitionClinicQueue,
  callNextClinicPatient,
} from "@/lib/appointments.functions";
import {
  formatQueueNumber,
  formatSlotLabel12h,
  formatTime12h,
  getClinicLocalDate,
  queueStatusLabel,
  type QueueEntryWithDetails,
  type QueueStatus,
} from "@/lib/appointments";

interface QueueManagementProps {
  userId: string;
  clinicId: string;
  role: "OWNER" | "STAFF";
}

export function QueueManagement({ userId, clinicId, role }: QueueManagementProps) {
  const qc = useQueryClient();
  const transitionFn = useServerFn(transitionClinicQueue);
  const callNextFn = useServerFn(callNextClinicPatient);

  // Clinic metadata for timezone
  const { data: clinicHoursData } = useQuery(clinicHoursQuery(userId, clinicId));
  const timeZone = clinicHoursData?.timezone || "Asia/Kolkata";

  const [selectedDate, setSelectedDate] = useState<string>(() =>
    getClinicLocalDate(new Date(), timeZone)
  );
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("ALL");

  useEffect(() => {
    if (timeZone) {
      setSelectedDate((prev) => (prev ? prev : getClinicLocalDate(new Date(), timeZone)));
    }
  }, [timeZone]);

  // Skip / No-show Confirmation Dialog State
  const [actionTarget, setActionTarget] = useState<{
    entry: QueueEntryWithDetails;
    type: "SKIP" | "NO_SHOW" | "RETURN";
  } | null>(null);

  // Vitals Dialog State
  const [vitalsTarget, setVitalsTarget] = useState<QueueEntryWithDetails | null>(null);

  // Queries
  const { data: doctorsData } = useQuery(
    doctorsQuery(userId, clinicId, { search: "", status: "ACTIVE", page: 0 })
  );

  const { data: queueData, isLoading } = useQuery(
    queueEntriesQuery(
      userId,
      clinicId,
      selectedDate,
      selectedDoctorId === "ALL" ? undefined : selectedDoctorId
    )
  );

  // Realtime Subscription
  useEffect(() => {
    const channel = supabase
      .channel(`queue-realtime-${clinicId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "queue_entries",
          filter: `clinic_id=eq.${clinicId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["queue-entries", clinicId] });
          qc.invalidateQueries({ queryKey: ["appointments", clinicId] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clinicId, qc]);

  // Mutations
  const transitionMutation = useMutation({
    mutationFn: async ({
      queueEntryId,
      newStatus,
    }: {
      queueEntryId: string;
      newStatus: QueueStatus;
    }) => {
      return transitionFn({
        data: {
          clinicId,
          queueEntryId,
          newStatus,
        },
      });
    },
    onSuccess: (_, vars) => {
      const label = queueStatusLabel[vars.newStatus];
      toast.success(`Queue status updated: ${label}`);
      setActionTarget(null);
      qc.invalidateQueries({ queryKey: ["queue-entries", clinicId] });
      qc.invalidateQueries({ queryKey: ["appointments", clinicId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not update queue status.");
    },
  });

  const callNextMutation = useMutation({
    mutationFn: async (doctorProfileId: string) => {
      return callNextFn({
        data: {
          clinicId,
          doctorProfileId,
          date: selectedDate,
        },
      });
    },
    onSuccess: (res) => {
      if (res) {
        toast.success(`Called patient Queue #${formatQueueNumber(res.queue_number)}`);
      } else {
        toast.info("No waiting patients in queue for this doctor.");
      }
      qc.invalidateQueries({ queryKey: ["queue-entries", clinicId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to call next patient.");
    },
  });

  const doctors = doctorsData?.rows ?? [];
  const queueEntries = queueData ?? [];

  // Group queue entries by doctor for unified overview
  // Phase 11 Fix: Currently with Doctor represents strictly IN_CONSULTATION.
  const doctorSummaries = doctors.map((doc) => {
    const docEntries = queueEntries.filter((e) => e.doctor_profile_id === doc.id);
    const waiting = docEntries.filter((e) => e.status === "WAITING");
    const inConsultation = docEntries.find((e) => e.status === "IN_CONSULTATION");
    const called = docEntries.find((e) => e.status === "CALLED");
    const nextInLine = waiting[0] ?? null;

    return {
      doctor: doc,
      waitingCount: waiting.length,
      currentPatient: inConsultation ?? null,
      calledPatient: called ?? null,
      nextPatient: nextInLine,
      totalToday: docEntries.length,
    };
  });

  const getStatusTone = (status: QueueStatus) => {
    switch (status) {
      case "WAITING":
        return "warning";
      case "CALLED":
        return "warning";
      case "IN_CONSULTATION":
        return "success";
      case "COMPLETED":
        return "info";
      case "SKIPPED":
        return "neutral";
      case "CANCELLED":
        return "danger";
      default:
        return "neutral";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageTitle
          title="Patient Queue"
          description="Live queue tracking, patient check-ins, and doctor queue progression."
        />
        <Button asChild>
          <Link to={role === "STAFF" ? "/staff/appointments" : "/clinic/appointments"}>
            <Plus className="mr-1.5 size-4" />
            Check In / New Appointment
          </Link>
        </Button>
      </div>

      {/* Filter Bar with DatePicker */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <div className="w-56">
          <DatePicker
            value={selectedDate}
            onChange={(d) => setSelectedDate(d)}
            timeZone={timeZone}
            placeholder="Select queue date"
          />
        </div>

        <div className="flex items-center gap-2">
          <Stethoscope className="size-4 text-muted-foreground" />
          <Select
            value={selectedDoctorId}
            onValueChange={setSelectedDoctorId}
          >
            <SelectTrigger className="w-[200px] h-9">
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
      </div>

      {/* Unified Doctor Queue Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {doctorSummaries.map((summary) => {
          const doc = summary.doctor;
          const current = summary.currentPatient;
          const called = summary.calledPatient;
          const next = summary.nextPatient;

          return (
            <div
              key={doc.id}
              className="flex flex-col justify-between rounded-lg border bg-card p-4 shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {doc.display_name ?? "Doctor"}
                    </h3>
                    <p className="text-xs text-muted-foreground">{doc.specialization}</p>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    <Users className="size-3" />
                    {summary.waitingCount} waiting
                  </span>
                </div>

                <div className="mt-4 space-y-2.5 rounded-md border bg-muted/30 p-3 text-xs">
                  {/* Currently with Doctor: Represents strictly IN_CONSULTATION */}
                  <div>
                    <span className="text-muted-foreground block text-[11px] font-medium">
                      Currently with Doctor:
                    </span>
                    {current ? (
                      <div className="mt-0.5 flex items-center justify-between font-medium text-foreground">
                        <span>
                          Queue #{formatQueueNumber(current.queue_number)} ·{" "}
                          {current.patient?.first_name} {current.patient?.last_name}
                        </span>
                        <StatusBadge tone="success">In Room</StatusBadge>
                      </div>
                    ) : (
                      <span className="text-muted-foreground italic">No patient in consultation</span>
                    )}
                  </div>

                  {/* Patient Called into Room (if any) */}
                  {called && (
                    <div className="border-t pt-2">
                      <span className="text-muted-foreground block text-[11px] font-medium">
                        Patient Called:
                      </span>
                      <div className="mt-0.5 flex items-center justify-between font-medium text-foreground">
                        <span>
                          Queue #{formatQueueNumber(called.queue_number)} ·{" "}
                          {called.patient?.first_name} {called.patient?.last_name}
                        </span>
                        <StatusBadge tone="warning">Called</StatusBadge>
                      </div>
                    </div>
                  )}

                  {/* Next Patient: Next eligible waiting patient */}
                  <div className="border-t pt-2">
                    <span className="text-muted-foreground block text-[11px] font-medium">
                      Next Patient:
                    </span>
                    {next ? (
                      <span className="mt-0.5 block font-medium text-foreground">
                        Queue #{formatQueueNumber(next.queue_number)} · {next.patient?.first_name}{" "}
                        {next.patient?.last_name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">Queue is clear</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t pt-3">
                <span className="text-xs text-muted-foreground">
                  {summary.totalToday} total today
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    summary.waitingCount === 0 ||
                    Boolean(summary.currentPatient) ||
                    callNextMutation.isPending
                  }
                  onClick={() => callNextMutation.mutate(doc.id)}
                  className="h-8 gap-1 text-xs"
                  title={
                    summary.currentPatient
                      ? "Complete the current consultation before calling next"
                      : "Call next patient in queue"
                  }
                >
                  <ArrowRight className="size-3.5" />
                  Call Next
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Master Queue Table */}
      {isLoading ? (
        <LoadingState label="Loading patient queue..." />
      ) : queueEntries.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title="No patients in queue"
          description="Check in scheduled patients from the Appointments screen to add them to today's queue."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/clinic/appointments">Go to Appointments</Link>
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="border-b bg-muted/40 px-4 py-3 flex items-center justify-between">
            <h3 className="font-semibold text-foreground text-sm">
              Today&apos;s Active Queue ({queueEntries.length} Patients)
            </h3>
            <span className="text-xs text-muted-foreground font-mono">{selectedDate}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/20 text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Queue #</th>
                  <th className="px-4 py-2.5">Patient</th>
                  <th className="px-4 py-2.5">Doctor</th>
                  <th className="px-4 py-2.5">Appt Time</th>
                  <th className="px-4 py-2.5">Check-in Time</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {queueEntries.map((entry) => {
                  // Phase 9 & Additional Requirement B:
                  // Displays the appointment's original booked time slot in 12-hour AM/PM format
                  const apptTime = entry.appointment?.scheduled_start
                    ? formatSlotLabel12h(
                        entry.appointment.scheduled_start,
                        entry.appointment.scheduled_end,
                        timeZone
                      )
                    : "--";

                  const checkInTime = entry.checked_in_at
                    ? formatTime12h(entry.checked_in_at, timeZone)
                    : "--";

                  const isCalled = entry.status === "CALLED";
                  const isWaiting = entry.status === "WAITING";
                  const isSkipped = entry.status === "SKIPPED";
                  const isInRoom = entry.status === "IN_CONSULTATION";

                  return (
                    <tr key={entry.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono font-bold text-foreground">
                        #{formatQueueNumber(entry.queue_number)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">
                          {entry.patient?.first_name} {entry.patient?.last_name ?? ""}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          #{entry.patient?.patient_number}{" "}
                          {entry.patient?.phone ? `· ${entry.patient.phone}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">
                          {entry.doctor?.display_name ?? "Doctor"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {entry.doctor?.specialization}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{apptTime}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {checkInTime}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={getStatusTone(entry.status)}>
                          {queueStatusLabel[entry.status]}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {entry.appointment_id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setVitalsTarget(entry)}
                              className="h-7 text-xs"
                            >
                              <Activity className="size-3 mr-1 text-emerald-600" />
                              Vitals
                            </Button>
                          )}
                          {isCalled && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setActionTarget({ entry, type: "SKIP" })}
                              className="h-7 text-xs"
                            >
                              <SkipForward className="size-3 mr-1" />
                              Skip
                            </Button>
                          )}
                          {isSkipped && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setActionTarget({ entry, type: "RETURN" })}
                              className="h-7 text-xs"
                            >
                              <RotateCcw className="size-3 mr-1" />
                              Return to Waiting
                            </Button>
                          )}
                          {(isCalled || isWaiting || isSkipped) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setActionTarget({ entry, type: "NO_SHOW" })}
                              className="h-7 text-xs text-destructive hover:bg-destructive/10"
                            >
                              <UserX className="size-3 mr-1" />
                              No Show
                            </Button>
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

      {/* Action Dialog: Skip / No-show Confirmation */}
      <Dialog open={Boolean(actionTarget)} onOpenChange={(o) => !o && setActionTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionTarget?.type === "SKIP"
                ? "Skip Patient"
                : actionTarget?.type === "RETURN"
                ? "Return Patient to Queue"
                : "Mark as No Show"}
            </DialogTitle>
            <DialogDescription>
              {actionTarget?.type === "SKIP"
                ? `Temporarily skip Queue #${formatQueueNumber(actionTarget.entry.queue_number)} (${actionTarget.entry.patient?.first_name} ${actionTarget.entry.patient?.last_name}). The patient will remain eligible to be called or returned to waiting.`
                : actionTarget?.type === "RETURN"
                ? `Return Queue #${formatQueueNumber(actionTarget?.entry.queue_number ?? 0)} to the waiting queue.`
                : `Mark Queue #${formatQueueNumber(actionTarget?.entry.queue_number ?? 0)} as No Show? This will cancel their queue entry.`}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={actionTarget?.type === "NO_SHOW" ? "destructive" : "default"}
              disabled={transitionMutation.isPending}
              onClick={() => {
                if (!actionTarget) return;
                const newStatus: QueueStatus =
                  actionTarget.type === "SKIP"
                    ? "SKIPPED"
                    : actionTarget.type === "RETURN"
                    ? "WAITING"
                    : "CANCELLED";
                transitionMutation.mutate({
                  queueEntryId: actionTarget.entry.id,
                  newStatus,
                });
              }}
            >
              {transitionMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receptionist Vitals Dialog */}
      {vitalsTarget && vitalsTarget.appointment_id && (
        <VitalsDialog
          open={Boolean(vitalsTarget)}
          onOpenChange={(o) => !o && setVitalsTarget(null)}
          clinicId={clinicId}
          appointmentId={vitalsTarget.appointment_id}
          patientName={`${vitalsTarget.patient?.first_name || ""} ${vitalsTarget.patient?.last_name || ""}`}
          patientNumber={vitalsTarget.patient?.patient_number}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["queue-entries", clinicId] });
          }}
        />
      )}
    </div>
  );
}
