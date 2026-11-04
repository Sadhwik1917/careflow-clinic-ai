import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Pill,
  Search,
  Printer,
  Calendar,
  User,
  CheckCircle2,
  Clock,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { doctorPrescriptionsQuery } from "@/lib/clinical-queries";
import type { PrescriptionWithDetails } from "@/lib/clinical";
import { PrescriptionPreviewDialog } from "./prescription-preview-dialog";

interface PrescriptionsListProps {
  clinicId: string;
  doctorProfileId?: string;
}

export function PrescriptionsList({ clinicId, doctorProfileId }: PrescriptionsListProps) {
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [selectedPrescription, setSelectedPrescription] = React.useState<PrescriptionWithDetails | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  const { data: prescriptions = [], isLoading } = useQuery({
    ...doctorPrescriptionsQuery(clinicId, doctorProfileId),
  });

  const filteredPrescriptions = React.useMemo(() => {
    return prescriptions.filter((p) => {
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (!search.trim()) return true;

      const q = search.toLowerCase();
      const patientName = `${p.patient?.first_name || ""} ${p.patient?.last_name || ""}`.toLowerCase();
      const patientNum = (p.patient?.patient_number || "").toLowerCase();
      const assessment = (p.consultation?.assessment || "").toLowerCase();
      const meds = p.items.map((i) => i.medicine_name.toLowerCase()).join(" ");

      return (
        patientName.includes(q) ||
        patientNum.includes(q) ||
        assessment.includes(q) ||
        meds.includes(q)
      );
    });
  }, [prescriptions, search, statusFilter]);

  const handleOpenPreview = (rx: PrescriptionWithDetails) => {
    setSelectedPrescription(rx);
    setPreviewOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl border bg-card shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by patient name, ID, diagnosis, or medicine..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9 text-xs">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">All Statuses</SelectItem>
              <SelectItem value="COMPLETED" className="text-xs">Completed</SelectItem>
              <SelectItem value="ACTIVE" className="text-xs">Active / Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Prescriptions Table */}
      {isLoading ? (
        <div className="text-center py-16 border rounded-xl bg-card space-y-3">
          <Pill className="h-8 w-8 text-primary mx-auto animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading e-prescriptions...</p>
        </div>
      ) : filteredPrescriptions.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl bg-card/50 space-y-3">
          <Pill className="h-10 w-10 text-muted-foreground/50 mx-auto" />
          <h3 className="text-base font-semibold text-foreground">No prescriptions found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {search || statusFilter !== "ALL"
              ? "No prescriptions match your search criteria."
              : "Prescriptions created during patient consultations will automatically appear here."}
          </p>
        </div>
      ) : (
        <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b text-muted-foreground font-semibold">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Patient</th>
                  <th className="py-3 px-4">Diagnosis / Assessment</th>
                  <th className="py-3 px-4">Prescribed Medicines</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredPrescriptions.map((rx) => {
                  const patient = rx.patient;
                  const consultation = rx.consultation;
                  const isCompleted = rx.status === "COMPLETED";

                  return (
                    <tr key={rx.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-medium text-foreground block">
                          {new Date(rx.created_at).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(rx.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground text-sm">
                          {patient ? `${patient.first_name} ${patient.last_name}` : "Patient"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {patient?.patient_number ? `ID: #${patient.patient_number}` : ""}
                          {patient?.gender ? ` • ${patient.gender}` : ""}
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <p className="font-medium text-foreground truncate">
                          {consultation?.assessment || "Clinical Evaluation"}
                        </p>
                        {consultation?.chief_complaint && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            Symptoms: {consultation.chief_complaint}
                          </p>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1 max-w-xs">
                          {rx.items.slice(0, 3).map((item, i) => (
                            <Badge
                              key={i}
                              variant="secondary"
                              className="text-[10px] font-normal"
                            >
                              {item.medicine_name}
                            </Badge>
                          ))}
                          {rx.items.length > 3 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{rx.items.length - 3} more
                            </Badge>
                          )}
                          {rx.items.length === 0 && (
                            <span className="text-muted-foreground italic text-[11px]">
                              No medications
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold ${
                            isCompleted
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300"
                              : "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300"
                          }`}
                        >
                          {rx.status}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenPreview(rx)}
                          className="h-8 gap-1.5 text-xs"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          View / Print
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
