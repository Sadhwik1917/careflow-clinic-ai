import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Clock,
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CalendarX2,
  UserCheck,
  UserX,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { FormAlert } from "@/components/careflow/auth-ui";
import { LoadingState } from "@/components/careflow/feedback";
import { DatePicker } from "@/components/careflow/date-picker";
import {
  clinicHoursQuery,
  clinicDoctorLeavesQuery,
  affectedAppointmentsQuery,
} from "@/lib/appointment-queries";
import {
  updateClinicHoursSettings,
  setClinicDateOpen,
  reviewDoctorLeaveFn,
} from "@/lib/appointments.functions";
import { getClinicLocalDate, formatTime12h } from "@/lib/appointments";

interface ClinicScheduleSettingsProps {
  userId: string;
  clinicId: string;
}

export function ClinicScheduleSettings({ userId, clinicId }: ClinicScheduleSettingsProps) {
  const qc = useQueryClient();
  const updateHoursFn = useServerFn(updateClinicHoursSettings);
  const setDateOpenFn = useServerFn(setClinicDateOpen);
  const reviewLeaveFn = useServerFn(reviewDoctorLeaveFn);

  const hoursQuery = useQuery(clinicHoursQuery(userId, clinicId));
  const leavesQuery = useQuery(clinicDoctorLeavesQuery(userId, clinicId));

  // Form states for working hours
  const [openingTime, setOpeningTime] = useState("09:00");
  const [closingTime, setClosingTime] = useState("18:00");
  const [breakEnabled, setBreakEnabled] = useState(false);
  const [breakStart, setBreakStart] = useState("13:00");
  const [breakEnd, setBreakEnd] = useState("14:00");
  const [hoursSuccess, setHoursSuccess] = useState<string | null>(null);
  const [hoursError, setHoursError] = useState<string | null>(null);

  // Planned closure date
  const [closureDate, setClosureDate] = useState("");
  const [closureSuccess, setClosureSuccess] = useState<string | null>(null);
  const [closureError, setClosureError] = useState<string | null>(null);

  // Load initial settings when query resolves
  useEffect(() => {
    if (hoursQuery.data?.working_hours) {
      const wh = hoursQuery.data.working_hours;
      if (wh.opening_time) setOpeningTime(wh.opening_time);
      if (wh.closing_time) setClosingTime(wh.closing_time);
      if (typeof wh.break_enabled === "boolean") setBreakEnabled(wh.break_enabled);
      if (wh.break_start) setBreakStart(wh.break_start);
      if (wh.break_end) setBreakEnd(wh.break_end);
    }
  }, [hoursQuery.data]);

  const timezone = hoursQuery.data?.timezone || "UTC";
  const todayStr = getClinicLocalDate(new Date(), timezone);

  const updateHoursMutation = useMutation({
    mutationFn: async () => {
      setHoursSuccess(null);
      setHoursError(null);
      if (openingTime >= closingTime) {
        throw new Error("Opening time must be strictly earlier than closing time.");
      }
      if (breakEnabled && breakStart >= breakEnd) {
        throw new Error("Break start time must be strictly earlier than break end time.");
      }
      return updateHoursFn({
        data: {
          clinicId,
          config: {
            opening_time: openingTime,
            closing_time: closingTime,
            break_enabled: breakEnabled,
            break_start: breakStart,
            break_end: breakEnd,
          },
        },
      });
    },
    onSuccess: async () => {
      setHoursSuccess("Operating hours and break settings updated successfully.");
      await qc.invalidateQueries({ queryKey: ["clinic-hours", clinicId] });
      await qc.invalidateQueries({ queryKey: ["doctor-availability", clinicId] });
    },
    onError: (err: any) => {
      setHoursError(err.message || "Failed to update operating hours.");
    },
  });

  const toggleClosureMutation = useMutation({
    mutationFn: async ({ date, isOpen }: { date: string; isOpen: boolean }) => {
      setClosureSuccess(null);
      setClosureError(null);
      return setDateOpenFn({
        data: {
          clinicId,
          date,
          isOpen,
        },
      });
    },
    onSuccess: async (_, vars) => {
      setClosureSuccess(
        vars.isOpen
          ? `Clinic reopened for ${vars.date}.`
          : `Clinic marked closed for ${vars.date}. Existing appointments remain preserved.`
      );
      await qc.invalidateQueries({ queryKey: ["clinic-hours", clinicId] });
      await qc.invalidateQueries({ queryKey: ["appointments", clinicId] });
      await qc.invalidateQueries({ queryKey: ["doctor-availability", clinicId] });
    },
    onError: (err: any) => {
      setClosureError(err.message || "Failed to update clinic date status.");
    },
  });

  const reviewLeaveMutation = useMutation({
    mutationFn: async ({
      doctorProfileId,
      leaveId,
      action,
    }: {
      doctorProfileId: string;
      leaveId: string;
      action: "APPROVE" | "REJECT";
    }) => {
      return reviewLeaveFn({
        data: {
          clinicId,
          doctorProfileId,
          leaveId,
          action,
        },
      });
    },
    onSuccess: async (_, vars) => {
      await qc.invalidateQueries({ queryKey: ["clinic-doctor-leaves", clinicId] });
      await qc.invalidateQueries({ queryKey: ["doctor-availability", clinicId] });
      await qc.invalidateQueries({ queryKey: ["appointments", clinicId] });
    },
  });

  // Query affected appointments if closure date is selected
  const affectedQuery = useQuery({
    ...affectedAppointmentsQuery(userId, clinicId, closureDate),
    enabled: !!closureDate,
  });

  if (hoursQuery.isPending) {
    return <LoadingState label="Loading clinic schedule settings…" />;
  }

  const closedDates = hoursQuery.data?.working_hours?.closed_dates || [];
  const futureClosedDates = closedDates.filter((d) => d >= todayStr).sort();
  const pastClosedDates = closedDates.filter((d) => d < todayStr).sort().reverse();
  const leaveRequests = leavesQuery.data || [];

  return (
    <div className="space-y-6">
      {/* 1. Operating Hours & Breaks */}
      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Clinic Operating Hours & Breaks</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Define bookable operating windows and break times. 1-hour appointment slots are
          automatically generated within these hours. Slots overlapping break times will not be
          offered.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Times are evaluated in the clinic's local timezone:{" "}
          <span className="font-semibold text-foreground">{timezone}</span>.
        </p>

        {hoursSuccess && (
          <div className="mt-3">
            <FormAlert tone="success">{hoursSuccess}</FormAlert>
          </div>
        )}
        {hoursError && (
          <div className="mt-3">
            <FormAlert tone="error">{hoursError}</FormAlert>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateHoursMutation.mutate();
          }}
          className="mt-4 space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="opening-time">Opening Time</Label>
              <Input
                id="opening-time"
                type="time"
                value={openingTime}
                onChange={(e) => setOpeningTime(e.target.value)}
                required
              />
              <span className="text-xs text-muted-foreground">
                Displays as {formatTime12h(openingTime)}
              </span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="closing-time">Closing Time</Label>
              <Input
                id="closing-time"
                type="time"
                value={closingTime}
                onChange={(e) => setClosingTime(e.target.value)}
                required
              />
              <span className="text-xs text-muted-foreground">
                Displays as {formatTime12h(closingTime)}
              </span>
            </div>
          </div>

          <div className="rounded-md border p-4 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="break-enabled" className="text-sm font-medium">
                  Enable Daily Break Time
                </Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, slots overlapping this break window will be excluded from booking.
                </p>
              </div>
              <Switch
                id="break-enabled"
                checked={breakEnabled}
                onCheckedChange={setBreakEnabled}
              />
            </div>

            {breakEnabled && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 border-t pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="break-start">Break Start Time</Label>
                  <Input
                    id="break-start"
                    type="time"
                    value={breakStart}
                    onChange={(e) => setBreakStart(e.target.value)}
                    required
                  />
                  <span className="text-xs text-muted-foreground">
                    Displays as {formatTime12h(breakStart)}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="break-end">Break End Time</Label>
                  <Input
                    id="break-end"
                    type="time"
                    value={breakEnd}
                    onChange={(e) => setBreakEnd(e.target.value)}
                    required
                  />
                  <span className="text-xs text-muted-foreground">
                    Displays as {formatTime12h(breakEnd)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <Button type="submit" disabled={updateHoursMutation.isPending}>
            {updateHoursMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Operating Hours
          </Button>
        </form>
      </section>

      {/* 2. Planned Clinic Closures */}
      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-center gap-2">
          <CalendarX2 className="h-5 w-5 text-destructive" />
          <h2 className="text-base font-semibold">Planned Clinic Closures</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a future date to mark the clinic closed for holidays, maintenance, or emergencies.
          New appointments will be blocked on closed dates.
        </p>

        {closureSuccess && (
          <div className="mt-3">
            <FormAlert tone="success">{closureSuccess}</FormAlert>
          </div>
        )}
        {closureError && (
          <div className="mt-3">
            <FormAlert tone="error">{closureError}</FormAlert>
          </div>
        )}

        <div className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div className="space-y-1.5 w-full sm:w-auto">
              <Label>Select Date to Close</Label>
              <DatePicker
                value={closureDate}
                onChange={setClosureDate}
                minDate={todayStr}
                placeholder="Pick date to close"
              />
            </div>
            <Button
              variant="destructive"
              disabled={!closureDate || toggleClosureMutation.isPending}
              onClick={() => {
                if (!closureDate) return;
                toggleClosureMutation.mutate({ date: closureDate, isOpen: false });
              }}
            >
              {toggleClosureMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Mark Clinic Closed
            </Button>
          </div>

          {/* Warning if appointments exist on selected closure date */}
          {closureDate && (affectedQuery.data?.length ?? 0) > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
                <div className="text-xs">
                  <span className="font-semibold">
                    {affectedQuery.data?.length} existing appointment(s)
                  </span>{" "}
                  are scheduled on {closureDate}. Existing appointments are preserved in history and
                  will not be deleted. Please contact affected patients to reschedule.
                </div>
              </div>
            </div>
          )}

          {/* List of Planned Closures */}
          <div className="mt-4 border-t pt-4">
            <h3 className="text-sm font-medium">Upcoming Planned Closures</h3>
            {futureClosedDates.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No future clinic closures scheduled. The clinic will operate normally.
              </p>
            ) : (
              <div className="mt-2 divide-y rounded-md border">
                {futureClosedDates.map((date) => (
                  <div
                    key={date}
                    className="flex items-center justify-between p-3 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-red-300 text-red-600 bg-red-50 dark:bg-red-950/30">
                        Closed
                      </Badge>
                      <span className="font-medium">{date}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={toggleClosureMutation.isPending}
                      onClick={() =>
                        toggleClosureMutation.mutate({ date, isOpen: true })
                      }
                    >
                      Reopen Clinic
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {pastClosedDates.length > 0 && (
              <details className="mt-3">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:underline">
                  View past closure dates ({pastClosedDates.length})
                </summary>
                <div className="mt-2 divide-y rounded-md border text-xs text-muted-foreground">
                  {pastClosedDates.map((date) => (
                    <div key={date} className="p-2 flex justify-between">
                      <span>{date}</span>
                      <span>Passed</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      </section>

      {/* 3. Doctor Leave Requests Review */}
      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Doctor Leave Requests</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Review and approve or reject leave applications submitted by clinic doctors. Approved
          leave automatically sets doctor availability to Busy for that date and blocks new
          bookings.
        </p>

        {leaveRequests.length === 0 ? (
          <p className="mt-4 text-xs text-muted-foreground">
            No doctor leave applications on record.
          </p>
        ) : (
          <div className="mt-4 divide-y rounded-md border">
            {leaveRequests.map((leave) => {
              const isPending = leave.status === "PENDING";
              return (
                <div
                  key={leave.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-3 text-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {leave.doctor_name}
                      </span>
                      {leave.specialization && (
                        <span className="text-xs text-muted-foreground">
                          ({leave.specialization})
                        </span>
                      )}
                      <Badge
                        variant={
                          leave.status === "APPROVED"
                            ? "default"
                            : leave.status === "REJECTED"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {leave.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-3">
                      <span>Date: <strong className="text-foreground">{leave.date}</strong></span>
                      {leave.reason && <span>Reason: &ldquo;{leave.reason}&rdquo;</span>}
                    </div>
                  </div>

                  {isPending && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={reviewLeaveMutation.isPending}
                        onClick={() =>
                          reviewLeaveMutation.mutate({
                            doctorProfileId: leave.doctor_id,
                            leaveId: leave.id,
                            action: "APPROVE",
                          })
                        }
                      >
                        <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reviewLeaveMutation.isPending}
                        onClick={() =>
                          reviewLeaveMutation.mutate({
                            doctorProfileId: leave.doctor_id,
                            leaveId: leave.id,
                            action: "REJECT",
                          })
                        }
                      >
                        <UserX className="mr-1.5 h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
