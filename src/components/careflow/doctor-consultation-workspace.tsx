import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Heart,
  Thermometer,
  Wind,
  Gauge,
  Ruler,
  Weight,
  Plus,
  Trash2,
  FileText,
  Pill,
  Calendar,
  Save,
  CheckCircle2,
  Printer,
  AlertCircle,
  Clock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  appointmentClinicalContextQuery,
} from "@/lib/clinical-queries";
import {
  saveOrCompleteConsultationFn,
} from "@/lib/clinical.functions";
import type { MedicationItem, SaveConsultationInput } from "@/lib/clinical";
import {
  FREQUENCY_PRESETS,
  MEAL_TIMING_OPTIONS,
  formatFrequencyLabel,
  formatMealTimingLabel,
} from "@/lib/clinical";
import { PrescriptionPreviewDialog } from "./prescription-preview-dialog";
import { toast } from "sonner";

interface DoctorConsultationWorkspaceProps {
  clinicId: string;
  appointmentId: string;
  queueEntryId?: string;
  onCompleted?: () => void;
  onSaveDraft?: () => void;
}

export function DoctorConsultationWorkspace({
  clinicId,
  appointmentId,
  queueEntryId,
  onCompleted,
  onSaveDraft,
}: DoctorConsultationWorkspaceProps) {
  const queryClient = useQueryClient();

  const { data: context, isLoading, isError, error } = useQuery({
    ...appointmentClinicalContextQuery(clinicId, appointmentId),
  });

  // Clinical encounter form state
  const [chiefComplaint, setChiefComplaint] = React.useState("");
  const [assessment, setAssessment] = React.useState("");
  const [clinicalNotes, setClinicalNotes] = React.useState("");
  const [followUpDate, setFollowUpDate] = React.useState("");
  const [followUpNotes, setFollowUpNotes] = React.useState("");
  const [medications, setMedications] = React.useState<MedicationItem[]>([]);

  // Individual medication builder form state
  const [newMedName, setNewMedName] = React.useState("");
  const [newMedDosage, setNewMedDosage] = React.useState("");
  const [newMedFrequency, setNewMedFrequency] = React.useState("1-0-1");
  const [newMedMealTiming, setNewMedMealTiming] = React.useState<"BEFORE_MEAL" | "AFTER_MEAL" | "WITH_MEAL" | "EMPTY_STOMACH">("AFTER_MEAL");
  const [newMedDuration, setNewMedDuration] = React.useState("5 days");
  const [newMedInstructions, setNewMedInstructions] = React.useState("");

  // Preview prescription dialog state
  const [previewOpen, setPreviewOpen] = React.useState(false);

  // Initialize state from existing context when loaded
  const hasInitialized = React.useRef(false);
  React.useEffect(() => {
    if (context && !hasInitialized.current) {
      if (context.consultation) {
        setChiefComplaint(context.consultation.chief_complaint || "");
        setAssessment(context.consultation.assessment || "");
        setClinicalNotes(context.consultation.clinical_notes || "");
        setFollowUpDate(
          context.consultation.follow_up_date
            ? (context.consultation.follow_up_date.split("T")[0] ?? "")
            : ""
        );
        setFollowUpNotes(context.consultation.follow_up_notes || "");
      }

      if (context.medications && context.medications.length > 0) {
        setMedications(
          context.medications.map((m) => ({
            name: (m as any).medicine_name || (m as any).medication_name || "",
            medicine_name: (m as any).medicine_name || (m as any).medication_name || "",
            dosage: m.dosage || undefined,
            frequency: m.frequency || "1-0-1",
            meal_timing: (m as any).meal_timing || undefined,
            duration: m.duration || undefined,
            instructions: m.instructions || undefined,
          }))
        );
      }
      hasInitialized.current = true;
    }
  }, [context]);

  // Handle adding a medication to the list
  const handleAddMedication = () => {
    if (!newMedName.trim()) {
      toast.error("Please enter medicine name.");
      return;
    }

    const item: MedicationItem = {
      name: newMedName.trim(),
      dosage: newMedDosage.trim() || undefined,
      frequency: newMedFrequency,
      meal_timing: newMedMealTiming,
      duration: newMedDuration.trim() || undefined,
      instructions: newMedInstructions.trim() || undefined,
    };

    setMedications((prev) => [...prev, item]);
    // Reset builder form
    setNewMedName("");
    setNewMedDosage("");
    setNewMedInstructions("");
    toast.success(`Added ${item.name} to prescription.`);
  };

  const handleRemoveMedication = (index: number) => {
    setMedications((prev) => prev.filter((_, i) => i !== index));
  };

  // Mutation to save draft or complete consultation
  const saveMutation = useMutation({
    mutationFn: async (finalize: boolean) => {
      const payload: SaveConsultationInput = {
        clinicId,
        appointmentId,
        chief_complaint: chiefComplaint.trim() || undefined,
        assessment: assessment.trim() || undefined,
        clinical_notes: clinicalNotes.trim() || undefined,
        follow_up_date: followUpDate || undefined,
        follow_up_notes: followUpNotes.trim() || undefined,
        medications,
        finalize,
      };

      return saveOrCompleteConsultationFn({ data: payload });
    },
    onSuccess: (data, finalize) => {
      queryClient.invalidateQueries({
        queryKey: ["clinical-context", clinicId, appointmentId],
      });
      queryClient.invalidateQueries({
        queryKey: ["queue-entries", clinicId],
      });
      queryClient.invalidateQueries({
        queryKey: ["doctor-prescriptions", clinicId],
      });
      queryClient.invalidateQueries({
        queryKey: ["clinic-invoices", clinicId],
      });
      queryClient.invalidateQueries({
        queryKey: ["appointments", clinicId],
      });

      if (finalize) {
        toast.success(
          data.nextQueueEntry
            ? `Consultation completed! Automatically called next patient (Queue #${data.nextQueueEntry.queue_number}).`
            : "Consultation completed and prescription finalized! No more patients waiting."
        );
        onCompleted?.();
      } else {
        toast.success("Consultation notes & e-prescription draft saved.");
        onSaveDraft?.();
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to save consultation.");
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3 border rounded-xl bg-card">
        <Activity className="h-8 w-8 text-primary animate-pulse" />
        <p className="text-sm font-medium text-muted-foreground">
          Loading clinical encounter workspace &amp; e-prescription...
        </p>
      </div>
    );
  }

  if (isError || !context) {
    return (
      <div className="p-6 border border-destructive/20 rounded-xl bg-destructive/5 space-y-3">
        <div className="flex items-center gap-2 text-destructive font-semibold">
          <AlertCircle className="h-5 w-5" />
          <span>Error loading clinical consultation context</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {(error as any)?.message || "Failed to retrieve appointment and patient data."}
        </p>
      </div>
    );
  }

  const patient = context.patient;
  const vitals = context.vitals;
  const isCompleted = context.consultation?.status === "COMPLETED";

  // Build synthetic PrescriptionWithDetails for preview
  const previewPrescription = context.prescription
    ? {
        ...context.prescription,
        patient: context.patient,
        doctor: context.doctor,
        consultation: {
          ...context.consultation,
          assessment,
          chief_complaint: chiefComplaint,
          clinical_notes: clinicalNotes,
          follow_up_date: followUpDate || null,
          follow_up_notes: followUpNotes || null,
          vitals: context.vitals,
        },
        items: medications.map((m, idx) => ({
          id: `item-${idx}`,
          prescription_id: context.prescription?.id || "",
          medicine_name: m.name || m.medicine_name || "Medicine",
          dosage: m.dosage || null,
          frequency: m.frequency,
          meal_timing: m.meal_timing || null,
          duration: m.duration || null,
          instructions: m.instructions || null,
          created_at: new Date().toISOString(),
        })),
      }
    : null;

  return (
    <div className="space-y-6">
      {/* 1. Header & Patient Info Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border bg-card/80 backdrop-blur-sm shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg text-foreground">
              {patient.first_name} {patient.last_name}
            </span>
            <Badge variant="outline" className="text-xs font-mono">
              Patient #{patient.patient_number}
            </Badge>
            {patient.gender && (
              <Badge variant="secondary" className="text-xs">
                {patient.gender}
              </Badge>
            )}
            {isCompleted ? (
              <Badge className="bg-emerald-600 text-white text-xs">
                Consultation Completed
              </Badge>
            ) : (
              <Badge className="bg-blue-600 text-white text-xs">
                In Consultation
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {patient.phone && <span>Phone: {patient.phone}</span>}
            {context.appointment.reason && (
              <span>Reason: &quot;{context.appointment.reason}&quot;</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {previewPrescription && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(true)}
              className="gap-1.5"
            >
              <Printer className="h-4 w-4" />
              Preview Prescription
            </Button>
          )}

          {!isCompleted && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => saveMutation.mutate(false)}
                disabled={saveMutation.isPending}
                className="gap-1.5"
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "Saving..." : "Save Draft"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (!assessment.trim()) {
                    toast.error("Please enter a Clinical Diagnosis / Assessment before completing.");
                    return;
                  }
                  saveMutation.mutate(true);
                }}
                disabled={saveMutation.isPending}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              >
                <CheckCircle2 className="h-4 w-4" />
                {saveMutation.isPending ? "Finalizing..." : "Complete Consultation"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 2. Receptionist-Submitted Vitals Banner (Requirement 2 & 3) */}
      <div className="p-4 rounded-xl border bg-muted/30 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Triage &amp; Receptionist Vitals
          </span>
          {vitals?.recorded_at ? (
            <span className="text-[11px] text-muted-foreground">
              Recorded at {new Date(vitals.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : (
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
              No vitals submitted yet
            </Badge>
          )}
        </div>

        {vitals ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-1">
            <div className="p-2.5 rounded-lg border bg-card/60">
              <span className="text-[10px] text-muted-foreground block font-medium flex items-center gap-1">
                <Gauge className="h-3 w-3 text-rose-500" /> Blood Pressure
              </span>
              <span className="text-sm font-bold text-foreground">
                {vitals.systolic_bp && vitals.diastolic_bp
                  ? `${vitals.systolic_bp}/${vitals.diastolic_bp} mmHg`
                  : "—"}
              </span>
            </div>

            <div className="p-2.5 rounded-lg border bg-card/60">
              <span className="text-[10px] text-muted-foreground block font-medium flex items-center gap-1">
                <Heart className="h-3 w-3 text-red-500" /> Pulse
              </span>
              <span className="text-sm font-bold text-foreground">
                {vitals.heart_rate ? `${vitals.heart_rate} bpm` : "—"}
              </span>
            </div>

            <div className="p-2.5 rounded-lg border bg-card/60">
              <span className="text-[10px] text-muted-foreground block font-medium flex items-center gap-1">
                <Thermometer className="h-3 w-3 text-amber-500" /> Temperature
              </span>
              <span className="text-sm font-bold text-foreground">
                {vitals.temperature ? `${vitals.temperature}°F` : "—"}
              </span>
            </div>

            <div className="p-2.5 rounded-lg border bg-card/60">
              <span className="text-[10px] text-muted-foreground block font-medium flex items-center gap-1">
                <Activity className="h-3 w-3 text-blue-500" /> SpO2
              </span>
              <span className="text-sm font-bold text-foreground">
                {vitals.oxygen_saturation ? `${vitals.oxygen_saturation}%` : "—"}
              </span>
            </div>

            <div className="p-2.5 rounded-lg border bg-card/60">
              <span className="text-[10px] text-muted-foreground block font-medium flex items-center gap-1">
                <Wind className="h-3 w-3 text-teal-500" /> Resp. Rate
              </span>
              <span className="text-sm font-bold text-foreground">
                {vitals.respiratory_rate ? `${vitals.respiratory_rate}/min` : "—"}
              </span>
            </div>

            <div className="p-2.5 rounded-lg border bg-card/60">
              <span className="text-[10px] text-muted-foreground block font-medium flex items-center gap-1">
                <Weight className="h-3 w-3 text-indigo-500" /> Weight / Height
              </span>
              <span className="text-xs font-bold text-foreground block">
                {vitals.weight_kg ? `${vitals.weight_kg}kg` : "—"} /{" "}
                {vitals.height_cm ? `${vitals.height_cm}cm` : "—"}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Receptionist has not entered triage vitals for this patient. You can proceed with consultation.
          </p>
        )}

        {vitals?.notes && (
          <p className="text-xs text-muted-foreground bg-card/40 p-2 rounded border mt-1">
            <strong>Receptionist Note:</strong> {vitals.notes}
          </p>
        )}
      </div>

      {/* 3. Clinical Assessment & Diagnosis (Doctor Only) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 rounded-xl border bg-card">
        <div className="space-y-2 md:col-span-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="assessment" className="text-sm font-bold flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-primary" />
              Clinical Diagnosis / Assessment <span className="text-destructive">*</span>
            </Label>
            <span className="text-[11px] text-muted-foreground">Required for completion</span>
          </div>
          <Input
            id="assessment"
            placeholder="e.g. Acute bronchitis, Type 2 diabetes mellitus, Seasonal allergic rhinitis..."
            value={assessment}
            onChange={(e) => setAssessment(e.target.value)}
            disabled={isCompleted}
            className="font-medium"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="chiefComplaint" className="text-xs font-semibold">
            Chief Complaints / Symptoms
          </Label>
          <Textarea
            id="chiefComplaint"
            placeholder="e.g. Productive cough for 3 days, low-grade fever, sore throat..."
            value={chiefComplaint}
            onChange={(e) => setChiefComplaint(e.target.value)}
            disabled={isCompleted}
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="clinicalNotes" className="text-xs font-semibold">
            Clinical Advice, Physical Findings &amp; Examination Notes
          </Label>
          <Textarea
            id="clinicalNotes"
            placeholder="e.g. Chest clear on auscultation, throat congested. Advised warm fluids and rest..."
            value={clinicalNotes}
            onChange={(e) => setClinicalNotes(e.target.value)}
            disabled={isCompleted}
            rows={3}
          />
        </div>
      </div>

      {/* 4. Medication Entry & Management (Requirements 4 & 5) */}
      <div className="p-5 rounded-xl border bg-card space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-2">
              <Pill className="h-4 w-4" />
              Prescribed Medications (℞)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add medications with dosage, frequency schedule (e.g. 1-0-1), meal timing, and duration.
            </p>
          </div>
          <Badge variant="outline" className="font-semibold text-xs">
            {medications.length} Added
          </Badge>
        </div>

        {/* Medication Builder Form (Disabled if completed) */}
        {!isCompleted && (
          <div className="p-4 rounded-lg border bg-muted/20 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5 text-primary" />
              Add Medication to Prescription
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {/* Medicine Name */}
              <div className="space-y-1 sm:col-span-2 md:col-span-1">
                <Label className="text-xs font-medium">Medicine Name *</Label>
                <Input
                  placeholder="e.g. Paracetamol / Amoxicillin"
                  value={newMedName}
                  onChange={(e) => setNewMedName(e.target.value)}
                />
              </div>

              {/* Dosage */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Dosage</Label>
                <Input
                  placeholder="e.g. 500 mg, 1 tablet, 5 ml"
                  value={newMedDosage}
                  onChange={(e) => setNewMedDosage(e.target.value)}
                />
              </div>

              {/* Duration */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Duration</Label>
                <Input
                  placeholder="e.g. 5 days, 1 week, 1 month"
                  value={newMedDuration}
                  onChange={(e) => setNewMedDuration(e.target.value)}
                />
              </div>

              {/* Frequency presets (1-0-1, etc.) */}
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-medium">Frequency Schedule *</Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {FREQUENCY_PRESETS.map((preset) => (
                    <Button
                      key={preset.value}
                      type="button"
                      variant={newMedFrequency === preset.value ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs font-mono px-2"
                      onClick={() => setNewMedFrequency(preset.value)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Meal Timing */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Meal Timing</Label>
                <Select
                  value={newMedMealTiming}
                  onValueChange={(val: any) => setNewMedMealTiming(val)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select meal timing" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEAL_TIMING_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Instructions */}
              <div className="space-y-1 sm:col-span-2 md:col-span-2">
                <Label className="text-xs font-medium">Additional Instructions (Optional)</Label>
                <Input
                  placeholder="e.g. Take with warm water, avoid dairy"
                  value={newMedInstructions}
                  onChange={(e) => setNewMedInstructions(e.target.value)}
                />
              </div>

              {/* Add Button */}
              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={handleAddMedication}
                  className="w-full h-9 gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Add Medication
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Current Medications List Table */}
        {medications.length === 0 ? (
          <div className="text-center py-6 border border-dashed rounded-lg text-muted-foreground text-xs">
            No medications added yet. Use the form above to add prescribed medicines.
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b text-muted-foreground font-semibold">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Medicine &amp; Dosage</th>
                  <th className="py-2.5 px-3">Frequency</th>
                  <th className="py-2.5 px-3">Meal Timing</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3">Instructions</th>
                  {!isCompleted && <th className="py-2.5 px-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {medications.map((item, idx) => (
                  <tr key={idx} className="hover:bg-muted/20">
                    <td className="py-2.5 px-3 font-semibold text-muted-foreground">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-bold text-foreground text-sm block">{item.name}</span>
                      {item.dosage && (
                        <span className="text-muted-foreground font-mono">{item.dosage}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge variant="outline" className="font-mono text-[11px] bg-primary/5 text-primary">
                        {formatFrequencyLabel(item.frequency)}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3">
                      {item.meal_timing ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {formatMealTimingLabel(item.meal_timing)}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-foreground">{item.duration || "—"}</td>
                    <td className="py-2.5 px-3 text-muted-foreground italic">
                      {item.instructions || "—"}
                    </td>
                    {!isCompleted && (
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMedication(idx)}
                          className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Follow-up & Discharge Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 rounded-xl border bg-card">
        <div className="space-y-1.5">
          <Label htmlFor="followUpDate" className="text-xs font-semibold flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-primary" />
            Next Follow-up Date (Optional)
          </Label>
          <Input
            id="followUpDate"
            type="date"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
            disabled={isCompleted}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="followUpNotes" className="text-xs font-semibold">
            Follow-up Advice or Tests Needed
          </Label>
          <Input
            id="followUpNotes"
            placeholder="e.g. Return in 5 days if fever persists; CBC report review"
            value={followUpNotes}
            onChange={(e) => setFollowUpNotes(e.target.value)}
            disabled={isCompleted}
          />
        </div>
      </div>

      {/* 6. Footer Action Bar */}
      {!isCompleted && (
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border bg-card shadow-sm">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-4 w-4 text-primary" />
            <span>
              Completing will finalize this e-Prescription, update the queue, and automatically generate the clinic invoice.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => saveMutation.mutate(false)}
              disabled={saveMutation.isPending}
              className="gap-1.5"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save Draft"}
            </Button>

            <Button
              type="button"
              onClick={() => {
                if (!assessment.trim()) {
                  toast.error("Please enter a Clinical Diagnosis / Assessment before completing.");
                  return;
                }
                saveMutation.mutate(true);
              }}
              disabled={saveMutation.isPending}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              <CheckCircle2 className="h-4 w-4" />
              {saveMutation.isPending ? "Finalizing Consultation..." : "Complete Consultation"}
            </Button>
          </div>
        </div>
      )}

      {/* Prescription Preview Modal */}
      {previewPrescription && (
        <PrescriptionPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          prescription={previewPrescription}
        />
      )}
    </div>
  );
}
