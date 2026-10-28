import * as React from "react";
import { Printer, Download, Pill, Calendar, Heart, ShieldCheck, Stethoscope } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { PrescriptionWithDetails } from "@/lib/clinical";
import { formatFrequencyLabel, formatMealTimingLabel } from "@/lib/clinical";

interface PrescriptionPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prescription: PrescriptionWithDetails | null;
  clinicName?: string;
  clinicAddress?: string;
  clinicPhone?: string;
}

export function PrescriptionPreviewDialog({
  open,
  onOpenChange,
  prescription,
  clinicName = "CareFlow Medical Center",
  clinicAddress = "CareFlow Health Suite, Medical District",
  clinicPhone,
}: PrescriptionPreviewDialogProps) {
  if (!prescription) return null;

  const doctorName = prescription.doctor?.display_name || "Doctor";
  const specialization = prescription.doctor?.specialization || "General Practitioner";
  const patient = prescription.patient;
  const consultation = prescription.consultation;
  const vitals = consultation?.vitals;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto print:p-0 print:border-none print:shadow-none">
        <DialogHeader className="print:hidden">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <Pill className="h-5 w-5 text-primary" />
              e-Prescription Document
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5">
                <Printer className="h-4 w-4" />
                Print / Save PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Prescription Paper Container */}
        <div id="printable-prescription" className="bg-card border rounded-lg p-6 sm:p-8 space-y-6 text-card-foreground print:border-none print:p-0">
          {/* Clinic Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b pb-5">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
                <Stethoscope className="h-6 w-6 text-primary" />
                {clinicName}
              </h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {clinicAddress}
                {clinicPhone && ` • Tel: ${clinicPhone}`}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="font-bold text-base text-foreground">{doctorName}</p>
              <p className="text-xs font-medium text-muted-foreground">{specialization}</p>
              {prescription.doctor?.department && (
                <p className="text-xs text-muted-foreground">Dept: {prescription.doctor.department}</p>
              )}
              <Badge variant="outline" className="mt-1 text-[10px] text-emerald-600 border-emerald-300">
                Verified Medical Practitioner
              </Badge>
            </div>
          </div>

          {/* Patient Demographics & Encounter Metadata */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg bg-muted/40 text-xs">
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Patient Name</span>
              <span className="font-semibold text-foreground text-sm">
                {patient ? `${patient.first_name} ${patient.last_name}` : "Patient"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Patient ID / Gender</span>
              <span className="font-medium text-foreground">
                {patient?.patient_number ? `#${patient.patient_number}` : "—"}
                {patient?.gender ? ` • ${patient.gender}` : ""}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Date of Visit</span>
              <span className="font-medium text-foreground">
                {new Date(prescription.created_at).toLocaleDateString([], {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Prescription Status</span>
              <Badge
                variant="outline"
                className={`text-[10px] uppercase font-bold ${
                  prescription.status === "COMPLETED"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300"
                    : "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-300"
                }`}
              >
                {prescription.status}
              </Badge>
            </div>
          </div>

          {/* Vitals Summary Banner if present */}
          {vitals && (
            <div className="p-3 rounded-lg border bg-secondary/30 text-xs space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase flex items-center gap-1">
                <Heart className="h-3 w-3 text-red-500" />
                Patient Vitals Recorded at Check-in
              </span>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-foreground">
                {vitals.systolic_bp && vitals.diastolic_bp && (
                  <span>
                    BP: <strong>{vitals.systolic_bp}/{vitals.diastolic_bp}</strong> mmHg
                  </span>
                )}
                {vitals.heart_rate && (
                  <span>
                    Pulse: <strong>{vitals.heart_rate}</strong> bpm
                  </span>
                )}
                {vitals.temperature && (
                  <span>
                    Temp: <strong>{vitals.temperature}</strong>°F
                  </span>
                )}
                {vitals.oxygen_saturation && (
                  <span>
                    SpO2: <strong>{vitals.oxygen_saturation}</strong>%
                  </span>
                )}
                {vitals.weight_kg && (
                  <span>
                    Weight: <strong>{vitals.weight_kg}</strong> kg
                  </span>
                )}
                {vitals.height_cm && (
                  <span>
                    Height: <strong>{vitals.height_cm}</strong> cm
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Diagnosis & Assessment */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Clinical Assessment & Diagnosis
            </h3>
            <div className="p-3.5 rounded-lg border bg-card text-sm font-medium text-foreground">
              {consultation?.assessment || consultation?.chief_complaint || "Routine Clinical Evaluation"}
            </div>
          </div>

          {/* Prescribed Medications (Rx) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                <span className="font-serif text-lg font-black italic">℞</span>
                Prescribed Medications
              </h3>
              <span className="text-xs text-muted-foreground">
                {prescription.items.length} medication{prescription.items.length === 1 ? "" : "s"}
              </span>
            </div>

            {prescription.items.length === 0 ? (
              <p className="text-xs italic text-muted-foreground p-3 border rounded-lg">
                No medications prescribed for this visit.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/50 text-muted-foreground font-semibold">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Medicine Name & Dosage</th>
                      <th className="py-2.5 px-3">Frequency</th>
                      <th className="py-2.5 px-3">Meal Timing</th>
                      <th className="py-2.5 px-3">Duration</th>
                      <th className="py-2.5 px-3">Special Instructions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {prescription.items.map((med, idx) => (
                      <tr key={med.id || idx} className="hover:bg-muted/20">
                        <td className="py-2.5 px-3 font-semibold text-muted-foreground">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-foreground text-sm block">
                            {(med as any).medicine_name || (med as any).medication_name || "Medicine"}
                          </span>
                          {med.dosage && (
                            <span className="text-xs text-muted-foreground font-mono">{med.dosage}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-medium">
                          <Badge variant="outline" className="font-mono text-[11px] bg-primary/5 text-primary border-primary/20">
                            {formatFrequencyLabel(med.frequency)}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 font-medium">
                          {(med as any).meal_timing ? (
                            <Badge variant="secondary" className="text-[10px]">
                              {formatMealTimingLabel((med as any).meal_timing)}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-foreground">
                          {med.duration || "As prescribed"}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground italic">
                          {med.instructions || "Take as directed"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Follow-up & Advice */}
          {(consultation?.clinical_notes || consultation?.follow_up_date || prescription.instructions) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {consultation?.clinical_notes && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Clinical Advice & Care Instructions
                  </span>
                  <p className="text-xs text-foreground p-3 border rounded-lg bg-card/60 whitespace-pre-wrap">
                    {consultation.clinical_notes}
                  </p>
                </div>
              )}
              {consultation?.follow_up_date && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-primary" />
                    Next Follow-up
                  </span>
                  <div className="p-3 border rounded-lg bg-card/60 text-xs">
                    <p className="font-bold text-primary text-sm">
                      {new Date(consultation.follow_up_date).toLocaleDateString([], {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    {consultation.follow_up_notes && (
                      <p className="text-muted-foreground mt-1">{consultation.follow_up_notes}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Doctor Signature & Security Footer */}
          <div className="border-t pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <span>
                Digitally authenticated and stored in CAREFLOW Electronic Medical Records.
              </span>
            </div>
            <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 min-w-40">
              <p className="font-serif italic text-base text-foreground font-semibold">
                Dr. {doctorName}
              </p>
              <p className="text-[11px] text-muted-foreground">Authorized Signature</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
