import { useState, useEffect, useMemo } from "react";
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
  Mail,
  Activity,
  Search,
  X,
  Eye,
  UserCheck,
  ArrowUpDown,
  Filter,
  FileText,
  AlertCircle,
  Building2,
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
import { queueEntriesQuery, clinicHoursQuery, appointmentsQuery, clinicQueueDoctorsQuery } from "@/lib/appointment-queries";
import {
  transitionClinicQueue,
  callNextClinicPatient,
  checkInClinicPatient,
  reassignClinicQueueDoctor,
} from "@/lib/appointments.functions";
import {
  formatQueueNumber,
  formatSlotLabel12h,
  formatTime12h,
  getClinicLocalDate,
  queueStatusLabel,
  appointmentTypeLabel,
  type QueueEntryWithDetails,
  type QueueStatus,
} from "@/lib/appointments";

interface QueueManagementProps {
  userId: string;
  clinicId: string;
  role: "OWNER" | "STAFF";
}

type SortOption = "queue_asc" | "queue_desc" | "time_asc" | "time_desc" | "name_asc";

export function QueueManagement({ userId, clinicId, role }: QueueManagementProps) {
  const qc = useQueryClient();
  const transitionFn = useServerFn(transitionClinicQueue);
  const callNextFn = useServerFn(callNextClinicPatient);
  const checkInFn = useServerFn(checkInClinicPatient);
  const reassignFn = useServerFn(reassignClinicQueueDoctor);

  // Clinic metadata for timezone
  const { data: clinicHoursData } = useQuery(clinicHoursQuery(userId, clinicId));
  const timeZone = clinicHoursData?.timezone || "Asia/Kolkata";

  const [selectedDate, setSelectedDate] = useState<string>(() =>
    getClinicLocalDate(new Date(), timeZone)
  );
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("ALL");

  // Parity: Search, Filter, Sort State
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<SortOption>("queue_asc");

  // Dialog States
  const [isCheckInOpen, setIsCheckInOpen] = useState<boolean>(false);
  const [checkInSearch, setCheckInSearch] = useState<string>("");
  const [checkInTargetId, setCheckInTargetId] = useState<string | null>(null);

  const [detailsTarget, setDetailsTarget] = useState<QueueEntryWithDetails | null>(null);

  const [reassignTarget, setReassignTarget] = useState<QueueEntryWithDetails | null>(null);
  const [reassignDoctorId, setReassignDoctorId] = useState<string>("");

  const [actionTarget, setActionTarget] = useState<{
    entry: QueueEntryWithDetails;
    type: "SKIP" | "NO_SHOW" | "RETURN";
  } | null>(null);

  const [vitalsTarget, setVitalsTarget] = useState<QueueEntryWithDetails | null>(null);

  useEffect(() => {
    if (timeZone) {
      setSelectedDate((prev) => (prev ? prev : getClinicLocalDate(new Date(), timeZone)));
    }
  }, [timeZone]);

  // Queries - Uses operational clinicQueueDoctorsQuery which allows OWNER, STAFF, DOCTOR
  const { data: doctorsData } = useQuery(
    clinicQueueDoctorsQuery(userId, clinicId, { search: "", status: "ACTIVE", page: 0 })
  );

  const { data: queueData, isLoading } = useQuery(
    queueEntriesQuery(
      userId,
      clinicId,
      selectedDate,
      selectedDoctorId === "ALL" ? undefined : selectedDoctorId
    )
  );

  // Today's scheduled appointments for direct check-in modal
  const { data: scheduledAppointmentsData, isLoading: loadingCheckInAppts } = useQuery({
    ...appointmentsQuery(userId, clinicId, {
      date: selectedDate,
      doctor_id: "",
      search: "",
      status: "ALL",
      page: 0,
    }),
    enabled: isCheckInOpen,
  });

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
      if (detailsTarget?.id === vars.queueEntryId) {
        setDetailsTarget((prev) => (prev ? { ...prev, status: vars.newStatus } : null));
      }
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

  const checkInMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      setCheckInTargetId(appointmentId);
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
      setCheckInTargetId(null);
      qc.invalidateQueries({ queryKey: ["queue-entries", clinicId] });
      qc.invalidateQueries({ queryKey: ["appointments", clinicId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to check in patient.");
      setCheckInTargetId(null);
    },
  });

  const reassignMutation = useMutation({
    mutationFn: async ({
      queueEntryId,
      newDoctorProfileId,
    }: {
      queueEntryId: string;
      newDoctorProfileId: string;
    }) => {
      return reassignFn({
        data: {
          clinicId,
          queueEntryId,
          newDoctorProfileId,
        },
      });
    },
    onSuccess: (res) => {
      const qNum = formatQueueNumber(res.queue_number);
      toast.success(`Doctor reassigned! Assigned Queue #${qNum} for the new doctor.`);
      setReassignTarget(null);
      if (detailsTarget?.id === res.id) {
        setDetailsTarget(null);
      }
      qc.invalidateQueries({ queryKey: ["queue-entries", clinicId] });
      qc.invalidateQueries({ queryKey: ["appointments", clinicId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to reassign doctor.");
    },
  });

  const doctors = doctorsData?.rows ?? [];
  const queueEntries = queueData ?? [];

  // Filter eligible candidate doctors for reassignment (same specialization or clinical department)
  const eligibleReassignDoctors = useMemo(() => {
    if (!reassignTarget) return [];
    const targetSpec = reassignTarget.doctor?.specialization?.trim().toLowerCase();
    const targetDept = reassignTarget.doctor?.department?.trim().toLowerCase();

    return doctors.filter((candidate) => {
      // 1. Cannot reassign to the currently assigned doctor
      if (candidate.id === reassignTarget.doctor_profile_id) return false;
      // 2. Must be ACTIVE
      if (candidate.status && candidate.status !== "ACTIVE") return false;

      // 3. Same specialization or department
      const candidateSpec = candidate.specialization?.trim().toLowerCase();
      const sameSpec = Boolean(targetSpec && candidateSpec && targetSpec === candidateSpec);

      const candidateDept = candidate.department?.trim().toLowerCase();
      const sameDept = Boolean(targetDept && candidateDept && targetDept === candidateDept);

      return sameSpec || sameDept;
    });
  }, [doctors, reassignTarget]);

  const openReassignDialog = (entry: QueueEntryWithDetails) => {
    setReassignTarget(entry);
    const targetSpec = entry.doctor?.specialization?.trim().toLowerCase();
    const targetDept = entry.doctor?.department?.trim().toLowerCase();
    const eligible = doctors.filter((candidate) => {
      if (candidate.id === entry.doctor_profile_id) return false;
      if (candidate.status && candidate.status !== "ACTIVE") return false;
      const candidateSpec = candidate.specialization?.trim().toLowerCase();
      const sameSpec = Boolean(targetSpec && candidateSpec && targetSpec === candidateSpec);
      const candidateDept = candidate.department?.trim().toLowerCase();
      const sameDept = Boolean(targetDept && candidateDept && targetDept === candidateDept);
      return sameSpec || sameDept;
    });
    setReassignDoctorId(eligible[0]?.id ?? "");
  };

  // Group queue entries by doctor for unified overview
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

  // Calculate status counts for filter
  const statusCounts = useMemo(() => {
    return {
      ALL: queueEntries.length,
      WAITING: queueEntries.filter((e) => e.status === "WAITING").length,
      CALLED: queueEntries.filter((e) => e.status === "CALLED").length,
      IN_CONSULTATION: queueEntries.filter((e) => e.status === "IN_CONSULTATION").length,
      COMPLETED: queueEntries.filter((e) => e.status === "COMPLETED").length,
      SKIPPED: queueEntries.filter((e) => e.status === "SKIPPED").length,
      CANCELLED: queueEntries.filter((e) => e.status === "CANCELLED").length,
    };
  }, [queueEntries]);

  // Filtered & Sorted Queue Entries
  const filteredAndSortedEntries = useMemo(() => {
    let result = queueEntries;

    // 1. Status Filter
    if (statusFilter !== "ALL") {
      result = result.filter((e) => e.status === statusFilter);
    }

    // 2. Search Query Filter
    const term = searchQuery.trim().toLowerCase();
    if (term) {
      result = result.filter((e) => {
        const qNumStr = String(e.queue_number);
        const qNumPadded = formatQueueNumber(e.queue_number);
        const firstName = e.patient?.first_name?.toLowerCase() ?? "";
        const lastName = e.patient?.last_name?.toLowerCase() ?? "";
        const fullName = `${firstName} ${lastName}`.trim();
        const patientNum = e.patient?.patient_number?.toLowerCase() ?? "";
        const phone = e.patient?.phone?.toLowerCase() ?? "";
        const docName = e.doctor?.display_name?.toLowerCase() ?? "";

        return (
          qNumStr.includes(term) ||
          qNumPadded.includes(term) ||
          `#${qNumPadded}`.includes(term) ||
          firstName.includes(term) ||
          lastName.includes(term) ||
          fullName.includes(term) ||
          patientNum.includes(term) ||
          `#${patientNum}`.includes(term) ||
          phone.includes(term) ||
          docName.includes(term)
        );
      });
    }

    // 3. Sorting
    return [...result].sort((a, b) => {
      switch (sortBy) {
        case "queue_desc":
          return b.queue_number - a.queue_number;
        case "time_asc": {
          const aTime = a.checked_in_at ? new Date(a.checked_in_at).getTime() : 0;
          const bTime = b.checked_in_at ? new Date(b.checked_in_at).getTime() : 0;
          return aTime - bTime;
        }
        case "time_desc": {
          const aTime = a.checked_in_at ? new Date(a.checked_in_at).getTime() : 0;
          const bTime = b.checked_in_at ? new Date(b.checked_in_at).getTime() : 0;
          return bTime - aTime;
        }
        case "name_asc":
          return (a.patient?.first_name ?? "").localeCompare(b.patient?.first_name ?? "");
        case "queue_asc":
        default:
          return a.queue_number - b.queue_number;
      }
    });
  }, [queueEntries, statusFilter, searchQuery, sortBy]);

  // Appointments eligible for direct check-in (SCHEDULED / CONFIRMED)
  const checkInEligibleAppointments = useMemo(() => {
    const list = scheduledAppointmentsData?.rows ?? [];
    const pending = list.filter(
      (a) => a.status === "SCHEDULED" || a.status === "CONFIRMED"
    );

    const term = checkInSearch.trim().toLowerCase();
    if (!term) return pending;

    return pending.filter((a) => {
      const firstName = a.patient?.first_name?.toLowerCase() ?? "";
      const lastName = a.patient?.last_name?.toLowerCase() ?? "";
      const fullName = `${firstName} ${lastName}`.trim();
      const patientNum = a.patient?.patient_number?.toLowerCase() ?? "";
      const phone = a.patient?.phone?.toLowerCase() ?? "";
      const docName = a.doctor?.display_name?.toLowerCase() ?? "";

      return (
        firstName.includes(term) ||
        lastName.includes(term) ||
        fullName.includes(term) ||
        patientNum.includes(term) ||
        phone.includes(term) ||
        docName.includes(term)
      );
    });
  }, [scheduledAppointmentsData, checkInSearch]);

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

  const getWaitDurationMinutes = (entry: QueueEntryWithDetails) => {
    if (!entry.checked_in_at) return null;
    const end = entry.consultation_started_at
      ? new Date(entry.consultation_started_at).getTime()
      : entry.completed_at
      ? new Date(entry.completed_at).getTime()
      : Date.now();
    const start = new Date(entry.checked_in_at).getTime();
    const mins = Math.max(0, Math.floor((end - start) / 60000));
    return mins;
  };

  return (
    <div className="space-y-6">
      {/* Header with Parity Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageTitle
          title="Patient Queue"
          description="Live queue tracking, patient check-ins, and doctor queue progression."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setIsCheckInOpen(true)} className="gap-1.5">
            <UserCheck className="size-4" />
            Check In Patient
          </Button>
          <Button asChild variant="outline">
            <Link to={role === "STAFF" ? "/staff/appointments" : "/clinic/appointments"}>
              <Calendar className="mr-1.5 size-4" />
              Appointments
            </Link>
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4 shadow-sm">
        {/* DatePicker */}
        <div className="w-52">
          <DatePicker
            value={selectedDate}
            onChange={(d) => setSelectedDate(d)}
            timeZone={timeZone}
            placeholder="Select queue date"
          />
        </div>

        {/* Doctor Filter */}
        <div className="flex items-center gap-1.5">
          <Stethoscope className="size-4 text-muted-foreground" />
          <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
            <SelectTrigger className="w-[190px] h-9">
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

        {/* Status Filter */}
        <div className="flex items-center gap-1.5">
          <Filter className="size-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses ({statusCounts.ALL})</SelectItem>
              <SelectItem value="WAITING">Waiting ({statusCounts.WAITING})</SelectItem>
              <SelectItem value="CALLED">Called ({statusCounts.CALLED})</SelectItem>
              <SelectItem value="IN_CONSULTATION">In Room ({statusCounts.IN_CONSULTATION})</SelectItem>
              <SelectItem value="COMPLETED">Completed ({statusCounts.COMPLETED})</SelectItem>
              <SelectItem value="SKIPPED">Skipped ({statusCounts.SKIPPED})</SelectItem>
              <SelectItem value="CANCELLED">No Show / Cancelled ({statusCounts.CANCELLED})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Live Search Input */}
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patient, phone, #ID, queue #..."
            className="h-9 pl-8 pr-8"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Sorting Dropdown */}
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="size-4 text-muted-foreground" />
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="queue_asc">Queue # (Ascending)</SelectItem>
              <SelectItem value="queue_desc">Queue # (Descending)</SelectItem>
              <SelectItem value="time_asc">Check-in: Earliest First</SelectItem>
              <SelectItem value="time_desc">Check-in: Latest First</SelectItem>
              <SelectItem value="name_asc">Patient Name (A to Z)</SelectItem>
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
                        <span className="truncate pr-1">
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
                        <span className="truncate pr-1">
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
                      <span className="mt-0.5 block font-medium text-foreground truncate">
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
          description="Check in scheduled patients to add them to today's queue."
          action={
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setIsCheckInOpen(true)}>
                <UserCheck className="mr-1.5 size-4" />
                Check In Patient
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to={role === "STAFF" ? "/staff/appointments" : "/clinic/appointments"}>
                  Go to Appointments
                </Link>
              </Button>
            </div>
          }
        />
      ) : filteredAndSortedEntries.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-foreground">No matching queue entries found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No patients match your current search or status filters.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("ALL");
            }}
          >
            Clear Filters
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden shadow-sm">
          <div className="border-b bg-muted/40 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-foreground text-sm">
                Today&apos;s Active Queue ({filteredAndSortedEntries.length} of {queueEntries.length} Patients)
              </h3>
              {(searchQuery || statusFilter !== "ALL") && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Filtered by: {statusFilter !== "ALL" ? `Status: ${queueStatusLabel[statusFilter as QueueStatus]}` : ""}{" "}
                  {searchQuery ? `Search: "${searchQuery}"` : ""}
                </p>
              )}
            </div>
            <span className="text-xs text-muted-foreground font-mono">{selectedDate}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/20 text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Queue #</th>
                  <th className="px-4 py-2.5">Patient</th>
                  <th className="px-4 py-2.5">Doctor</th>
                  <th className="px-4 py-2.5">Appt Slot</th>
                  <th className="px-4 py-2.5">Check-in</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredAndSortedEntries.map((entry) => {
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
                  const waitMins = getWaitDurationMinutes(entry);

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
                        <div>{checkInTime}</div>
                        {(isWaiting || isCalled) && waitMins !== null && (
                          <div className="text-[10px] text-amber-600 font-sans">
                            {waitMins}m wait
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={getStatusTone(entry.status)}>
                          {queueStatusLabel[entry.status]}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* View Details Button */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDetailsTarget(entry)}
                            className="h-7 px-2 text-xs"
                            title="View patient & appointment details"
                          >
                            <Eye className="size-3 mr-1" />
                            Details
                          </Button>

                          {/* Vitals Button */}
                          {entry.appointment_id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setVitalsTarget(entry)}
                              className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-800"
                            >
                              <Activity className="size-3 mr-1 text-emerald-600" />
                              Vitals
                            </Button>
                          )}

                          {/* WAITING actions */}
                          {isWaiting && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  transitionMutation.mutate({
                                    queueEntryId: entry.id,
                                    newStatus: "CALLED",
                                  })
                                }
                                disabled={transitionMutation.isPending}
                                className="h-7 px-2 text-xs"
                              >
                                <ArrowRight className="size-3 mr-1" />
                                Call
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openReassignDialog(entry)}
                                className="h-7 px-2 text-xs"
                                title="Reassign to another doctor of same specialization"
                              >
                                <ArrowUpDown className="size-3 mr-1" />
                                Reassign
                              </Button>
                            </>
                          )}

                          {/* CALLED actions */}
                          {isCalled && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() =>
                                  transitionMutation.mutate({
                                    queueEntryId: entry.id,
                                    newStatus: "IN_CONSULTATION",
                                  })
                                }
                                disabled={transitionMutation.isPending}
                                className="h-7 px-2 text-xs"
                              >
                                <CheckCircle2 className="size-3 mr-1" />
                                In Room
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setActionTarget({ entry, type: "SKIP" })}
                                className="h-7 px-2 text-xs"
                              >
                                <SkipForward className="size-3 mr-1" />
                                Skip
                              </Button>
                            </>
                          )}

                          {/* SKIPPED actions */}
                          {isSkipped && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setActionTarget({ entry, type: "RETURN" })}
                                className="h-7 px-2 text-xs"
                              >
                                <RotateCcw className="size-3 mr-1" />
                                Return
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  transitionMutation.mutate({
                                    queueEntryId: entry.id,
                                    newStatus: "CALLED",
                                  })
                                }
                                disabled={transitionMutation.isPending}
                                className="h-7 px-2 text-xs"
                              >
                                <ArrowRight className="size-3 mr-1" />
                                Call
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openReassignDialog(entry)}
                                className="h-7 px-2 text-xs"
                                title="Reassign to another doctor of same specialization"
                              >
                                <ArrowUpDown className="size-3 mr-1" />
                                Reassign
                              </Button>
                            </>
                          )}

                          {/* IN_CONSULTATION actions */}
                          {isInRoom && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                transitionMutation.mutate({
                                  queueEntryId: entry.id,
                                  newStatus: "COMPLETED",
                                })
                              }
                              disabled={transitionMutation.isPending}
                              className="h-7 px-2 text-xs text-emerald-700"
                            >
                              <CheckCircle2 className="size-3 mr-1" />
                              Complete
                            </Button>
                          )}

                          {/* No Show for active states */}
                          {(isCalled || isWaiting || isSkipped) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setActionTarget({ entry, type: "NO_SHOW" })}
                              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
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

      {/* Direct Check In Patient Dialog */}
      <Dialog open={isCheckInOpen} onOpenChange={setIsCheckInOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="size-5 text-primary" />
              Check In Patient to Queue
            </DialogTitle>
            <DialogDescription>
              Select a scheduled appointment for {selectedDate} to check the patient into the live queue.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={checkInSearch}
                onChange={(e) => setCheckInSearch(e.target.value)}
                placeholder="Search appointment by patient name, #ID, phone, or doctor..."
                className="h-9 pl-8 pr-8"
              />
              {checkInSearch && (
                <button
                  type="button"
                  onClick={() => setCheckInSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[200px]">
            {loadingCheckInAppts ? (
              <LoadingState label="Loading scheduled appointments..." />
            ) : checkInEligibleAppointments.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <AlertCircle className="mx-auto size-8 text-muted-foreground/60" />
                <p className="mt-2 text-sm font-semibold text-foreground">
                  No appointments ready for check-in
                </p>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                  {checkInSearch
                    ? "No scheduled appointments match your search."
                    : `There are no un-checked-in scheduled appointments for ${selectedDate}.`}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    onClick={() => setIsCheckInOpen(false)}
                  >
                    <Link to={role === "STAFF" ? "/staff/appointments" : "/clinic/appointments"}>
                      <Plus className="mr-1 size-3.5" />
                      Book New Appointment
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    onClick={() => setIsCheckInOpen(false)}
                  >
                    <Link to={role === "STAFF" ? "/staff/patients" : "/clinic/patients/new"}>
                      <Users className="mr-1 size-3.5" />
                      Register Patient
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {checkInEligibleAppointments.map((appt) => {
                  const isCheckingIn = checkInTargetId === appt.id && checkInMutation.isPending;
                  const slotLabel = appt.scheduled_start
                    ? formatSlotLabel12h(appt.scheduled_start, appt.scheduled_end, timeZone)
                    : "--";

                  return (
                    <div
                      key={appt.id}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-sm hover:border-primary/40 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground truncate">
                            {appt.patient?.first_name} {appt.patient?.last_name ?? ""}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            #{appt.patient?.patient_number}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 font-medium text-foreground">
                            <Clock className="size-3" />
                            {slotLabel}
                          </span>
                          <span className="flex items-center gap-1">
                            <Stethoscope className="size-3" />
                            {appt.doctor?.display_name ?? "Doctor"} ({appt.doctor?.specialization})
                          </span>
                          {appt.patient?.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="size-3" />
                              {appt.patient.phone}
                            </span>
                          )}
                        </div>
                        {appt.reason && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            Reason: {appt.reason}
                          </p>
                        )}
                      </div>

                      <Button
                        size="sm"
                        disabled={isCheckingIn || checkInMutation.isPending}
                        onClick={() => checkInMutation.mutate(appt.id)}
                        className="shrink-0 gap-1.5"
                      >
                        {isCheckingIn ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <UserCheck className="size-3.5" />
                        )}
                        Check In
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="mt-4 border-t pt-3 flex items-center justify-between sm:justify-between">
            <span className="text-xs text-muted-foreground">
              {checkInEligibleAppointments.length} appointment(s) available for check-in
            </span>
            <Button variant="outline" onClick={() => setIsCheckInOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={Boolean(detailsTarget)} onOpenChange={(o) => !o && setDetailsTarget(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          {detailsTarget && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-3 pr-6">
                  <DialogTitle className="flex items-center gap-2">
                    <span className="font-mono text-primary font-bold">
                      Queue #{formatQueueNumber(detailsTarget.queue_number)}
                    </span>
                    <span>Patient Details</span>
                  </DialogTitle>
                  <StatusBadge tone={getStatusTone(detailsTarget.status)}>
                    {queueStatusLabel[detailsTarget.status]}
                  </StatusBadge>
                </div>
                <DialogDescription>
                  Full clinical queue and visit profile for this patient.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2 text-sm">
                {/* Patient Information Section */}
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Users className="size-3.5 text-primary" />
                    Patient Information
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground block">Full Name:</span>
                      <span className="font-medium text-foreground">
                        {detailsTarget.patient?.first_name} {detailsTarget.patient?.last_name ?? ""}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Patient ID:</span>
                      <span className="font-mono font-medium text-foreground">
                        #{detailsTarget.patient?.patient_number}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Phone:</span>
                      <span className="font-medium text-foreground">
                        {detailsTarget.patient?.phone || "Not provided"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Gender:</span>
                      <span className="font-medium text-foreground">
                        {detailsTarget.patient?.gender || "--"}
                      </span>
                    </div>
                    {detailsTarget.patient?.email && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground block">Email:</span>
                        <span className="font-medium text-foreground">
                          {detailsTarget.patient.email}
                        </span>
                      </div>
                    )}
                    {detailsTarget.patient?.emergency_contact_name && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground block">Emergency Contact:</span>
                        <span className="font-medium text-foreground">
                          {detailsTarget.patient.emergency_contact_name}{" "}
                          {detailsTarget.patient.emergency_contact_phone
                            ? `(${detailsTarget.patient.emergency_contact_phone})`
                            : ""}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Assigned Doctor Section */}
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Stethoscope className="size-3.5 text-primary" />
                    Assigned Doctor
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground block">Doctor:</span>
                      <span className="font-medium text-foreground">
                        {detailsTarget.doctor?.display_name ?? "Doctor"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Specialization:</span>
                      <span className="font-medium text-foreground">
                        {detailsTarget.doctor?.specialization ?? "General"}
                      </span>
                    </div>
                    {detailsTarget.doctor?.department && (
                      <div>
                        <span className="text-muted-foreground block">Department:</span>
                        <span className="font-medium text-foreground">
                          {detailsTarget.doctor.department}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Appointment Information (if linked) */}
                {detailsTarget.appointment && (
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="size-3.5 text-primary" />
                      Appointment Booking
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground block">Type:</span>
                        <span className="font-medium text-foreground">
                          {detailsTarget.appointment.appointment_type
                            ? appointmentTypeLabel[detailsTarget.appointment.appointment_type]
                            : "Consultation"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Scheduled Slot:</span>
                        <span className="font-medium text-foreground font-mono">
                          {detailsTarget.appointment.scheduled_start
                            ? formatSlotLabel12h(
                                detailsTarget.appointment.scheduled_start,
                                detailsTarget.appointment.scheduled_end,
                                timeZone
                              )
                            : "--"}
                        </span>
                      </div>
                      {detailsTarget.appointment.reason && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground block">Chief Complaint / Reason:</span>
                          <span className="font-medium text-foreground">
                            {detailsTarget.appointment.reason}
                          </span>
                        </div>
                      )}
                      {detailsTarget.appointment.notes && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground block">Booking Notes:</span>
                          <span className="font-medium text-foreground">
                            {detailsTarget.appointment.notes}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Queue Timestamps */}
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Clock className="size-3.5 text-primary" />
                    Queue Timestamps
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground block">Checked In:</span>
                      <span className="font-medium font-mono text-foreground">
                        {detailsTarget.checked_in_at
                          ? formatTime12h(detailsTarget.checked_in_at, timeZone)
                          : "--"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Called into Room:</span>
                      <span className="font-medium font-mono text-foreground">
                        {detailsTarget.called_at
                          ? formatTime12h(detailsTarget.called_at, timeZone)
                          : "--"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Consultation Started:</span>
                      <span className="font-medium font-mono text-foreground">
                        {detailsTarget.consultation_started_at
                          ? formatTime12h(detailsTarget.consultation_started_at, timeZone)
                          : "--"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Completed:</span>
                      <span className="font-medium font-mono text-foreground">
                        {detailsTarget.completed_at
                          ? formatTime12h(detailsTarget.completed_at, timeZone)
                          : "--"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <div className="flex items-center gap-2">
                  {detailsTarget.appointment_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setVitalsTarget(detailsTarget);
                        setDetailsTarget(null);
                      }}
                      className="text-xs"
                    >
                      <Activity className="size-3.5 mr-1 text-emerald-600" />
                      Record Vitals
                    </Button>
                  )}
                  {(detailsTarget.status === "WAITING" || detailsTarget.status === "SKIPPED") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const target = detailsTarget;
                        setDetailsTarget(null);
                        openReassignDialog(target);
                      }}
                      className="text-xs"
                    >
                      <ArrowUpDown className="size-3.5 mr-1" />
                      Reassign Doctor
                    </Button>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setDetailsTarget(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Doctor Reassignment Dialog */}
      <Dialog open={Boolean(reassignTarget)} onOpenChange={(o) => !o && setReassignTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpDown className="size-5 text-primary" />
              Reassign Doctor
            </DialogTitle>
            <DialogDescription>
              Reassign Queue #{formatQueueNumber(reassignTarget?.queue_number ?? 0)} (
              {reassignTarget?.patient?.first_name} {reassignTarget?.patient?.last_name}) to another doctor on duty.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <div>
                <span className="text-muted-foreground">Current Doctor: </span>
                <span className="font-semibold text-foreground">
                  {reassignTarget?.doctor?.display_name ?? "Doctor"} ({reassignTarget?.doctor?.specialization})
                </span>
              </div>
              <p className="text-muted-foreground mt-1">
                The patient will be appended to the new doctor&apos;s waiting queue with a new sequential queue number for today.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Select New Doctor</label>
              {eligibleReassignDoctors.length === 0 ? (
                <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                  <AlertCircle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-semibold">No same-specialization doctors available</p>
                    <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                      No other doctors with the specialization &quot;{reassignTarget?.doctor?.specialization ?? "General"}&quot; or department are currently active on duty.
                    </p>
                  </div>
                </div>
              ) : (
                <Select value={reassignDoctorId} onValueChange={setReassignDoctorId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose doctor of same specialization" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleReassignDoctors.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.display_name ?? "Doctor"} ({d.specialization})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={!reassignDoctorId || eligibleReassignDoctors.length === 0 || reassignMutation.isPending}
              onClick={() => {
                if (!reassignTarget || !reassignDoctorId) return;
                reassignMutation.mutate({
                  queueEntryId: reassignTarget.id,
                  newDoctorProfileId: reassignDoctorId,
                });
              }}
            >
              {reassignMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Confirm Reassignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
