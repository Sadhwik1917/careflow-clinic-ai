import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  History,
  Stethoscope,
  Activity,
  Heart,
  Thermometer,
  Wind,
  Gauge,
  Ruler,
  Weight,
  Pill,
  Calendar,
  Clock,
  Printer,
  FileText,
  Search,
  ShieldCheck,
  Building2,
  AlertCircle,
  Eye,
  CheckCircle2,
  CalendarClock,
  Info,
  User,
  HeartPulse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageTitle } from "@/components/careflow/page-title";
import { StatisticsCard } from "@/components/careflow/statistics-card";
import { StatusBadge, EmptyState, LoadingState } from "@/components/careflow/feedback";
import { patientMedicalHistoryQuery } from "@/lib/clinical-queries";
import type {
  PatientMedicalHistoryRecord,
  PatientMedicalHistoryEncounter,
  PrescriptionWithDetails,
  VitalsRow,
} from "@/lib/clinical";
import { formatFrequencyLabel, formatMealTimingLabel } from "@/lib/clinical";
import { PrescriptionPreviewDialog } from "./prescription-preview-dialog";

interface PatientMedicalHistoryViewProps {
  userId?: string | undefined;
  clinicId?: string | undefined;
}

function calculateBMI(weightKg: number | null | undefined, heightCm: number | null | undefined): string | null {
  if (!weightKg || !heightCm || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return bmi.toFixed(1);
}

function formatDateDisplay(isoDateString?: string | null): string {
  if (!isoDateString) return "—";
  try {
    return new Date(isoDateString).toLocaleDateString([], {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoDateString;
  }
}

function formatDateTimeDisplay(isoDateString?: string | null): string {
  if (!isoDateString) return "—";
  try {
    return new Date(isoDateString).toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoDateString;
  }
}

export function PatientMedicalHistoryView({ clinicId }: PatientMedicalHistoryViewProps) {
  const [activeTab, setActiveTab] = React.useState<string>("encounters");
  const [searchTerm, setSearchTerm] = React.useState<string>("");

  // Encounter details modal
  const [selectedEncounter, setSelectedEncounter] = React.useState<PatientMedicalHistoryEncounter | null>(null);
  const [encounterModalOpen, setEncounterModalOpen] = React.useState<boolean>(false);

  // Prescription preview dialog
  const [previewRx, setPreviewRx] = React.useState<PrescriptionWithDetails | null>(null);
  const [previewRxOpen, setPreviewRxOpen] = React.useState<boolean>(false);

  const {
    data: historyRecord,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    ...patientMedicalHistoryQuery(clinicId),
  });

  const patient = historyRecord?.patient;
  const encounters = historyRecord?.encounters ?? [];
  const vitalsHistory = historyRecord?.vitalsHistory ?? [];
  const prescriptions = historyRecord?.prescriptions ?? [];

  // Extract all distinct diagnoses from encounters
  const diagnoses = React.useMemo(() => {
    return encounters
      .filter((e) => Boolean(e.assessment?.trim()))
      .map((e) => ({
        id: e.id,
        assessment: e.assessment!.trim(),
        chiefComplaint: e.chief_complaint,
        date: e.completed_at || e.created_at,
        doctor: e.doctor,
        clinic: e.clinic,
        encounter: e,
      }));
  }, [encounters]);

  // Extract all medications from prescriptions
  const allMedications = React.useMemo(() => {
    const list: Array<{
      id: string;
      medicine_name: string;
      dosage: string | null;
      frequency: string | null;
      duration: string | null;
      meal_timing: string | null;
      instructions: string | null;
      prescription_date: string;
      doctor: PrescriptionWithDetails["doctor"];
      clinicId: string;
      prescription: PrescriptionWithDetails;
    }> = [];

    for (const rx of prescriptions) {
      for (const item of rx.items ?? []) {
        list.push({
          id: item.id || `${rx.id}-${list.length}`,
          medicine_name: item.medicine_name,
          dosage: item.dosage,
          frequency: item.frequency,
          duration: item.duration,
          meal_timing: (item as any).meal_timing || null,
          instructions: item.instructions,
          prescription_date: rx.prescription_date,
          doctor: rx.doctor,
          clinicId: rx.clinic_id,
          prescription: rx,
        });
      }
    }
    return list;
  }, [prescriptions]);

  // Filtered Encounters
  const filteredEncounters = React.useMemo(() => {
    const query = searchTerm.toLowerCase().trim();
    if (!query) return encounters;
    return encounters.filter((e) => {
      const matchDoc = e.doctor?.display_name?.toLowerCase().includes(query) ?? false;
      const matchSpec = e.doctor?.specialization?.toLowerCase().includes(query) ?? false;
      const matchAssessment = e.assessment?.toLowerCase().includes(query) ?? false;
      const matchComplaint = e.chief_complaint?.toLowerCase().includes(query) ?? false;
      const matchNotes = e.clinical_notes?.toLowerCase().includes(query) ?? false;
      const matchClinic = e.clinic?.name?.toLowerCase().includes(query) ?? false;
      return matchDoc || matchSpec || matchAssessment || matchComplaint || matchNotes || matchClinic;
    });
  }, [encounters, searchTerm]);

  // Filtered Diagnoses
  const filteredDiagnoses = React.useMemo(() => {
    const query = searchTerm.toLowerCase().trim();
    if (!query) return diagnoses;
    return diagnoses.filter((d) => {
      const matchAssessment = d.assessment.toLowerCase().includes(query);
      const matchComplaint = d.chiefComplaint?.toLowerCase().includes(query) ?? false;
      const matchDoc = d.doctor?.display_name?.toLowerCase().includes(query) ?? false;
      const matchClinic = d.clinic?.name?.toLowerCase().includes(query) ?? false;
      return matchAssessment || matchComplaint || matchDoc || matchClinic;
    });
  }, [diagnoses, searchTerm]);

  // Filtered Vitals
  const filteredVitals = React.useMemo(() => {
    const query = searchTerm.toLowerCase().trim();
    if (!query) return vitalsHistory;
    return vitalsHistory.filter((v) => {
      const matchClinic = v.clinic?.name?.toLowerCase().includes(query) ?? false;
      const matchDate = v.recorded_at.toLowerCase().includes(query);
      return matchClinic || matchDate;
    });
  }, [vitalsHistory, searchTerm]);

  // Filtered Medications
  const filteredMedications = React.useMemo(() => {
    const query = searchTerm.toLowerCase().trim();
    if (!query) return allMedications;
    return allMedications.filter((m) => {
      const matchMed = m.medicine_name.toLowerCase().includes(query);
      const matchDoc = m.doctor?.display_name?.toLowerCase().includes(query) ?? false;
      const matchInstr = m.instructions?.toLowerCase().includes(query) ?? false;
      return matchMed || matchDoc || matchInstr;
    });
  }, [allMedications, searchTerm]);

  const handleOpenPreview = (rx: PrescriptionWithDetails) => {
    setPreviewRx(rx);
    setPreviewRxOpen(true);
  };

  const handleOpenEncounter = (enc: PatientMedicalHistoryEncounter) => {
    setSelectedEncounter(enc);
    setEncounterModalOpen(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const patientName = patient
    ? `${patient.first_name} ${patient.last_name || ""}`.trim()
    : "Patient";

  if (isLoading) {
    return <LoadingState label="Loading your clinical medical history…" />;
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageTitle
          title="Medical history"
          description="Your authenticated clinical encounters, diagnoses, vitals, and treatments."
        />
        <div className="p-6 border border-destructive/20 rounded-xl bg-destructive/5 space-y-3">
          <div className="flex items-center gap-2 text-destructive font-semibold">
            <AlertCircle className="h-5 w-5" />
            <span>Unable to load clinical records</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {(error as any)?.message || "A secure connection error occurred while querying your clinical records."}
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1.5 text-xs">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const hasAnyRecords =
    encounters.length > 0 || vitalsHistory.length > 0 || prescriptions.length > 0;

  return (
    <div className="space-y-8">
      {/* Header and Page Actions */}
      <PageTitle
        title="Medical history"
        description="Your chronological clinical encounters, official diagnoses, vitals records, and treatments."
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Badge
              variant="outline"
              className="text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 flex items-center gap-1 py-1"
            >
              <ShieldCheck className="size-3.5" /> Official Record • Read-Only
            </Badge>
            <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5 h-8 text-xs">
              <Printer className="size-3.5" /> Print records
            </Button>
          </div>
        }
      />

      {/* Patient Demographic Health Header Card */}
      {patient && (
        <Card className="rounded-lg border bg-card/60 shadow-xs">
          <CardHeader className="pb-3 pt-4 px-4 sm:px-6 border-b">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                  {patientName.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-foreground">{patientName}</h2>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      #{patient.patient_number}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Registered with {patient.clinic?.name || "CareFlow Medical Clinic"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                {patient.gender && (
                  <div>
                    <span className="text-[10px] uppercase font-semibold block text-muted-foreground/80">Gender</span>
                    <span className="font-medium text-foreground">{patient.gender}</span>
                  </div>
                )}
                {patient.date_of_birth && (
                  <div>
                    <span className="text-[10px] uppercase font-semibold block text-muted-foreground/80">Date of Birth</span>
                    <span className="font-medium text-foreground">{patient.date_of_birth}</span>
                  </div>
                )}
                {patient.phone && (
                  <div>
                    <span className="text-[10px] uppercase font-semibold block text-muted-foreground/80">Phone</span>
                    <span className="font-medium text-foreground">{patient.phone}</span>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>

          {patient.notes && (
            <CardContent className="py-3 px-4 sm:px-6 text-xs bg-muted/20 border-t">
              <div className="flex items-start gap-2 text-muted-foreground">
                <Info className="size-3.5 shrink-0 mt-0.5 text-primary" />
                <p>
                  <strong className="text-foreground">Clinical Care Remarks:</strong> {patient.notes}
                </p>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Summary Statistics Overview */}
      <section aria-label="Clinical statistics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatisticsCard
          label="Clinical encounters"
          value={encounters.length}
          detail="Completed consultations"
          icon={Stethoscope}
        />
        <StatisticsCard
          label="Diagnoses on file"
          value={diagnoses.length}
          detail="Official clinical assessments"
          icon={Activity}
        />
        <StatisticsCard
          label="Vitals recorded"
          value={vitalsHistory.length}
          detail="Recorded health metrics"
          icon={HeartPulse}
        />
        <StatisticsCard
          label="Prescriptions on file"
          value={prescriptions.length}
          detail="Official e-prescriptions"
          icon={Pill}
        />
      </section>

      {!hasAnyRecords ? (
        <EmptyState
          title="No medical history on record"
          description="When you complete clinic visits and your care team records vitals, diagnoses, or prescriptions, your medical history will appear here."
          icon={History}
        />
      ) : (
        <div className="space-y-6">
          {/* Tabs and Search Controls */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-3 print:hidden">
              <TabsList className="grid grid-cols-2 sm:grid-cols-4 h-auto p-1 bg-muted/60">
                <TabsTrigger value="encounters" className="text-xs py-2">
                  Encounters ({encounters.length})
                </TabsTrigger>
                <TabsTrigger value="diagnoses" className="text-xs py-2">
                  Diagnoses ({diagnoses.length})
                </TabsTrigger>
                <TabsTrigger value="vitals" className="text-xs py-2">
                  Vitals ({vitalsHistory.length})
                </TabsTrigger>
                <TabsTrigger value="medications" className="text-xs py-2">
                  Medications ({allMedications.length})
                </TabsTrigger>
              </TabsList>

              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filter records…"
                  className="pl-8 text-xs h-8"
                  aria-label="Filter medical records"
                />
              </div>
            </div>

            {/* TAB 1: CLINICAL ENCOUNTERS */}
            <TabsContent value="encounters" className="space-y-4 m-0">
              {filteredEncounters.length === 0 ? (
                <EmptyState
                  title={searchTerm ? "No matching encounters" : "No completed encounters"}
                  description={
                    searchTerm
                      ? `No consultations match "${searchTerm}".`
                      : "When doctors complete your clinical visits, official consultation summaries will appear here."
                  }
                  icon={Stethoscope}
                />
              ) : (
                <div className="space-y-4">
                  {filteredEncounters.map((encounter) => {
                    const visitDate = formatDateDisplay(encounter.completed_at || encounter.created_at);
                    const doctorName = encounter.doctor?.display_name || "Doctor";
                    const hasVitals = Boolean(encounter.vitals);
                    const hasPrescriptions = encounter.prescriptions.length > 0;

                    return (
                      <Card key={encounter.id} className="overflow-hidden border shadow-xs hover:border-primary/40 transition-colors">
                        <CardHeader className="bg-muted/30 border-b pb-3 pt-3 px-4 sm:px-6">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-sm sm:text-base text-foreground flex items-center gap-1.5">
                                  <Stethoscope className="h-4 w-4 text-primary" />
                                  Dr. {doctorName}
                                </span>
                                {encounter.doctor?.specialization && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {encounter.doctor.specialization}
                                  </Badge>
                                )}
                                <Badge className="bg-emerald-600 text-white text-[10px]">
                                  Completed Encounter
                                </Badge>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3.5 w-3.5" />
                                  {visitDate}
                                </span>
                                <span>·</span>
                                <span>{encounter.clinic?.name || "Medical Clinic"}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenEncounter(encounter)}
                                className="h-8 text-xs gap-1.5"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Encounter details
                              </Button>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="p-4 sm:p-6 space-y-4">
                          {/* Assessment & Chief Complaint */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-3.5 rounded-lg border bg-card/60 space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Clinical Assessment / Diagnosis
                              </span>
                              <p className="text-sm font-semibold text-foreground">
                                {encounter.assessment || "Routine Clinical Consultation"}
                              </p>
                              {encounter.chief_complaint && (
                                <p className="text-xs text-muted-foreground pt-1">
                                  <strong className="text-foreground/80">Reported Symptoms:</strong>{" "}
                                  {encounter.chief_complaint}
                                </p>
                              )}
                            </div>

                            {encounter.clinical_notes && (
                              <div className="p-3.5 rounded-lg border bg-card/60 space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                  Doctor Instructions &amp; Advice
                                </span>
                                <p className="text-xs text-foreground whitespace-pre-wrap">
                                  {encounter.clinical_notes}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Linked Vitals at this Encounter */}
                          {hasVitals && encounter.vitals && (
                            <div className="space-y-2 pt-1 border-t">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                                <Activity className="h-3.5 w-3.5" />
                                Vitals Recorded at Visit
                              </span>
                              <div className="flex flex-wrap gap-2 text-xs">
                                {encounter.vitals.blood_pressure_systolic != null &&
                                  encounter.vitals.blood_pressure_diastolic != null && (
                                    <div className="px-2.5 py-1.5 rounded-md border bg-muted/30">
                                      <span className="text-muted-foreground text-[10px] block">Blood Pressure</span>
                                      <span className="font-semibold text-foreground">
                                        {encounter.vitals.blood_pressure_systolic}/
                                        {encounter.vitals.blood_pressure_diastolic} mmHg
                                      </span>
                                    </div>
                                  )}
                                {encounter.vitals.heart_rate != null && (
                                  <div className="px-2.5 py-1.5 rounded-md border bg-muted/30">
                                    <span className="text-muted-foreground text-[10px] block">Heart Rate</span>
                                    <span className="font-semibold text-foreground">
                                      {encounter.vitals.heart_rate} bpm
                                    </span>
                                  </div>
                                )}
                                {encounter.vitals.temperature != null && (
                                  <div className="px-2.5 py-1.5 rounded-md border bg-muted/30">
                                    <span className="text-muted-foreground text-[10px] block">Temperature</span>
                                    <span className="font-semibold text-foreground">
                                      {encounter.vitals.temperature} °F
                                    </span>
                                  </div>
                                )}
                                {encounter.vitals.oxygen_saturation != null && (
                                  <div className="px-2.5 py-1.5 rounded-md border bg-muted/30">
                                    <span className="text-muted-foreground text-[10px] block">Oxygen (SpO2)</span>
                                    <span className="font-semibold text-foreground">
                                      {encounter.vitals.oxygen_saturation}%
                                    </span>
                                  </div>
                                )}
                                {encounter.vitals.weight != null && (
                                  <div className="px-2.5 py-1.5 rounded-md border bg-muted/30">
                                    <span className="text-muted-foreground text-[10px] block">Weight</span>
                                    <span className="font-semibold text-foreground">
                                      {encounter.vitals.weight} kg
                                    </span>
                                  </div>
                                )}
                                {encounter.vitals.height != null && (
                                  <div className="px-2.5 py-1.5 rounded-md border bg-muted/30">
                                    <span className="text-muted-foreground text-[10px] block">Height</span>
                                    <span className="font-semibold text-foreground">
                                      {encounter.vitals.height} cm
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Linked Prescriptions */}
                          {hasPrescriptions && (
                            <div className="space-y-2 pt-1 border-t">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                                  <Pill className="h-3.5 w-3.5" />
                                  Medications Prescribed ({encounter.prescriptions[0]?.items?.length ?? 0})
                                </span>
                                {encounter.prescriptions[0] && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleOpenPreview(encounter.prescriptions[0]!)}
                                    className="text-xs h-7 text-primary hover:text-primary gap-1"
                                  >
                                    <Printer className="h-3 w-3" />
                                    View / Print Prescription
                                  </Button>
                                )}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                                {encounter.prescriptions[0]?.items.map((item, idx) => (
                                  <div key={item.id || idx} className="p-2.5 rounded-md border bg-card/60">
                                    <span className="font-semibold text-foreground block">
                                      {item.medicine_name}
                                    </span>
                                    <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1 mt-0.5">
                                      {item.dosage && <span>{item.dosage}</span>}
                                      {item.frequency && (
                                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                                          {formatFrequencyLabel(item.frequency)}
                                        </Badge>
                                      )}
                                      {item.duration && <span>· {item.duration}</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Follow-up if scheduled */}
                          {encounter.follow_up_date && (
                            <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-primary/5 text-xs text-primary">
                              <CalendarClock className="h-4 w-4 shrink-0" />
                              <span>
                                Recommended follow-up on{" "}
                                <strong>{formatDateDisplay(encounter.follow_up_date)}</strong>
                                {encounter.follow_up_notes && ` — ${encounter.follow_up_notes}`}
                              </span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* TAB 2: DIAGNOSES */}
            <TabsContent value="diagnoses" className="space-y-4 m-0">
              {filteredDiagnoses.length === 0 ? (
                <EmptyState
                  title={searchTerm ? "No matching diagnoses" : "No diagnoses on file"}
                  description={
                    searchTerm
                      ? `No clinical diagnoses match "${searchTerm}".`
                      : "Official diagnoses documented during completed doctor consultations will be summarized here."
                  }
                  icon={Activity}
                />
              ) : (
                <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card text-xs">
                  {filteredDiagnoses.map((diag) => (
                    <div
                      key={diag.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground">{diag.assessment}</span>
                          <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                            Verified Assessment
                          </Badge>
                        </div>
                        {diag.chiefComplaint && (
                          <p className="text-muted-foreground">
                            Presented symptoms: {diag.chiefComplaint}
                          </p>
                        )}
                        <p className="text-muted-foreground text-[11px]">
                          Diagnosed on {formatDateDisplay(diag.date)} by Dr.{" "}
                          {diag.doctor?.display_name || "Doctor"} ({diag.doctor?.specialization || "Physician"}) ·{" "}
                          {diag.clinic?.name || "Clinic"}
                        </p>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenEncounter(diag.encounter)}
                        className="h-8 text-xs shrink-0 self-start sm:self-center"
                      >
                        <Eye className="size-3.5 mr-1" /> View visit
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* TAB 3: VITALS HISTORY */}
            <TabsContent value="vitals" className="space-y-4 m-0">
              {filteredVitals.length === 0 ? (
                <EmptyState
                  title={searchTerm ? "No matching vitals records" : "No vitals on file"}
                  description={
                    searchTerm
                      ? `No recorded health metrics match "${searchTerm}".`
                      : "When clinic staff or doctors record your vitals (blood pressure, heart rate, temperature, weight), they will be listed chronologically here."
                  }
                  icon={HeartPulse}
                />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredVitals.map((v) => {
                      const recordedDate = formatDateTimeDisplay(v.recorded_at);
                      const bmi = calculateBMI(v.weight, v.height);

                      return (
                        <Card key={v.id} className="border shadow-xs">
                          <CardHeader className="p-3.5 bg-muted/30 border-b">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                <Clock className="size-3.5 text-primary" />
                                {recordedDate}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {v.clinic?.name || "Clinic"}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="p-3.5 space-y-2 text-xs">
                            <div className="grid grid-cols-2 gap-2">
                              {v.blood_pressure_systolic != null && v.blood_pressure_diastolic != null && (
                                <div className="p-2 rounded bg-card/80 border">
                                  <span className="text-[10px] text-muted-foreground block flex items-center gap-1">
                                    <Gauge className="size-3 text-primary" /> Blood Pressure
                                  </span>
                                  <span className="font-bold text-foreground">
                                    {v.blood_pressure_systolic}/{v.blood_pressure_diastolic} mmHg
                                  </span>
                                </div>
                              )}
                              {v.heart_rate != null && (
                                <div className="p-2 rounded bg-card/80 border">
                                  <span className="text-[10px] text-muted-foreground block flex items-center gap-1">
                                    <Heart className="size-3 text-red-500" /> Pulse / Heart Rate
                                  </span>
                                  <span className="font-bold text-foreground">{v.heart_rate} bpm</span>
                                </div>
                              )}
                              {v.temperature != null && (
                                <div className="p-2 rounded bg-card/80 border">
                                  <span className="text-[10px] text-muted-foreground block flex items-center gap-1">
                                    <Thermometer className="size-3 text-amber-500" /> Temperature
                                  </span>
                                  <span className="font-bold text-foreground">{v.temperature} °F</span>
                                </div>
                              )}
                              {v.oxygen_saturation != null && (
                                <div className="p-2 rounded bg-card/80 border">
                                  <span className="text-[10px] text-muted-foreground block flex items-center gap-1">
                                    <Wind className="size-3 text-sky-500" /> Oxygen Sat (SpO2)
                                  </span>
                                  <span className="font-bold text-foreground">{v.oxygen_saturation}%</span>
                                </div>
                              )}
                              {v.weight != null && (
                                <div className="p-2 rounded bg-card/80 border">
                                  <span className="text-[10px] text-muted-foreground block flex items-center gap-1">
                                    <Weight className="size-3 text-primary" /> Weight
                                  </span>
                                  <span className="font-bold text-foreground">{v.weight} kg</span>
                                </div>
                              )}
                              {v.height != null && (
                                <div className="p-2 rounded bg-card/80 border">
                                  <span className="text-[10px] text-muted-foreground block flex items-center gap-1">
                                    <Ruler className="size-3 text-primary" /> Height
                                  </span>
                                  <span className="font-bold text-foreground">{v.height} cm</span>
                                </div>
                              )}
                            </div>

                            {bmi && (
                              <div className="pt-1.5 border-t flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>Calculated Body Mass Index (BMI):</span>
                                <Badge variant="secondary" className="font-mono text-[10px]">
                                  {bmi} kg/m²
                                </Badge>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* TAB 4: MEDICATIONS HISTORY */}
            <TabsContent value="medications" className="space-y-4 m-0">
              {filteredMedications.length === 0 ? (
                <EmptyState
                  title={searchTerm ? "No matching medications" : "No medications on record"}
                  description={
                    searchTerm
                      ? `No medications match "${searchTerm}".`
                      : "Prescribed medicines and dosage regimens will appear here once doctors issue e-prescriptions."
                  }
                  icon={Pill}
                />
              ) : (
                <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card text-xs">
                  {filteredMedications.map((med, idx) => (
                    <div
                      key={med.id || idx}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                            <Pill className="size-3.5 text-primary" />
                            {med.medicine_name}
                          </span>
                          {med.dosage && (
                            <span className="text-muted-foreground font-mono">({med.dosage})</span>
                          )}
                          {med.frequency && (
                            <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                              {formatFrequencyLabel(med.frequency)}
                            </Badge>
                          )}
                          {med.meal_timing && (
                            <Badge variant="secondary" className="text-[10px]">
                              {formatMealTimingLabel(med.meal_timing)}
                            </Badge>
                          )}
                        </div>

                        {med.duration && (
                          <p className="text-muted-foreground text-[11px]">
                            Prescribed duration: <strong>{med.duration}</strong>
                          </p>
                        )}

                        {med.instructions && (
                          <p className="text-muted-foreground italic text-[11px]">
                            Directions: {med.instructions}
                          </p>
                        )}

                        <p className="text-muted-foreground text-[10px] pt-1">
                          Prescribed on {formatDateDisplay(med.prescription_date)} by Dr.{" "}
                          {med.doctor?.display_name || "Doctor"} ({med.doctor?.specialization || "Practitioner"})
                        </p>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenPreview(med.prescription)}
                        className="h-8 text-xs shrink-0 self-start sm:self-center gap-1.5"
                      >
                        <Printer className="size-3" /> View Prescription
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Full Encounter Details Modal */}
      <Dialog open={encounterModalOpen} onOpenChange={setEncounterModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedEncounter && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base font-bold flex items-center gap-2">
                  <Stethoscope className="size-4 text-primary" />
                  Clinical Encounter Details
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Visit on {formatDateDisplay(selectedEncounter.completed_at || selectedEncounter.created_at)} ·{" "}
                  Dr. {selectedEncounter.doctor?.display_name || "Doctor"} ({selectedEncounter.doctor?.specialization || "Practitioner"})
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2 text-xs">
                {/* Doctor & Clinic */}
                <div className="p-3 rounded-lg border bg-muted/30 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">
                      Dr. {selectedEncounter.doctor?.display_name || "Doctor"}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {selectedEncounter.doctor?.specialization || "General Medicine"}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    {selectedEncounter.clinic?.name || "CareFlow Medical Clinic"}
                    {selectedEncounter.clinic?.address ? ` · ${selectedEncounter.clinic.address}` : ""}
                  </p>
                </div>

                {/* Diagnosis & Symptoms */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Clinical Assessment &amp; Symptoms
                  </span>
                  <div className="p-3 rounded-lg border bg-card space-y-1">
                    <p className="font-semibold text-foreground text-sm">
                      {selectedEncounter.assessment || "Clinical Consultation"}
                    </p>
                    {selectedEncounter.chief_complaint && (
                      <p className="text-muted-foreground text-xs">
                        <strong>Chief Complaint:</strong> {selectedEncounter.chief_complaint}
                      </p>
                    )}
                  </div>
                </div>

                {/* Doctor Advice / Clinical Notes */}
                {selectedEncounter.clinical_notes && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Doctor Advice &amp; Clinical Notes
                    </span>
                    <div className="p-3 rounded-lg border bg-card text-foreground whitespace-pre-wrap">
                      {selectedEncounter.clinical_notes}
                    </div>
                  </div>
                )}

                {/* Vitals at this Encounter */}
                {selectedEncounter.vitals && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Encounter Vitals
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {selectedEncounter.vitals.blood_pressure_systolic != null &&
                        selectedEncounter.vitals.blood_pressure_diastolic != null && (
                          <div className="p-2 rounded border bg-muted/20">
                            <span className="text-[10px] text-muted-foreground block">Blood Pressure</span>
                            <span className="font-semibold text-foreground">
                              {selectedEncounter.vitals.blood_pressure_systolic}/
                              {selectedEncounter.vitals.blood_pressure_diastolic} mmHg
                            </span>
                          </div>
                        )}
                      {selectedEncounter.vitals.heart_rate != null && (
                        <div className="p-2 rounded border bg-muted/20">
                          <span className="text-[10px] text-muted-foreground block">Heart Rate</span>
                          <span className="font-semibold text-foreground">
                            {selectedEncounter.vitals.heart_rate} bpm
                          </span>
                        </div>
                      )}
                      {selectedEncounter.vitals.temperature != null && (
                        <div className="p-2 rounded border bg-muted/20">
                          <span className="text-[10px] text-muted-foreground block">Temperature</span>
                          <span className="font-semibold text-foreground">
                            {selectedEncounter.vitals.temperature} °F
                          </span>
                        </div>
                      )}
                      {selectedEncounter.vitals.oxygen_saturation != null && (
                        <div className="p-2 rounded border bg-muted/20">
                          <span className="text-[10px] text-muted-foreground block">SpO2</span>
                          <span className="font-semibold text-foreground">
                            {selectedEncounter.vitals.oxygen_saturation}%
                          </span>
                        </div>
                      )}
                      {selectedEncounter.vitals.weight != null && (
                        <div className="p-2 rounded border bg-muted/20">
                          <span className="text-[10px] text-muted-foreground block">Weight</span>
                          <span className="font-semibold text-foreground">
                            {selectedEncounter.vitals.weight} kg
                          </span>
                        </div>
                      )}
                      {selectedEncounter.vitals.height != null && (
                        <div className="p-2 rounded border bg-muted/20">
                          <span className="text-[10px] text-muted-foreground block">Height</span>
                          <span className="font-semibold text-foreground">
                            {selectedEncounter.vitals.height} cm
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Prescriptions issued */}
                {selectedEncounter.prescriptions.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                        Prescribed Medications
                      </span>
                      {selectedEncounter.prescriptions[0] && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEncounterModalOpen(false);
                            handleOpenPreview(selectedEncounter.prescriptions[0]!);
                          }}
                          className="h-6 text-xs text-primary hover:text-primary gap-1"
                        >
                          <Printer className="size-3" /> Full Prescription
                        </Button>
                      )}
                    </div>
                    <div className="divide-y divide-border rounded-lg border bg-card">
                      {selectedEncounter.prescriptions[0]?.items.map((item, idx) => (
                        <div key={item.id || idx} className="p-2.5 flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-foreground block">{item.medicine_name}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {item.dosage ? `${item.dosage} · ` : ""}
                              {formatFrequencyLabel(item.frequency)}
                              {item.duration ? ` · ${item.duration}` : ""}
                            </span>
                          </div>
                          {item.instructions && (
                            <span className="text-[11px] text-muted-foreground italic max-w-xs text-right">
                              {item.instructions}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Follow-up */}
                {selectedEncounter.follow_up_date && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-primary/5 text-primary text-xs">
                    <CalendarClock className="size-4 shrink-0" />
                    <span>
                      Follow-up recommended on{" "}
                      <strong>{formatDateDisplay(selectedEncounter.follow_up_date)}</strong>
                      {selectedEncounter.follow_up_notes && ` — ${selectedEncounter.follow_up_notes}`}
                    </span>
                  </div>
                )}
              </div>

              <DialogFooter className="pt-3 border-t">
                <Button size="sm" variant="outline" onClick={() => setEncounterModalOpen(false)}>
                  Dismiss
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Prescription Preview Dialog */}
      <PrescriptionPreviewDialog
        open={previewRxOpen}
        onOpenChange={setPreviewRxOpen}
        prescription={previewRx}
      />
    </div>
  );
}

