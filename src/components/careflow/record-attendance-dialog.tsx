import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserCheck, UserX, Loader2, CheckCircle2 } from "lucide-react";
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
import { recordAttendanceFn } from "@/lib/attendance.functions";
import type { AttendanceStatus, AttendanceDisplayStatus } from "@/lib/attendance";

interface RecordAttendanceDialogProps {
  clinicId: string;
  userId: string; // Target member's user_id
  memberName: string;
  role: "DOCTOR" | "STAFF";
  date: string;
  currentStatus?: AttendanceDisplayStatus | undefined;
  currentReason?: string | null | undefined;
  timeZone?: string | undefined;
  trigger?: React.ReactNode | undefined;
  onSuccess?: (() => void) | undefined;
}

export function RecordAttendanceDialog({
  clinicId,
  userId,
  memberName,
  role,
  date: initialDate,
  currentStatus,
  currentReason,
  timeZone = "Asia/Kolkata",
  trigger,
  onSuccess,
}: RecordAttendanceDialogProps) {
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();
  const recordFn = useServerFn(recordAttendanceFn);

  const [date, setDate] = React.useState(initialDate);
  const [status, setStatus] = React.useState<AttendanceStatus>(
    currentStatus === "ABSENT" ? "ABSENT" : "PRESENT"
  );
  const [reason, setReason] = React.useState(currentReason || "");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setDate(initialDate);
      setStatus(currentStatus === "ABSENT" ? "ABSENT" : "PRESENT");
      setReason(currentReason || "");
      setError(null);
    }
  }, [open, initialDate, currentStatus, currentReason]);

  const mutation = useMutation({
    mutationFn: async () => {
      setError(null);
      if (!date) throw new Error("Please select a date.");

      return recordFn({
        data: {
          clinicId,
          userId,
          role,
          date,
          status,
          reason: reason.trim() || undefined,
        },
      });
    },
    onSuccess: async (res) => {
      toast.success({
        title: res.isCorrection
          ? `Attendance updated for ${memberName} (${status === "PRESENT" ? "Present" : "Absent"}).`
          : `Attendance recorded for ${memberName} (${status === "PRESENT" ? "Present" : "Absent"}).`,
      });

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["attendance-date"] }),
        qc.invalidateQueries({ queryKey: ["attendance-analytics"] }),
        qc.invalidateQueries({ queryKey: ["doctors"] }),
        qc.invalidateQueries({ queryKey: ["staff"] }),
        qc.invalidateQueries({ queryKey: ["doctor-available-slots"] }),
      ]);

      setOpen(false);
      onSuccess?.();
    },
    onError: (err: any) => {
      setError(err?.message || "Failed to save attendance record.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="h-8 text-xs">
            {currentStatus === "UNRECORDED" ? "Mark" : "Edit"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            {status === "PRESENT" ? (
              <UserCheck className="size-5 text-success" />
            ) : (
              <UserX className="size-5 text-destructive" />
            )}
            Attendance: {memberName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {currentStatus && currentStatus !== "UNRECORDED"
              ? `Correct or update attendance status for ${role.toLowerCase()}.`
              : `Record present or absent attendance for this ${role.toLowerCase()}.`}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4 py-2"
        >
          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="att-date" className="text-xs font-medium">
              Date
            </Label>
            <DatePicker
              id="att-date"
              value={date}
              onChange={setDate}
              timeZone={timeZone}
              className="w-full"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="att-status" className="text-xs font-medium">
              Attendance Status
            </Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AttendanceStatus)}>
              <SelectTrigger id="att-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRESENT">
                  <div className="flex items-center gap-2 text-success font-medium">
                    <CheckCircle2 className="size-4" /> Present
                  </div>
                </SelectItem>
                <SelectItem value="ABSENT">
                  <div className="flex items-center gap-2 text-destructive font-medium">
                    <UserX className="size-4" /> Absent
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="att-reason" className="text-xs font-medium">
              Note / Reason (Optional)
            </Label>
            <Input
              id="att-reason"
              maxLength={500}
              placeholder={status === "ABSENT" ? "e.g. Unwell, Emergency leave" : "Optional note"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

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
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Attendance"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
