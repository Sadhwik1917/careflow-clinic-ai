import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Pill,
  Calendar,
  Clock,
  Printer,
  FileText,
  User,
  Heart,
  AlertCircle,
  Sun,
  Sunset,
  Moon,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { patientPrescriptionsQuery } from "@/lib/clinical-queries";
import type { PrescriptionWithDetails } from "@/lib/clinical";
import { formatFrequencyLabel, formatMealTimingLabel } from "@/lib/clinical";
import { PrescriptionPreviewDialog } from "./prescription-preview-dialog";

interface PatientPrescriptionsViewProps {
  clinicId?: string | undefined;
}

export function PatientPrescriptionsView({ clinicId }: PatientPrescriptionsViewProps) {
  const [selectedPrescription, setSelectedPrescription] = React.useState<PrescriptionWithDetails | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  const { data: prescriptions = [], isLoading, isError } = useQuery({
    ...patientPrescriptionsQuery(clinicId),
  });

  const handleOpenPreview = (rx: PrescriptionWithDetails) => {
    setSelectedPrescription(rx);
    setPreviewOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Pill className="h-5 w-5 text-primary" />
          My Prescriptions &amp; Medications
        </h2>
        <p className="text-xs text-muted-foreground">
          View your authenticated medical prescriptions, dosage schedules, and doctor instructions.
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-16 border rounded-xl bg-card space-y-3">
          <Pill className="h-8 w-8 text-primary mx-auto animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading your prescription history...</p>
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl bg-card/60 space-y-3">
          <Pill className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <h3 className="text-base font-semibold text-foreground">No prescriptions available</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Once a doctor completes your clinical consultation and issues an e-prescription, it will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {prescriptions.map((rx) => {
            const consultation = rx.consultation;
            const doctor = rx.doctor;
            const visitDate = new Date(rx.created_at).toLocaleDateString([], {
              weekday: "long",
              year: "numeric",
              month: "short",
              day: "numeric",
            });

            return (
              <Card key={rx.id} className="overflow-hidden border shadow-sm">
                <CardHeader className="bg-muted/30 border-b pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-base text-foreground flex items-center gap-1.5">
                          <Stethoscope className="h-4 w-4 text-primary" />
                          Dr. {doctor?.display_name || "Doctor"}
                        </span>
                        {doctor?.specialization && (
                          <Badge variant="outline" className="text-[10px]">
                            {doctor.specialization}
                          </Badge>
                        )}
                        <Badge className="bg-emerald-600 text-white text-[10px]">
                          Official Prescription
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {visitDate}
                        </span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenPreview(rx)}
                      className="gap-1.5 text-xs h-8"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      View / Print Prescription
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="p-6 space-y-5">
                  {/* Diagnosis & Advice */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-lg border bg-card/60 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Diagnosis / Clinical Assessment
                      </span>
                      <p className="text-sm font-semibold text-foreground">
                        {consultation?.assessment || "Clinical Consultation"}
                      </p>
                      {consultation?.chief_complaint && (
                        <p className="text-xs text-muted-foreground">
                          Symptoms: {consultation.chief_complaint}
                        </p>
                      )}
                    </div>

                    {consultation?.clinical_notes && (
                      <div className="p-3.5 rounded-lg border bg-card/60 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Doctor Advice &amp; Instructions
                        </span>
                        <p className="text-xs text-foreground whitespace-pre-wrap">
                          {consultation.clinical_notes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Medications Grid */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                      <Pill className="h-4 w-4" />
                      Medication Regimen ({rx.items.length})
                    </h4>

                    {rx.items.length === 0 ? (
                      <p className="text-xs italic text-muted-foreground">
                        No medications prescribed for this visit.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {rx.items.map((item, idx) => (
                          <div
                            key={item.id || idx}
                            className="p-3.5 rounded-xl border bg-card shadow-xs space-y-2 hover:border-primary/40 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-bold text-sm text-foreground block">
                                  {(item as any).medicine_name || (item as any).medication_name || "Medicine"}
                                </span>
                                {item.dosage && (
                                  <span className="text-xs text-muted-foreground font-mono">
                                    {item.dosage}
                                  </span>
                                )}
                              </div>
                              <Badge
                                variant="outline"
                                className="font-mono text-[10px] font-bold bg-primary/5 text-primary border-primary/20"
                              >
                                {formatFrequencyLabel(item.frequency)}
                              </Badge>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                              {(item as any).meal_timing && (
                                <Badge variant="secondary" className="text-[10px]">
                                  {formatMealTimingLabel((item as any).meal_timing)}
                                </Badge>
                              )}
                              {item.duration && (
                                <span className="text-muted-foreground">
                                  Duration: <strong>{item.duration}</strong>
                                </span>
                              )}
                            </div>

                            {item.instructions && (
                              <p className="text-[11px] text-muted-foreground italic border-t pt-1.5 mt-1">
                                {item.instructions}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Follow-up if any */}
                  {consultation?.follow_up_date && (
                    <div className="flex items-center gap-2 p-3 rounded-lg border bg-primary/5 text-xs text-primary">
                      <Calendar className="h-4 w-4" />
                      <span>
                        Follow-up scheduled on{" "}
                        <strong>
                          {new Date(consultation.follow_up_date).toLocaleDateString([], {
                            weekday: "short",
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </strong>
                        {consultation.follow_up_notes && ` — ${consultation.follow_up_notes}`}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Prescription Preview Dialog */}
      <PrescriptionPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        prescription={selectedPrescription}
      />
    </div>
  );
}
