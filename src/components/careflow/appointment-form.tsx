import { useState, useId, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Calendar,
  Clock,
  User,
  Stethoscope,
  AlertCircle,
  CheckCircle2,
  Search,
  UserPlus,
  Loader2,
  CalendarCheck2,
} from "lucide-react";
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
import { StatusBadge } from "@/components/careflow/feedback";
import { DatePicker } from "@/components/careflow/date-picker";
import { toast } from "@/lib/toast";
import { createClinicAppointment, registerAppointmentPatient } from "@/lib/appointments.functions";
import {
  doctorAvailabilityQuery,
  clinicHoursQuery,
  clinicQueueDoctorsQuery,
  appointmentPatientsQuery,
} from "@/lib/appointment-queries";
import {
  getClinicLocalDate,
  formatSlotLabel12h,
  formatTime12h,
  type TimeSlot,
  type AppointmentType,
} from "@/lib/appointments";

interface AppointmentFormProps {
  userId: string;
  clinicId: string;
  defaultDoctorId?: string | undefined;
  lockDoctor?: boolean | undefined;
  onSuccess?: ((appointmentId: string) => void) | undefined;
  onCancel?: (() => void) | undefined;
}

export function AppointmentForm({
  userId,
  clinicId,
  defaultDoctorId,
  lockDoctor,
  onSuccess,
  onCancel,
}: AppointmentFormProps) {
  const qc = useQueryClient();
  const createAppointmentFn = useServerFn(createClinicAppointment);
  const registerPatientFn = useServerFn(registerAppointmentPatient);

  // Clinic metadata for timezone
  const { data: clinicHoursData } = useQuery(clinicHoursQuery(userId, clinicId));
  const timeZone = clinicHoursData?.timezone || "Asia/Kolkata";

  // Form State: Initial date uses clinic-local date
  const [patientId, setPatientId] = useState<string>("");
  const [selectedPatientName, setSelectedPatientName] = useState<string>("");
  const [doctorProfileId, setDoctorProfileId] = useState<string>(defaultDoctorId ?? "");
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    getClinicLocalDate(new Date(), timeZone)
  );

  useEffect(() => {
    if (defaultDoctorId && !doctorProfileId) {
      setDoctorProfileId(defaultDoctorId);
    }
  }, [defaultDoctorId, doctorProfileId]);

  useEffect(() => {
    if (timeZone) {
      setSelectedDate((prev) => (prev ? prev : getClinicLocalDate(new Date(), timeZone)));
    }
  }, [timeZone]);

  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [appointmentType, setAppointmentType] = useState<AppointmentType>("CONSULTATION");
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Patient Search & Quick Registration
  const [patientSearch, setPatientSearch] = useState<string>("");
  const [showQuickRegister, setShowQuickRegister] = useState<boolean>(false);
  const [regFirstName, setRegFirstName] = useState<string>("");
  const [regLastName, setRegLastName] = useState<string>("");
  const [regPatientNumber, setRegPatientNumber] = useState<string>(
    () => `P-${Date.now().toString().slice(-6)}`
  );
  const [regPhone, setRegPhone] = useState<string>("");
  const [regGender, setRegGender] = useState<string>("other");
  const [regDob, setRegDob] = useState<string>("");

  // Errors
  const [formError, setFormError] = useState<string>("");

  // Queries
  const { data: doctorsData, isLoading: loadingDoctors } = useQuery(
    clinicQueueDoctorsQuery(userId, clinicId, { search: "", status: "ACTIVE", page: 0 })
  );

  const { data: patientsData, isLoading: loadingPatients } = useQuery(
    appointmentPatientsQuery(userId, clinicId, { search: patientSearch, page: 0 })
  );

  const { data: availabilityData, isLoading: loadingSlots } = useQuery(
    doctorAvailabilityQuery(
      userId,
      clinicId,
      doctorProfileId,
      selectedDate,
      selectedSlot?.start
    )
  );

  // Mutations
  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!regFirstName.trim()) throw new Error("First name is required.");
      if (!regPatientNumber.trim()) throw new Error("Patient number is required.");

      const result = await registerPatientFn({
        data: {
          clinicId,
          fields: {
            first_name: regFirstName.trim(),
            last_name: regLastName.trim() || null,
            patient_number: regPatientNumber.trim(),
            phone: regPhone.trim() || null,
            gender: regGender,
            date_of_birth: regDob || null,
          },
        },
      });
      return result;
    },
    onSuccess: (newPatient) => {
      toast.success(`Patient ${newPatient.first_name} registered successfully`);
      setPatientId(newPatient.id);
      setSelectedPatientName(`${newPatient.first_name} ${newPatient.last_name ?? ""}`.trim());
      setShowQuickRegister(false);
      qc.invalidateQueries({ queryKey: ["appointment-patients", clinicId] });
      qc.invalidateQueries({ queryKey: ["patients", clinicId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to register patient.");
    },
  });

  const appointmentMutation = useMutation({
    mutationFn: async () => {
      setFormError("");
      if (!patientId) throw new Error("Please select or register a patient.");
      if (!doctorProfileId) throw new Error("Please select a doctor.");
      if (!selectedSlot) throw new Error("Please select an available appointment time slot.");

      const res = await createAppointmentFn({
        data: {
          clinicId,
          appointment: {
            patient_id: patientId,
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
      toast.success("Appointment scheduled successfully");
      qc.invalidateQueries({ queryKey: ["appointments", clinicId] });
      qc.invalidateQueries({ queryKey: ["doctor-availability", clinicId] });
      if (onSuccess) onSuccess(created.id);
    },
    onError: (err: Error) => {
      setFormError(err.message || "Could not schedule appointment.");
    },
  });

  const doctors = doctorsData?.rows ?? [];
  const patients = patientsData?.rows ?? [];
  const slots = availabilityData?.slots ?? [];
  const alternatives = availabilityData?.alternatives ?? [];
  const doctorInfo = availabilityData?.doctor;

  return (
    <div className="space-y-6">
      {formError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          <AlertCircle className="size-4 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* Step 1: Select Patient */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              1
            </span>
            <h3 className="font-semibold text-foreground">Select Patient</h3>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setShowQuickRegister(!showQuickRegister);
              setPatientId("");
              setSelectedPatientName("");
            }}
          >
            <UserPlus className="mr-1.5 size-4" />
            {showQuickRegister ? "Search Existing Patients" : "Register New Patient"}
          </Button>
        </div>

        {selectedPatientName && !showQuickRegister && (
          <div className="flex items-center justify-between rounded-md border border-primary/20 bg-secondary/60 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                Selected: <strong className="font-semibold">{selectedPatientName}</strong>
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPatientId("");
                setSelectedPatientName("");
              }}
            >
              Change
            </Button>
          </div>
        )}

        {!showQuickRegister && !selectedPatientName && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search patient by name, number, or phone..."
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {loadingPatients ? (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                Searching clinic patients...
              </div>
            ) : patients.length > 0 ? (
              <div className="max-h-48 overflow-y-auto divide-y rounded-md border">
                {patients.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPatientId(p.id);
                      setSelectedPatientName(`${p.first_name} ${p.last_name ?? ""}`.trim());
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <div>
                      <span className="font-medium text-foreground">
                        {p.first_name} {p.last_name ?? ""}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        #{p.patient_number}
                      </span>
                    </div>
                    {p.phone && (
                      <span className="text-xs text-muted-foreground">{p.phone}</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No matching patients found. Click &quot;Register New Patient&quot; to add them.
              </p>
            )}
          </div>
        )}

        {showQuickRegister && (
          <div className="rounded-lg border bg-muted/40 p-4 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Quick Patient Registration</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="reg-first">First name *</Label>
                <Input
                  id="reg-first"
                  value={regFirstName}
                  onChange={(e) => setRegFirstName(e.target.value)}
                  placeholder="e.g. Ramesh"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-last">Last name</Label>
                <Input
                  id="reg-last"
                  value={regLastName}
                  onChange={(e) => setRegLastName(e.target.value)}
                  placeholder="e.g. Sharma"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-num">Patient number *</Label>
                <Input
                  id="reg-num"
                  value={regPatientNumber}
                  onChange={(e) => setRegPatientNumber(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-phone">Phone number</Label>
                <Input
                  id="reg-phone"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="e.g. +91 9876543210"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-gender">Gender</Label>
                <Select value={regGender} onValueChange={setRegGender}>
                  <SelectTrigger id="reg-gender">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-dob">Date of birth</Label>
                <Input
                  id="reg-dob"
                  type="date"
                  value={regDob}
                  onChange={(e) => setRegDob(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowQuickRegister(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={registerMutation.isPending}
                onClick={() => registerMutation.mutate()}
              >
                {registerMutation.isPending && (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                )}
                Save &amp; Select Patient
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Select Doctor */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            2
          </span>
          <h3 className="font-semibold text-foreground">Select Doctor</h3>
        </div>

        {loadingDoctors ? (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading doctors...
          </div>
        ) : lockDoctor ? (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 flex items-center justify-between">
            <div>
              <div className="font-semibold text-foreground">
                {doctors.find((d) => d.id === doctorProfileId)?.display_name ?? "Your Doctor Profile"}
              </div>
              <div className="text-xs text-muted-foreground">
                {doctors.find((d) => d.id === doctorProfileId)?.specialization ?? "Consultation"}
              </div>
            </div>
            <StatusBadge tone="info">Assigned to You</StatusBadge>
          </div>
        ) : doctors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active doctors available in this clinic. Please invite or activate doctors first.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
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
                  className={`flex flex-col rounded-lg border p-3.5 text-left transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:bg-muted/50"
                  } ${isLeave ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">
                      {doc.display_name ?? "Doctor"}
                    </span>
                    <StatusBadge tone={doc.status === "ACTIVE" ? "success" : "warning"}>
                      {doc.status === "ON_LEAVE" ? "On Leave" : doc.status}
                    </StatusBadge>
                  </div>
                  <span className="mt-1 text-xs text-muted-foreground">
                    {doc.specialization} {doc.department ? `· ${doc.department}` : ""}
                  </span>
                  {doc.consultation_fee && (
                    <span className="mt-2 text-xs font-medium text-foreground">
                      ₹{doc.consultation_fee} consultation fee
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Step 3: Date & Time Slots */}
      {doctorProfileId && (
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              3
            </span>
            <h3 className="font-semibold text-foreground">Date &amp; Time Slot</h3>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="space-y-1.5 w-64">
              <Label htmlFor="appt-date">Appointment Date</Label>
              <DatePicker
                id="appt-date"
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
              <div className="self-end pb-1 text-sm text-muted-foreground">
                Showing availability for <strong>{doctorInfo.display_name ?? "Doctor"}</strong>
              </div>
            )}
          </div>

          {loadingSlots ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Checking availability slots...
            </div>
          ) : availabilityData?.clinicIsOpen === false ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive-foreground">
              <p className="font-semibold">Clinic is closed on {selectedDate}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The clinic has a planned closure on this date. Please choose another operating date.
              </p>
            </div>
          ) : availabilityData?.doctorAvailability === "BUSY" ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-300">
              <p className="font-semibold">Doctor is unavailable on {selectedDate}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {availabilityData?.isLeave
                  ? "The doctor is on approved leave on this date."
                  : "The doctor has marked themselves busy for appointments on this date."}
              </p>
            </div>
          ) : slots.length === 0 ? (
            <div className="rounded-lg border border-muted bg-muted/20 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">No available time slots on this date</p>
              <p className="mt-1 text-xs">
                All time slots have either passed, reached maximum capacity, or fall outside operating hours.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                {/* Additional Requirement A: Capacity is invisible in UI */}
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Select Appointment Time (1-Hour Slots)
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
            </div>
          )}
        </div>
      )}

      {/* Step 4: Appointment Details */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            4
          </span>
          <h3 className="font-semibold text-foreground">Appointment Details</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="appt-type">Appointment Type</Label>
            <Select
              value={appointmentType}
              onValueChange={(v) => setAppointmentType(v as AppointmentType)}
            >
              <SelectTrigger id="appt-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CONSULTATION">General Consultation</SelectItem>
                <SelectItem value="FOLLOW_UP">Follow-up Visit</SelectItem>
                <SelectItem value="EMERGENCY">Emergency / Priority</SelectItem>
                <SelectItem value="OTHER">Other / Diagnostic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="appt-reason">Reason for visit</Label>
            <Input
              id="appt-reason"
              placeholder="e.g. Persistent cough, routine checkup, rash..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="appt-notes">Internal Notes (Optional)</Label>
            <Textarea
              id="appt-notes"
              placeholder="Any operational notes for receptionist or doctor..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
            />
          </div>
        </div>
      </div>

      {/* Confirmation & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-5">
        <div className="text-sm text-muted-foreground">
          {selectedSlot ? (
            <span className="text-foreground">
              Booking for <strong>{selectedDate}</strong> at{" "}
              <strong>{selectedSlot.timeLabel}</strong>
            </span>
          ) : (
            "Please select a patient, doctor, and time slot to confirm."
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            type="button"
            disabled={
              !patientId ||
              !doctorProfileId ||
              !selectedSlot ||
              appointmentMutation.isPending
            }
            onClick={() => appointmentMutation.mutate()}
          >
            {appointmentMutation.isPending && (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            )}
            Confirm Appointment
          </Button>
        </div>
      </div>
    </div>
  );
}
