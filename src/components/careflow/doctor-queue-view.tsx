import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Stethoscope,
  Users,
  Clock,
  ArrowRight,
  CheckCircle,
  SkipForward,
  UserX,
  FileText,
  Loader2,
  Calendar,
  Phone,
  UserCheck,
  AlertCircle,
  Play,
  RotateCcw,
  CheckCheck,
  CalendarOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  queueEntriesQuery,
  clinicHoursQuery,
  doctorAvailabilityQuery,
} from "@/lib/appointment-queries";
import {
  transitionClinicQueue,
  callNextClinicPatient,
  consultClinicPatient,
  setDoctorDailyAvailabilityFn,
  requestDoctorLeaveFn,
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
import { DoctorConsultationWorkspace } from "./doctor-consultation-workspace";

interface DoctorQueueViewProps {
  userId: string;
  clinicId: string;
  title?: string;
  description?: string;
}

export function DoctorQueueView({
  userId,
  clinicId,
  title = "Doctor Consultations",
  description = "Manage patient consultations, call waiting patients, and complete encounter notes.",
}: DoctorQueueViewProps) {
  const qc = useQueryClient();
  const transitionFn = useServerFn(transitionClinicQueue);
  const callNextFn = useServerFn(callNextClinicPatient);
  const consultFn = useServerFn(consultClinicPatient);
  const setAvailabilityFn = useServerFn(setDoctorDailyAvailabilityFn);
  const requestLeaveFn = useServerFn(requestDoctorLeaveFn);

  // Clinic metadata for timezone
  const { data: clinicHoursData } = useQuery(clinicHoursQuery(userId, clinicId));
  const timeZone = clinicHoursData?.timezone || "Asia/Kolkata";

  const todayStr = getClinicLocalDate(new Date(), timeZone);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  useEffect(() => {
    if (timeZone) {
      setSelectedDate((prev) => (prev ? prev : getClinicLocalDate(new Date(), timeZone)));
    }
  }, [timeZone]);

  // Consultation Note State for Active Patient
  const [assessment, setAssessment] = useState<string>("");
  const [clinicalNotes, setClinicalNotes] = useState<string>("");

  // Leave Request Dialog State
  const [showLeaveDialog, setShowLeaveDialog] = useState<boolean>(false);
  const [leaveDate, setLeaveDate] = useState<string>(todayStr);
  const [leaveReason, setLeaveReason] = useState<string>("");

  // Query Doctor's Queue
  const { data: queueData, isLoading } = useQuery(
    queueEntriesQuery(userId, clinicId, selectedDate)
  );

  // Realtime Subscription
  useEffect(() => {
    const channel = supabase
      .channel(`doctor-queue-${clinicId}-${userId}`)
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
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clinicId, userId, qc]);

  // Mutations
  const transitionMutation = useMutation({
    mutationFn: async ({
      queueEntryId,
      newStatus,
      notes,
      diag,
    }: {
      queueEntryId: string;
      newStatus: QueueStatus;
      notes?: string;
      diag?: string;
    }) => {
      return transitionFn({
        data: {
          clinicId,
          queueEntryId,
          newStatus,
          clinicalNotes: notes,
          assessment: diag,
        },
      });
    },
    onSuccess: (_, vars) => {
      toast.success(`Patient marked as ${queueStatusLabel[vars.newStatus]}`);
      if (vars.newStatus === "COMPLETED") {
        setAssessment("");
        setClinicalNotes("");
      }
      qc.invalidateQueries({ queryKey: ["queue-entries", clinicId] });
      qc.invalidateQueries({ queryKey: ["appointments", clinicId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update queue state.");
    },
  });

  const callNextMutation = useMutation({
    mutationFn: async () => {
      return callNextFn({
        data: {
          clinicId,
          doctorProfileId: "00000000-0000-0000-0000-000000000000", // Resolved by server
          date: selectedDate,
        },
      });
    },
    onSuccess: (res) => {
      if (res) {
        toast.success(`Called patient Queue #${formatQueueNumber(res.queue_number)}`);
      } else {
        toast.info("No waiting patients in your queue.");
      }
      qc.invalidateQueries({ queryKey: ["queue-entries", clinicId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not call next patient.");
    },
  });

  // Phase 12: Consulted Button Mutation
  // Completes active patient consultation and automatically calls the next waiting patient
  const consultMutation = useMutation({
    mutationFn: async (queueEntryId: string) => {
      return consultFn({
        data: {
          clinicId,
          doctorProfileId: "00000000-0000-0000-0000-000000000000", // Resolved by server
          queueEntryId,
          clinicalNotes: clinicalNotes || null,
          assessment: assessment || null,
        },
      });
    },
    onSuccess: (res) => {
      setAssessment("");
      setClinicalNotes("");
      if (res.next) {
        toast.success(
          `Consultation completed! Automatically called next patient: Queue #${formatQueueNumber(
            res.next.queue_number
          )}`
        );
      } else {
        toast.success("Consultation completed! No more patients waiting in queue.");
      }
      qc.invalidateQueries({ queryKey: ["queue-entries", clinicId] });
      qc.invalidateQueries({ queryKey: ["appointments", clinicId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not complete consultation.");
    },
  });

  // Doctor Daily Availability (Available / Busy)
  const [dailyStatus, setDailyStatus] = useState<"AVAILABLE" | "BUSY">("AVAILABLE");

  const toggleAvailabilityMutation = useMutation({
    mutationFn: async (status: "AVAILABLE" | "BUSY") => {
      return setAvailabilityFn({
        data: {
          clinicId,
          doctorProfileId: "00000000-0000-0000-0000-000000000000",
          date: selectedDate,
          status,
        },
      });
    },
    onSuccess: (res) => {
      setDailyStatus(res.status);
      toast.success(`You are now marked ${res.status} for ${res.date}.`);
      qc.invalidateQueries({ queryKey: ["doctor-availability", clinicId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not update availability.");
    },
  });

  const requestLeaveMutation = useMutation({
    mutationFn: async () => {
      return requestLeaveFn({
        data: {
          clinicId,
          doctorProfileId: "00000000-0000-0000-0000-000000000000",
          date: leaveDate,
          reason: leaveReason || null,
        },
      });
    },
    onSuccess: () => {
      toast.success(`Leave request submitted for ${leaveDate}.`);
      setShowLeaveDialog(false);
      setLeaveReason("");
      qc.invalidateQueries({ queryKey: ["doctor-availability", clinicId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not submit leave request.");
    },
  });

  const queueEntries = queueData ?? [];

  // Phase 11 Fix: Strict grouping by queue status
  const inConsultationPatient = queueEntries.find((e) => e.status === "IN_CONSULTATION");
  const calledPatient = queueEntries.find((e) => e.status === "CALLED");
  const waitingPatients = queueEntries.filter((e) => e.status === "WAITING");
  const skippedPatients = queueEntries.filter((e) => e.status === "SKIPPED");
  const completedPatients = queueEntries.filter((e) => e.status === "COMPLETED");

  const nextPatient = waitingPatients[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageTitle
          title={title}
          description={description}
        />
        <div className="flex items-center gap-3">
          <div className="w-52">
            <DatePicker
              value={selectedDate}
              onChange={(d) => setSelectedDate(d)}
              timeZone={timeZone}
              placeholder="Select date"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLeaveDialog(true)}
            className="h-9 gap-1.5 text-xs"
          >
            <CalendarOff className="size-3.5" />
            Apply Leave
          </Button>
        </div>
      </div>

      {/* Doctor Daily Availability Bar (Available / Busy) */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Stethoscope className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground">
                Daily Appointment Availability ({selectedDate}):
              </span>
              <StatusBadge tone={dailyStatus === "AVAILABLE" ? "success" : "warning"}>
                {dailyStatus === "AVAILABLE" ? "Available for Bookings" : "Marked Busy"}
              </StatusBadge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              This daily setting controls slot booking eligibility without changing your clinic membership status.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={dailyStatus === "AVAILABLE" ? "default" : "outline"}
            disabled={toggleAvailabilityMutation.isPending || dailyStatus === "AVAILABLE"}
            onClick={() => toggleAvailabilityMutation.mutate("AVAILABLE")}
            className="h-8 text-xs"
          >
            Mark Available
          </Button>
          <Button
            size="sm"
            variant={dailyStatus === "BUSY" ? "destructive" : "outline"}
            disabled={toggleAvailabilityMutation.isPending || dailyStatus === "BUSY"}
            onClick={() => toggleAvailabilityMutation.mutate("BUSY")}
            className="h-8 text-xs"
          >
            Mark Busy
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <span className="text-xs font-medium text-muted-foreground">Waiting</span>
          <p className="mt-1 text-2xl font-bold text-foreground">{waitingPatients.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <span className="text-xs font-medium text-muted-foreground">Currently In Room</span>
          <p className="mt-1 text-2xl font-bold text-primary">
            {inConsultationPatient ? `#${formatQueueNumber(inConsultationPatient.queue_number)}` : "None"}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <span className="text-xs font-medium text-muted-foreground">Next Patient</span>
          <p className="mt-1 text-sm font-semibold text-foreground truncate">
            {nextPatient
              ? `#${formatQueueNumber(nextPatient.queue_number)} · ${nextPatient.patient?.first_name}`
              : "Clear"}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <span className="text-xs font-medium text-muted-foreground">Completed Today</span>
          <p className="mt-1 text-2xl font-bold text-success-foreground">{completedPatients.length}</p>
        </div>
      </div>

      {/* Section 1: Patient Currently in Consultation */}
      {inConsultationPatient ? (
        inConsultationPatient.appointment_id ? (
          <DoctorConsultationWorkspace
            clinicId={clinicId}
            appointmentId={inConsultationPatient.appointment_id}
            queueEntryId={inConsultationPatient.id}
            onCompleted={() => {
              qc.invalidateQueries({
                queryKey: ["queue-entries", clinicId],
              });
            }}
          />
        ) : (
          <div className="rounded-lg border-2 border-primary/40 bg-card p-6 shadow-sm space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-2xl font-bold text-primary">
                    Queue #{formatQueueNumber(inConsultationPatient.queue_number)}
                  </span>
                  <StatusBadge tone="success">In Consultation</StatusBadge>
                </div>
                <h3 className="mt-1 text-lg font-semibold text-foreground">
                  {inConsultationPatient.patient?.first_name} {inConsultationPatient.patient?.last_name}
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => consultMutation.mutate(inConsultationPatient.id)}
                  disabled={consultMutation.isPending}
                  className="gap-1.5 bg-success hover:bg-success/90 text-success-foreground font-semibold"
                >
                  {consultMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCheck className="size-4" />
                  )}
                  Consulted
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    transitionMutation.mutate({
                      queueEntryId: inConsultationPatient.id,
                      newStatus: "SKIPPED",
                    })
                  }
                  disabled={transitionMutation.isPending || consultMutation.isPending}
                  className="gap-1"
                >
                  <SkipForward className="size-4" />
                  Skip
                </Button>
              </div>
            </div>
          </div>
        )
      ) : calledPatient ? (
        // Patient Called but not yet in Consultation
        <div className="rounded-lg border bg-amber-500/10 border-amber-500/30 p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-2xl font-bold text-amber-800 dark:text-amber-300">
                  Queue #{formatQueueNumber(calledPatient.queue_number)}
                </span>
                <StatusBadge tone="warning">Patient Called</StatusBadge>
              </div>
              <h3 className="mt-1 text-lg font-semibold text-foreground">
                {calledPatient.patient?.first_name} {calledPatient.patient?.last_name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Patient was called. Click Start Consultation when the patient enters the consultation room.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() =>
                  transitionMutation.mutate({
                    queueEntryId: calledPatient.id,
                    newStatus: "IN_CONSULTATION",
                  })
                }
                disabled={transitionMutation.isPending}
                className="gap-1.5"
              >
                <Play className="size-4" />
                Start Consultation
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  transitionMutation.mutate({
                    queueEntryId: calledPatient.id,
                    newStatus: "SKIPPED",
                  })
                }
                disabled={transitionMutation.isPending}
              >
                <SkipForward className="size-4 mr-1" />
                Skip
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  transitionMutation.mutate({
                    queueEntryId: calledPatient.id,
                    newStatus: "CANCELLED",
                  })
                }
                disabled={transitionMutation.isPending}
                className="text-destructive hover:bg-destructive/10"
              >
                <UserX className="size-4 mr-1" />
                No Show
              </Button>
            </div>
          </div>
        </div>
      ) : (
        // Empty Consultation State
        <div className="rounded-lg border bg-card p-10 text-center flex flex-col items-center justify-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
            <Stethoscope className="size-7" />
          </div>
          <h3 className="text-base font-semibold text-foreground">No patient currently in consultation</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            {waitingPatients.length > 0
              ? `You have ${waitingPatients.length} patient(s) waiting in your queue.`
              : "Your waiting queue is currently clear for this date."}
          </p>
          <Button
            size="lg"
            disabled={waitingPatients.length === 0 || callNextMutation.isPending}
            onClick={() => callNextMutation.mutate()}
            className="mt-5 gap-2"
          >
            {callNextMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowRight className="size-4" />
            )}
            Call Next Patient
          </Button>
        </div>
      )}

      {/* Waiting Patients List */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="border-b bg-muted/40 px-4 py-3 flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <Users className="size-4 text-primary" />
            Waiting Patients ({waitingPatients.length})
          </h3>
        </div>

        {waitingPatients.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No patients waiting in queue.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/20 text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Queue #</th>
                  <th className="px-4 py-2.5">Patient Name</th>
                  <th className="px-4 py-2.5">Patient #</th>
                  <th className="px-4 py-2.5">Scheduled Time</th>
                  <th className="px-4 py-2.5">Checked In</th>
                  <th className="px-4 py-2.5">Reason</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {waitingPatients.map((entry) => {
                  const checkInTime = entry.checked_in_at
                    ? formatTime12h(entry.checked_in_at, timeZone)
                    : "--";
                  const apptTime = entry.appointment?.scheduled_start
                    ? formatTime12h(entry.appointment.scheduled_start, timeZone)
                    : "--";

                  return (
                    <tr key={entry.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono font-bold text-foreground">
                        #{formatQueueNumber(entry.queue_number)}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {entry.patient?.first_name} {entry.patient?.last_name}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        #{entry.patient?.patient_number}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{apptTime}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {checkInTime}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                        {entry.appointment?.reason || "General visit"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            Boolean(inConsultationPatient) ||
                            Boolean(calledPatient) ||
                            transitionMutation.isPending
                          }
                          onClick={() =>
                            transitionMutation.mutate({
                              queueEntryId: entry.id,
                              newStatus: "CALLED",
                            })
                          }
                          className="h-7 text-xs"
                          title={
                            inConsultationPatient
                              ? "Complete active consultation first"
                              : "Call patient"
                          }
                        >
                          Call
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Skipped Patients List */}
      {skippedPatients.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="border-b bg-muted/40 px-4 py-3 flex items-center justify-between">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <SkipForward className="size-4 text-muted-foreground" />
              Skipped Patients ({skippedPatients.length})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-border">
                {skippedPatients.map((entry) => (
                  <tr key={entry.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono font-medium">
                      #{formatQueueNumber(entry.queue_number)}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {entry.patient?.first_name} {entry.patient?.last_name}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      #{entry.patient?.patient_number}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            transitionMutation.mutate({
                              queueEntryId: entry.id,
                              newStatus: "WAITING",
                            })
                          }
                          className="h-7 text-xs"
                        >
                          <RotateCcw className="size-3 mr-1" />
                          Return to Queue
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          disabled={Boolean(inConsultationPatient) || Boolean(calledPatient)}
                          onClick={() =>
                            transitionMutation.mutate({
                              queueEntryId: entry.id,
                              newStatus: "CALLED",
                            })
                          }
                          className="h-7 text-xs"
                        >
                          Call Now
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Apply Planned Leave Dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply for Planned Leave</DialogTitle>
            <DialogDescription>
              Select a date and submit your leave request to the clinic owner for approval.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Leave Date</Label>
              <DatePicker
                value={leaveDate}
                onChange={(d) => setLeaveDate(d)}
                minDate={todayStr}
                timeZone={timeZone}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-reason">Reason (Optional)</Label>
              <Input
                id="leave-reason"
                placeholder="e.g. Medical conference, personal..."
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                maxLength={200}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>
              Cancel
            </Button>
            <Button
              disabled={requestLeaveMutation.isPending}
              onClick={() => requestLeaveMutation.mutate()}
            >
              {requestLeaveMutation.isPending && (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              )}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
