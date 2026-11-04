import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Heart, Thermometer, Wind, Gauge, Ruler, Weight, CheckCircle2, AlertCircle } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { recordAppointmentVitalsFn } from "@/lib/clinical.functions";
import { appointmentClinicalContextQuery } from "@/lib/clinical-queries";
import type { VitalsInput } from "@/lib/clinical";
import { toast } from "sonner";

interface VitalsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  appointmentId: string;
  patientName: string;
  patientNumber?: string | null | undefined;
  onSuccess?: (() => void) | undefined;
}

export function VitalsDialog({
  open,
  onOpenChange,
  clinicId,
  appointmentId,
  patientName,
  patientNumber,
  onSuccess,
}: VitalsDialogProps) {
  const queryClient = useQueryClient();

  // Load existing clinical context if available
  const contextQuery = useQuery({
    ...appointmentClinicalContextQuery(clinicId, appointmentId),
    enabled: open,
  });

  const existingVitals = contextQuery.data?.vitals;

  const [form, setForm] = React.useState<VitalsInput>({
    systolic_bp: undefined,
    diastolic_bp: undefined,
    heart_rate: undefined,
    temperature: undefined,
    respiratory_rate: undefined,
    oxygen_saturation: undefined,
    height_cm: undefined,
    weight_kg: undefined,
    notes: "",
  });

  // Populate when existing vitals load
  React.useEffect(() => {
    if (existingVitals) {
      setForm({
        systolic_bp: existingVitals.systolic_bp ?? undefined,
        diastolic_bp: existingVitals.diastolic_bp ?? undefined,
        heart_rate: existingVitals.heart_rate ?? undefined,
        temperature: existingVitals.temperature ?? undefined,
        respiratory_rate: existingVitals.respiratory_rate ?? undefined,
        oxygen_saturation: existingVitals.oxygen_saturation ?? undefined,
        height_cm: existingVitals.height_cm ?? undefined,
        weight_kg: existingVitals.weight_kg ?? undefined,
        notes: existingVitals.notes ?? "",
      });
    } else {
      setForm({
        systolic_bp: undefined,
        diastolic_bp: undefined,
        heart_rate: undefined,
        temperature: undefined,
        respiratory_rate: undefined,
        oxygen_saturation: undefined,
        height_cm: undefined,
        weight_kg: undefined,
        notes: "",
      });
    }
  }, [existingVitals, open]);

  // Derived BMI
  const bmi = React.useMemo(() => {
    if (form.height_cm && form.weight_kg && form.height_cm > 0) {
      const heightM = form.height_cm / 100;
      return (form.weight_kg / (heightM * heightM)).toFixed(1);
    }
    return null;
  }, [form.height_cm, form.weight_kg]);

  const mutation = useMutation({
    mutationFn: async () => {
      return recordAppointmentVitalsFn({
        data: {
          clinicId,
          appointmentId,
          vitals: form,
        },
      });
    },
    onSuccess: () => {
      toast.success("Patient vitals recorded successfully");
      queryClient.invalidateQueries({
        queryKey: ["clinical-context", clinicId, appointmentId],
      });
      queryClient.invalidateQueries({
        queryKey: ["queue-entries", clinicId],
      });
      queryClient.invalidateQueries({
        queryKey: ["appointments", clinicId],
      });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to record patient vitals.");
    },
  });

  const handleNumberChange = (key: keyof VitalsInput, val: string) => {
    const num = val === "" ? undefined : parseFloat(val);
    setForm((prev) => ({ ...prev, [key]: Number.isNaN(num) ? undefined : num }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Record Patient Vitals
              </DialogTitle>
              <DialogDescription className="mt-1">
                Enter triage vital signs for{" "}
                <span className="font-semibold text-foreground">{patientName}</span>
                {patientNumber ? ` (${patientNumber})` : ""}. These vitals will be directly visible to the doctor in consultation.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {existingVitals && (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground border">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span>
              Previous vitals recorded at{" "}
              {new Date(existingVitals.recorded_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              . Updating here will overwrite or refine them.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          {/* Blood Pressure Systolic */}
          <div className="space-y-1.5 p-3 rounded-lg border bg-card/60">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Gauge className="h-4 w-4 text-rose-500" />
                Blood Pressure (BP)
              </Label>
              <span className="text-[11px] text-muted-foreground">mmHg</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div>
                <Label className="text-[10px] text-muted-foreground">Systolic</Label>
                <Input
                  type="number"
                  placeholder="120"
                  value={form.systolic_bp ?? ""}
                  onChange={(e) => handleNumberChange("systolic_bp", e.target.value)}
                  min={50}
                  max={260}
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Diastolic</Label>
                <Input
                  type="number"
                  placeholder="80"
                  value={form.diastolic_bp ?? ""}
                  onChange={(e) => handleNumberChange("diastolic_bp", e.target.value)}
                  min={30}
                  max={160}
                />
              </div>
            </div>
          </div>

          {/* Heart Rate */}
          <div className="space-y-1.5 p-3 rounded-lg border bg-card/60">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Heart className="h-4 w-4 text-red-500" />
                Pulse Rate
              </Label>
              <span className="text-[11px] text-muted-foreground">bpm</span>
            </div>
            <Input
              type="number"
              placeholder="72"
              value={form.heart_rate ?? ""}
              onChange={(e) => handleNumberChange("heart_rate", e.target.value)}
              min={30}
              max={240}
              className="mt-1"
            />
            <p className="text-[10px] text-muted-foreground">Normal resting: 60-100 bpm</p>
          </div>

          {/* Body Temperature */}
          <div className="space-y-1.5 p-3 rounded-lg border bg-card/60">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Thermometer className="h-4 w-4 text-amber-500" />
                Temperature
              </Label>
              <span className="text-[11px] text-muted-foreground">°F</span>
            </div>
            <Input
              type="number"
              step="0.1"
              placeholder="98.6"
              value={form.temperature ?? ""}
              onChange={(e) => handleNumberChange("temperature", e.target.value)}
              min={90}
              max={110}
              className="mt-1"
            />
            <p className="text-[10px] text-muted-foreground">Normal oral: 97.8°F - 99.1°F</p>
          </div>

          {/* Oxygen Saturation */}
          <div className="space-y-1.5 p-3 rounded-lg border bg-card/60">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-blue-500" />
                Oxygen Saturation (SpO2)
              </Label>
              <span className="text-[11px] text-muted-foreground">%</span>
            </div>
            <Input
              type="number"
              placeholder="98"
              value={form.oxygen_saturation ?? ""}
              onChange={(e) => handleNumberChange("oxygen_saturation", e.target.value)}
              min={60}
              max={100}
              className="mt-1"
            />
            <p className="text-[10px] text-muted-foreground">Normal: 95% - 100%</p>
          </div>

          {/* Respiratory Rate */}
          <div className="space-y-1.5 p-3 rounded-lg border bg-card/60">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Wind className="h-4 w-4 text-teal-500" />
                Respiratory Rate
              </Label>
              <span className="text-[11px] text-muted-foreground">breaths/min</span>
            </div>
            <Input
              type="number"
              placeholder="16"
              value={form.respiratory_rate ?? ""}
              onChange={(e) => handleNumberChange("respiratory_rate", e.target.value)}
              min={8}
              max={60}
              className="mt-1"
            />
            <p className="text-[10px] text-muted-foreground">Normal adult: 12-20 bpm</p>
          </div>

          {/* Height & Weight */}
          <div className="space-y-1.5 p-3 rounded-lg border bg-card/60">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Ruler className="h-4 w-4 text-indigo-500" />
                Height & Weight
              </Label>
              {bmi && (
                <Badge variant="outline" className="text-[11px] font-medium bg-secondary/50">
                  BMI: {bmi} kg/m²
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div>
                <Label className="text-[10px] text-muted-foreground">Height (cm)</Label>
                <Input
                  type="number"
                  placeholder="170"
                  value={form.height_cm ?? ""}
                  onChange={(e) => handleNumberChange("height_cm", e.target.value)}
                  min={30}
                  max={250}
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Weight (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="65"
                  value={form.weight_kg ?? ""}
                  onChange={(e) => handleNumberChange("weight_kg", e.target.value)}
                  min={1}
                  max={300}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Triage / Reception Notes */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Receptionist / Triage Notes (Optional)</Label>
          <Textarea
            placeholder="e.g., Patient complaining of mild dizziness for 2 days. Fasting status: not fasted."
            value={form.notes ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            rows={2}
          />
          <p className="text-[11px] text-muted-foreground">
            Note: Clinical diagnosis and medications can only be entered by the authorized doctor.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {mutation.isPending ? "Saving Vitals..." : "Save Vitals"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
