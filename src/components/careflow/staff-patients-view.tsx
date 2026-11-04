import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Plus,
  Search,
  Users,
  User,
  CalendarDays,
  ListOrdered,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PatientForm } from "./patient-form";
import { PatientQrDialog } from "./patient-qr-dialog";
import { PageTitle } from "./page-title";
import { EmptyState, LoadingState, StatusBadge } from "./feedback";
import { MotionReveal } from "./motion-primitives";
import { staffPatientsQuery } from "@/lib/patient-queries";
import {
  registerStaffPatient,
  updateStaffPatient,
} from "@/lib/patients.functions";
import {
  PATIENT_PAGE_SIZE,
  patientStatus,
  type Patient,
  type PatientFilters,
} from "@/lib/patients";
import { toast } from "@/lib/toast";

export function StaffPatientsView({
  userId,
  clinicId,
  filters,
}: {
  userId: string;
  clinicId: string;
  filters: PatientFilters;
}) {
  const { data, isLoading, isRefetchError } = useQuery(
    staffPatientsQuery(userId, clinicId, filters)
  );
  const registerFn = useServerFn(registerStaffPatient);
  const updateFn = useServerFn(updateStaffPatient);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState(filters.search);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => setSearch(filters.search), [filters.search]);

  const count = data?.count ?? 0;
  const rows = data?.rows ?? [];
  const pages = Math.max(1, Math.ceil(count / PATIENT_PAGE_SIZE));

  const change = (patch: Partial<PatientFilters>) =>
    navigate({
      to: "/staff/patients",
      search: { ...filters, ...patch },
    });

  useEffect(() => {
    if (pages > 0 && filters.page >= pages) {
      void navigate({
        to: "/staff/patients",
        search: { ...filters, page: pages - 1 },
        replace: true,
      });
    }
  }, [filters, pages, navigate]);

  return (
    <>
      <PageTitle
        title="Patients"
        description="View, register, and manage patient records in your clinic directory."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PatientQrDialog
              clinicId={clinicId}
              onScanSuccess={() => setRegisterOpen(true)}
            />
            <Button onClick={() => setRegisterOpen(true)}>
              <Plus className="mr-1.5 size-4" />
              Register patient
            </Button>
          </div>
        }
      />

      <MotionReveal className="space-y-5 border-t py-6">
        <form
          className="flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void change({ search: search.trim(), page: 0 });
          }}
        >
          <Input
            aria-label="Search patients"
            placeholder="Patient name or number"
            maxLength={100}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            size="icon"
            aria-label="Search"
          >
            <Search className="size-4" />
          </Button>
          {filters.search && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearch("");
                void change({ search: "", page: 0 });
              }}
            >
              Clear
            </Button>
          )}
        </form>

        {isRefetchError && (
          <p role="alert" className="text-sm text-destructive">
            Refresh failed. Showing the last loaded patients.
          </p>
        )}

        {isLoading && !data ? (
          <LoadingState label="Loading patients…" />
        ) : (
          <>
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {count} patient{count === 1 ? "" : "s"}
            </p>

            {!rows.length ? (
              <EmptyState
                icon={Users}
                title={
                  filters.search ? "No matching patients" : "No patients registered"
                }
                description={
                  filters.search
                    ? "No patients match your search criteria. Try a different name or patient number."
                    : "Patients registered in your clinic will appear here."
                }
                action={
                  filters.search ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearch("");
                        void change({ search: "", page: 0 });
                      }}
                    >
                      Clear search
                    </Button>
                  ) : (
                    <Button onClick={() => setRegisterOpen(true)}>
                      <Plus className="mr-1.5 size-4" />
                      Register patient
                    </Button>
                  )
                }
              />
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Patient number</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="min-w-40 font-medium">
                          {p.first_name} {p.last_name ?? ""}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {p.patient_number}
                        </TableCell>
                        <TableCell className="min-w-40">
                          <span className="block">{p.phone || "—"}</span>
                          {p.email && (
                            <span className="block break-all text-xs text-muted-foreground">
                              {p.email}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            tone={p.status === "ACTIVE" ? "success" : "neutral"}
                          >
                            {patientStatus(p.status)}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedPatient(p);
                              setIsEditing(false);
                            }}
                          >
                            <Eye className="mr-1.5 size-3.5" />
                            View details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <span className="text-sm text-muted-foreground">
                Page {filters.page + 1} of {pages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Previous page"
                  disabled={filters.page === 0}
                  onClick={() => void change({ page: filters.page - 1 })}
                >
                  <ChevronLeft className="size-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Next page"
                  disabled={filters.page + 1 >= pages}
                  onClick={() => void change({ page: filters.page + 1 })}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </MotionReveal>

      {/* Register Patient Dialog */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Register new patient</DialogTitle>
            <DialogDescription>
              Enter patient details to register them in the clinic directory.
            </DialogDescription>
          </DialogHeader>
          <div className="pt-2">
            <PatientForm
              onCancel={() => setRegisterOpen(false)}
              onSave={async (values) => {
                try {
                  const p = await registerFn({ data: { clinicId, fields: values } });
                  await qc.invalidateQueries({
                    queryKey: ["staff-patients", userId, clinicId],
                  });
                  toast.success({
                    title: "Patient registered",
                    description: `${p.first_name} ${p.last_name ?? ""} (${p.patient_number}) registered successfully.`,
                  });
                  setRegisterOpen(false);
                } catch (err) {
                  const msg =
                    err instanceof Error
                      ? err.message
                      : "Patient wasn't registered. Please try again.";
                  toast.error(msg);
                  throw err;
                }
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Patient Details & Edit Dialog */}
      <Dialog
        open={Boolean(selectedPatient)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPatient(null);
            setIsEditing(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {selectedPatient && (
            <>
              {isEditing ? (
                <>
                  <DialogHeader>
                    <DialogTitle>
                      Edit patient: {selectedPatient.first_name}{" "}
                      {selectedPatient.last_name ?? ""}
                    </DialogTitle>
                    <DialogDescription className="font-mono text-xs">
                      Patient #{selectedPatient.patient_number}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="pt-2">
                    <PatientForm
                      key={selectedPatient.updated_at}
                      patient={selectedPatient}
                      onCancel={() => setIsEditing(false)}
                      onSave={async (values) => {
                        try {
                          const { patient_number: _num, ...fields } = values;
                          const updated = await updateFn({
                            data: {
                              clinicId,
                              patientId: selectedPatient.id,
                              updatedAt: selectedPatient.updated_at,
                              fields,
                            },
                          });
                          await qc.invalidateQueries({
                            queryKey: ["staff-patients", userId, clinicId],
                          });
                          setSelectedPatient(updated);
                          setIsEditing(false);
                          toast.success({
                            title: "Patient updated",
                            description: `${updated.first_name} ${updated.last_name ?? ""}'s details updated successfully.`,
                          });
                        } catch (err) {
                          const msg =
                            err instanceof Error
                              ? err.message
                              : "Patient changes couldn't be saved.";
                          toast.error(msg);
                          throw err;
                        }
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <div className="flex items-center justify-between gap-2 pr-6">
                      <DialogTitle className="flex items-center gap-2">
                        <User className="size-5 text-primary" />
                        <span>
                          {selectedPatient.first_name}{" "}
                          {selectedPatient.last_name ?? ""}
                        </span>
                      </DialogTitle>
                      <StatusBadge
                        tone={
                          selectedPatient.status === "ACTIVE"
                            ? "success"
                            : "neutral"
                        }
                      >
                        {patientStatus(selectedPatient.status)}
                      </StatusBadge>
                    </div>
                    <DialogDescription className="font-mono text-xs">
                      Patient #{selectedPatient.patient_number}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-2 text-sm">
                    <div className="grid grid-cols-2 gap-3 text-xs rounded-lg border bg-muted/20 p-3">
                      <div>
                        <span className="text-muted-foreground block">
                          Gender:
                        </span>
                        <span className="font-medium">
                          {selectedPatient.gender || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">
                          Date of Birth:
                        </span>
                        <span className="font-medium">
                          {selectedPatient.date_of_birth || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">
                          Phone:
                        </span>
                        <span className="font-medium">
                          {selectedPatient.phone || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">
                          Registered:
                        </span>
                        <span className="font-medium">
                          {new Date(
                            selectedPatient.created_at
                          ).toLocaleDateString()}
                        </span>
                      </div>
                      {selectedPatient.email && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground block">
                            Email:
                          </span>
                          <span className="font-medium break-all">
                            {selectedPatient.email}
                          </span>
                        </div>
                      )}
                      {selectedPatient.address && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground block">
                            Address:
                          </span>
                          <span className="font-medium">
                            {selectedPatient.address}
                          </span>
                        </div>
                      )}
                      {(selectedPatient.emergency_contact_name ||
                        selectedPatient.emergency_contact_phone) && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground block">
                            Emergency Contact:
                          </span>
                          <span className="font-medium">
                            {selectedPatient.emergency_contact_name || "—"}
                            {selectedPatient.emergency_contact_phone
                              ? ` (${selectedPatient.emergency_contact_phone})`
                              : ""}
                          </span>
                        </div>
                      )}
                      {selectedPatient.notes && (
                        <div className="col-span-2 border-t pt-2">
                          <span className="text-muted-foreground block">
                            Notes:
                          </span>
                          <p className="mt-1 whitespace-pre-wrap font-medium">
                            {selectedPatient.notes}
                          </p>
                        </div>
                      )}
                      <div className="col-span-2 border-t pt-2 text-[11px] text-muted-foreground">
                        Last updated:{" "}
                        {new Date(
                          selectedPatient.updated_at
                        ).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <DialogFooter className="flex flex-wrap items-center justify-between gap-2 sm:justify-between">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                      >
                        <Pencil className="mr-1.5 size-3.5" />
                        Edit profile
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link to="/staff/appointments">
                          <CalendarDays className="mr-1.5 size-3.5" />
                          Appointments
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link to="/staff/queue">
                          <ListOrdered className="mr-1.5 size-3.5" />
                          Queue
                        </Link>
                      </Button>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedPatient(null)}
                    >
                      Dismiss
                    </Button>
                  </DialogFooter>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

