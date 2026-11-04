import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarX, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/careflow/date-picker";
import { toast } from "@/lib/toast";
import { markDoctorAbsentFn } from "@/lib/attendance.functions";
import { doctorsQuery } from "@/lib/team-queries";
import { affectedAppointmentsQuery, clinicHoursQuery } from "@/lib/appointment-queries";
import { getClinicLocalDate } from "@/lib/appointments";
import type { AffectedAppointmentSummary } from "@/lib/attendance.server";

interface MarkDoctorAbsentDialogProps {
  userId: string;
  clinicId: string;
  doctorProfileId?: string | undefined;
  doctorName?: string | undefined;
  defaultDate?: string | undefined;
  trigger?: React.ReactNode | undefined;
  onSuccess?: (() => void) | undefined;
}

const COMMON_REASONS = [
  "Did not show up (Unplanned absence)",
  "Emergency medical leave",
  "Family emergency",
  "Sudden illness / unwell",
  "Personal emergency",
];

export function MarkDoctorAbsentDialog({
  userId,
  clinicId,
  doctorProfileId: initialDoctorId,
  doctorName: initialDoctorName,
  defaultDate,
  trigger,
  onSuccess,
}: MarkDoctorAbsentDialogProps) {
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();
  const markAbsent = useServerFn(markDoctorAbsentFn);

  // Clinic timezone
  const { data: clinicHours } = useQuery(clinicHoursQuery(userId, clinicId));
  const timeZone = clinicHours?.timezone || "Asia/Kolkata";
  const todayStr = getClinicLocalDate(new Date(), timeZone);

  // Form state
  const [selectedDoctorId, setSelectedDoctorId] = React.useState<string>(initialDoctorId || "");
  const [date, setDate] = React.useState<string>(defaultDate || todayStr);
  const [reason, setReason] = React.useState<string>(COMMON_REASONS[0]!);
  const [customReason, setCustomReason] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);

  // Doctors list if not pre-selected
  const { data: doctorsData } = useQuery(
    doctorsQuery(userId, clinicId, { status: "ACTIVE", page: 0, search: "" })
  );
  const doctors = doctorsData?.rows ?? [];

  // Update doctor if prop changes or defaults
  React.useEffect(() => {
    if (initialDoctorId) {
      setSelectedDoctorId(initialDoctorId);
    } else if (doctors.length > 0 && !selectedDoctorId) {
      setSelectedDoctorId(doctors[0]!.id);
    }
  }, [initialDoctorId, doctors, selectedDoctorId]);

  // Query affected appointments
  const { data: affectedAppointments } = useQuery({
    ...affectedAppointmentsQuery(userId, clinicId, date, selectedDoctorId),
    enabled: open && Boolean(selectedDoctorId) && Boolean(date),
  });

  const finalReason = reason === "Other" ? customReason.trim() : reason;

  const mutation = useMutation({
    mutationFn: async () => {
      setError(null);
      if (!selectedDoctorId) {
        throw new Error("Please select a doctor.");
      }
      if (!date) {
        throw new Error("Please select a date.");
      }
      if (!finalReason) {
        throw new Error("Please provide a reason for the absence.");
      }

      const res = await markAbsent({
        data: {
          clinicId,
          doctorProfileId: selectedDoctorId,
          date,
          reason: finalReason,
        },
      });

      return res as {
        record: unknown;
        affectedAppointments: AffectedAppointmentSummary[];
        isCorrection: boolean;
      };
    },
    onSuccess: async (res) => {
      const docName =
        initialDoctorName ||
        doctors.find((d) => d.id === selectedDoctorId)?.display_name ||
        "Doctor";

      const affectedCount = res.affectedAppointments.length;
      toast.success({
        title: res.isCorrection
          ? `${docName} attendance updated to Absent for ${date}.`
          : `${docName} marked absent for ${date}.`,
        description:
          affectedCount > 0
            ? `Notice: ${affectedCount} appointment${affectedCount === 1 ? "" : "s"} scheduled for this date.`
            : undefined,
      });

      // Invalidate relevant queries
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["attendance-date"] }),
        qc.invalidateQueries({ queryKey: ["attendance-analytics"] }),
        qc.invalidateQueries({ queryKey: ["doctors"] }),
        qc.invalidateQueries({ queryKey: ["doctor-available-slots"] }),
        qc.invalidateQueries({ queryKey: ["appointments"] }),
        qc.invalidateQueries({ queryKey: ["affected-appointments"] }),
      ]);

      setOpen(false);
      onSuccess?.();
    },
    onError: (err: any) => {
      setError(err?.message || "Failed to mark doctor absent. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2 text-destructive hover:bg-destructive/10">
            <CalendarX className="size-4" />
            Mark doctor absent
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <CalendarX className="size-5 text-destructive" />
            Mark Doctor Absent
          </DialogTitle>
          <DialogDescription className="text-xs">
            Record an emergency absence or no-show. The doctor will be set to unavailable for
            appointments on this date.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Doctor selector */}
          {!initialDoctorId && (
            <div className="space-y-1.5">
              <Label htmlFor="doctor-select" className="text-xs font-medium">
                Doctor
              </Label>
              <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
                <SelectTrigger id="doctor-select" className="w-full">
                  <SelectValue placeholder="Select doctor" />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.display_name || "Doctor"} ({d.specialization})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date picker */}
          <div className="space-y-1.5">
            <Label htmlFor="absence-date" className="text-xs font-medium">
              Absence Date
            </Label>
            <DatePicker
              id="absence-date"
              value={date}
              onChange={setDate}
              timeZone={timeZone}
              className="w-full"
            />
          </div>

          {/* Reason selector */}
          <div className="space-y-1.5">
            <Label htmlFor="reason-select" className="text-xs font-medium">
              Absence Reason
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="reason-select" className="w-full">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
                <SelectItem value="Other">Other (Custom note)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {reason === "Other" && (
            <div className="space-y-1.5">
              <Label htmlFor="custom-reason" className="text-xs font-medium">
                Custom Reason Note
              </Label>
              <Input
                id="custom-reason"
                maxLength={500}
                placeholder="Describe reason for absence"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
              />
            </div>
          )}

          {/* Warning for affected appointments */}
          {affectedAppointments && affectedAppointments.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
              <AlertTriangle className="size-4 shrink-0 text-warning" />
              <div>
                <p className="font-medium text-warning">
                  {affectedAppointments.length} appointment
                  {affectedAppointments.length === 1 ? "" : "s"} scheduled on this date
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Marking absent will prevent new bookings. Please contact affected patients to
                  reschedule.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={mutation.isPending}
              className="gap-1.5"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Recording…
                </>
              ) : (
                "Mark Absent"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
