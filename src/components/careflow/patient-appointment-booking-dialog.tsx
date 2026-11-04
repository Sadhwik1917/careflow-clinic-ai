import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  Clock,
  Stethoscope,
  Building2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  User,
  CalendarCheck2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/careflow/feedback";
import { DatePicker } from "@/components/careflow/date-picker";
import { toast } from "@/lib/toast";
import { createPatientAppointment } from "@/lib/appointments.functions";
import {
  clinicHoursQuery,
  clinicQueueDoctorsQuery,
  doctorAvailabilityQuery,
} from "@/lib/appointment-queries";
import { patientProfileSummaryQuery } from "@/lib/clinical-queries";
import {
  getClinicLocalDate,
  type TimeSlot,
  type AppointmentType,
} from "@/lib/appointments";

export interface PatientAppointmentBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  clinicId?: string | undefined;
  onSuccess?: (appointmentId: string) => void;
}

export function PatientAppointmentBookingDialog({
  open,
  onOpenChange,
  userId,
  clinicId: initialClinicId,
  onSuccess,
}: PatientAppointmentBookingDialogProps) {
  const qc = useQueryClient();
  const createPatientAppointmentFn = useServerFn(createPatientAppointment);

  // Load patient's own profiles and associated clinics
  const { data: profileSummary, isLoading: loadingProfile } = useQuery({
    ...patientProfileSummaryQuery(userId),
    enabled: open,
  });

  const patientRecords = React.useMemo(() => {
    return profileSummary?.patientRecords ?? [];
  }, [profileSummary]);

  // Selected Clinic
  const [selectedClinicId, setSelectedClinicId] = React.useState<string>(
    initialClinicId ?? ""
  );

  React.useEffect(() => {
    if (initialClinicId) {
      setSelectedClinicId(initialClinicId);
    } else if (patientRecords.length > 0 && !selectedClinicId) {
      setSelectedClinicId(patientRecords[0]?.clinic_id ?? "");
    }
  }, [initialClinicId, patientRecords, selectedClinicId]);

  // Current patient profile for the selected clinic (strictly locked to caller's own record)
  const activePatientRecord = React.useMemo(() => {
    return patientRecords.find((p) => p.clinic_id === selectedClinicId);
  }, [patientRecords, selectedClinicId]);

  // Clinic Metadata for timezone & working hours
  const { data: clinicHoursData } = useQuery({
    ...clinicHoursQuery(userId, selectedClinicId),
    enabled: open && Boolean(selectedClinicId),
  });

  const timeZone = clinicHoursData?.timezone || "Asia/Kolkata";

  // Form State
  const [doctorProfileId, setDoctorProfileId] = React.useState<string>("");
  const [selectedDate, setSelectedDate] = React.useState<string>(() =>
    getClinicLocalDate(new Date(), timeZone)
  );
  const [selectedSlot, setSelectedSlot] = React.useState<TimeSlot | null>(null);
  const [appointmentType, setAppointmentType] =
    React.useState<AppointmentType>("CONSULTATION");
  const [reason, setReason] = React.useState<string>("");
  const [notes, setNotes] = React.useState<string>("");
  const [formError, setFormError] = React.useState<string>("");

  // Update date default when clinic timezone loads
  React.useEffect(() => {
    if (timeZone) {
      setSelectedDate((prev) => prev || getClinicLocalDate(new Date(), timeZone));
    }
  }, [timeZone]);

  // Reset doctor and slot when clinic changes
  const handleClinicChange = (newClinicId: string) => {
    setSelectedClinicId(newClinicId);
    setDoctorProfileId("");
    setSelectedSlot(null);
    setFormError("");
  };

  // Queries
  const { data: doctorsData, isLoading: loadingDoctors } = useQuery({
    ...clinicQueueDoctorsQuery(userId, selectedClinicId, {
      search: "",
      status: "ACTIVE",
      page: 0,
    }),
    enabled: open && Boolean(selectedClinicId),
  });

  const { data: availabilityData, isLoading: loadingSlots } = useQuery({
    ...doctorAvailabilityQuery(
      userId,
      selectedClinicId,
      doctorProfileId,
      selectedDate,
      selectedSlot?.start
    ),
    enabled: open && Boolean(selectedClinicId) && Boolean(doctorProfileId) && Boolean(selectedDate),
  });

  const doctors = doctorsData?.rows ?? [];
  const slots = availabilityData?.slots ?? [];
  const doctorInfo = availabilityData?.doctor;

  // Booking Mutation
  const bookingMutation = useMutation({
    mutationFn: async () => {
      setFormError("");
      if (!selectedClinicId) throw new Error("Please select a clinic.");
      if (!activePatientRecord) {
        throw new Error("No active patient profile found for this clinic.");
      }
      if (!doctorProfileId) throw new Error("Please select a doctor.");
      if (!selectedSlot) throw new Error("Please select an available appointment time slot.");

      const res = await createPatientAppointmentFn({
        data: {
          clinicId: selectedClinicId,
          appointment: {
            patient_id: activePatientRecord.id,
            doctor_profile_id: doctorProfileId,
            appointment_type: appointmentType,
            scheduled_start: selectedSlot.start,
            scheduled_end: selectedSlot.end,
            reason: reason.trim() || null,
            notes: notes.trim() || null,
          },
        },
      });

      return res;
    },
    onSuccess: (created) => {
      toast.success("Appointment booked successfully!");
      qc.invalidateQueries({ queryKey: ["patient-appointments"] });
      qc.invalidateQueries({ queryKey: ["doctor-availability", selectedClinicId] });
      qc.invalidateQueries({ queryKey: ["clinical-context"] });
      onOpenChange(false);
      // Reset form
      setDoctorProfileId("");
      setSelectedSlot(null);
      setReason("");
      setNotes("");
      setFormError("");
      if (onSuccess) {
        onSuccess(created.id);
      }
    },
    onError: (err: Error) => {
      setFormError(err.message || "Failed to book appointment. Please try again.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <CalendarDays className="size-5 text-primary" />
            Book New Appointment
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Schedule an appointment for your consultation with an available clinic doctor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive-foreground"
            >
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold">Booking Error</p>
                <p>{formError}</p>
              </div>
            </div>
          )}

          {/* Patient Profile & Clinic Information */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Patient Profile
                </span>
                {loadingProfile ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> Loading your profile...
                  </div>
                ) : activePatientRecord ? (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">
                      {activePatientRecord.first_name} {activePatientRecord.last_name ?? ""}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      #{activePatientRecord.patient_number}
                    </Badge>
                  </div>
                ) : (
                  <p className="text-xs text-destructive font-medium">
                    No verified patient record found for this clinic.
                  </p>
                )}
              </div>

              {/* Clinic Selection (if patient has multiple clinics or wants to switch) */}
              <div className="space-y-1 min-w-[200px]">
                <Label htmlFor="patient-clinic-select" className="text-xs text-muted-foreground">
                  Clinic
                </Label>
                {patientRecords.length > 1 ? (
                  <Select value={selectedClinicId} onValueChange={handleClinicChange}>
                    <SelectTrigger id="patient-clinic-select" className="h-8 text-xs">
                      <SelectValue placeholder="Select Clinic" />
                    </SelectTrigger>
                    <SelectContent>
                      {patientRecords.map((rec) => (
                        <SelectItem key={rec.clinic_id} value={rec.clinic_id} className="text-xs">
                          {rec.clinic?.name || "Clinic"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground py-1">
                    <Building2 className="size-3.5 text-primary" />
                    <span>{activePatientRecord?.clinic?.name || "Careflow Clinic"}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Doctor Selection */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  1
                </span>
                <h4 className="font-semibold text-sm text-foreground">Select Doctor</h4>
              </div>
              {doctorProfileId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setDoctorProfileId("");
                    setSelectedSlot(null);
                  }}
                >
                  Change doctor
                </Button>
              )}
            </div>

            {loadingDoctors ? (
              <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                <Loader2 className="mr-2 size-3.5 animate-spin" />
                Loading clinic doctors...
              </div>
            ) : doctors.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No active doctors are currently available at this clinic.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {doctors.map((doc) => {
                  const isSelected = doctorProfileId === doc.id;
                  const isLeave = doc.status === "ON_LEAVE";
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      disabled={isLeave}
                      onClick={() => {
                        setDoctorProfileId(doc.id);
                        setSelectedSlot(null);
                      }}
                      className={`flex flex-col rounded-lg border p-3 text-left transition-all ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:bg-muted/50"
                      } ${isLeave ? "opacity-50 cursor-not-allowed bg-muted/20" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                          <Stethoscope className="size-3.5 text-primary" />
                          Dr. {doc.display_name ?? "Doctor"}
                        </span>
                        <StatusBadge tone={doc.status === "ACTIVE" ? "success" : "warning"}>
                          {doc.status === "ON_LEAVE" ? "On Leave" : doc.status}
                        </StatusBadge>
                      </div>
                      <span className="mt-1 text-[11px] text-muted-foreground">
                        {doc.specialization} {doc.department ? `· ${doc.department}` : ""}
                      </span>
                      {doc.consultation_fee && (
                        <span className="mt-1.5 text-[11px] font-medium text-foreground">
                          ₹{doc.consultation_fee} fee
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Date & Time Slot Selection */}
          {doctorProfileId && (
            <div className="rounded-lg border bg-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  2
                </span>
                <h4 className="font-semibold text-sm text-foreground">Choose Date &amp; Available Slot</h4>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="space-y-1.5 w-60">
                  <Label htmlFor="patient-appt-date" className="text-xs">
                    Appointment Date
                  </Label>
                  <DatePicker
                    id="patient-appt-date"
                    value={selectedDate}
                    onChange={(d) => {
                      setSelectedDate(d);
                      setSelectedSlot(null);
                    }}
                    minDate={getClinicLocalDate(new Date(), timeZone)}
                    timeZone={timeZone}
                  />
                </div>
                {doctorInfo && (
                  <div className="self-end pb-1 text-xs text-muted-foreground">
                    Available times for Dr. <strong>{doctorInfo.display_name ?? "Doctor"}</strong>
                  </div>
                )}
              </div>

              {loadingSlots ? (
                <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Checking real-time doctor availability...
                </div>
              ) : availabilityData?.clinicIsOpen === false ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-xs text-destructive-foreground">
                  <p className="font-semibold">Clinic is closed on {selectedDate}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    The clinic has a planned closure on this date. Please select another operating day.
                  </p>
                </div>
              ) : availabilityData?.doctorAvailability === "BUSY" ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3.5 text-xs text-amber-800 dark:text-amber-300">
                  <p className="font-semibold">Doctor is unavailable on {selectedDate}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {availabilityData?.isLeave
                      ? "The doctor is on approved leave on this date."
                      : "The doctor has marked themselves unavailable for bookings on this date."}
                  </p>
                </div>
              ) : slots.length === 0 ? (
                <div className="rounded-lg border border-muted bg-muted/20 p-3.5 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">No available time slots on this date</p>
                  <p className="mt-0.5">
                    All consultation slots have either reached full capacity (max 6), passed, or fall outside clinic hours.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Select 1-Hour Time Slot:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {slots.map((slot) => {
                      const isSelected = selectedSlot?.start === slot.start;
                      return (
                        <button
                          key={slot.start}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`flex flex-col items-center justify-center rounded-md border p-2.5 text-xs font-mono transition-all ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground font-semibold shadow-sm"
                              : "border-border bg-card hover:border-primary/50 text-foreground"
                          }`}
                        >
                          <span>{slot.timeLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Visit Details */}
          {doctorProfileId && selectedSlot && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  3
                </span>
                <h4 className="font-semibold text-sm text-foreground">Visit Details</h4>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="patient-appt-type" className="text-xs">
                    Appointment Type
                  </Label>
                  <Select
                    value={appointmentType}
                    onValueChange={(v) => setAppointmentType(v as AppointmentType)}
                  >
                    <SelectTrigger id="patient-appt-type" className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CONSULTATION" className="text-xs">
                        General Consultation
                      </SelectItem>
                      <SelectItem value="FOLLOW_UP" className="text-xs">
                        Follow-up Visit
                      </SelectItem>
                      <SelectItem value="CHECKUP" className="text-xs">
                        Routine Checkup
                      </SelectItem>
                      <SelectItem value="EMERGENCY" className="text-xs">
                        Priority / Urgent
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="patient-appt-reason" className="text-xs">
                    Reason for Visit (Optional)
                  </Label>
                  <Input
                    id="patient-appt-reason"
                    placeholder="e.g. Fever, persistent headache, medication follow-up..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="patient-appt-notes" className="text-xs">
                    Additional Notes for Doctor (Optional)
                  </Label>
                  <Textarea
                    id="patient-appt-notes"
                    placeholder="Briefly describe your symptoms or relevant medical context..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={1000}
                    className="text-xs resize-none"
                    rows={2}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 border-t pt-4">
          <div className="text-xs text-muted-foreground">
            {selectedSlot ? (
              <span className="text-foreground">
                Booking for <strong>{selectedDate}</strong> at{" "}
                <strong>{selectedSlot.timeLabel}</strong>
              </span>
            ) : (
              "Please select a doctor and available time slot to continue."
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={
                !selectedClinicId ||
                !activePatientRecord ||
                !doctorProfileId ||
                !selectedSlot ||
                bookingMutation.isPending
              }
              onClick={() => bookingMutation.mutate()}
            >
              {bookingMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Booking...
                </>
              ) : (
                <>
                  <CalendarCheck2 className="mr-1.5 size-3.5" />
                  Confirm Booking
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

