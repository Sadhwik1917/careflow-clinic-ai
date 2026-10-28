import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Pill,
  Receipt,
  ClipboardCheck,
  User,
  Clock,
  ArrowUpRight,
  Eye,
  FileText,
  Building2,
  Phone,
  ShieldCheck,
  Heart,
  History,
  CircleUserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageTitle } from "@/components/careflow/page-title";
import { StatisticsCard } from "@/components/careflow/statistics-card";
import { StatusBadge, EmptyState, LoadingState } from "@/components/careflow/feedback";
import {
  patientAppointmentsQuery,
  patientPrescriptionsQuery,
  patientInvoicesQuery,
  patientProfileSummaryQuery,
} from "@/lib/clinical-queries";
import { PrescriptionPreviewDialog } from "./prescription-preview-dialog";
import type { PrescriptionWithDetails } from "@/lib/clinical";
import { formatFrequencyLabel } from "@/lib/clinical";
import { appointmentStatusLabel, formatTime12h, type AppointmentStatus } from "@/lib/appointments";

interface PatientDashboardViewProps {
  userId: string;
  clinicId?: string | undefined;
}

export function PatientDashboardView({ userId, clinicId }: PatientDashboardViewProps) {
  // Prescription preview dialog state
  const [selectedRx, setSelectedRx] = React.useState<PrescriptionWithDetails | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState<boolean>(false);

  // Patient Profile & Records Query
  const { data: profileSummary, isLoading: loadingProfile } = useQuery(
    patientProfileSummaryQuery(userId)
  );

  // Patient Appointments Query
  const { data: appointments = [], isLoading: loadingAppointments } = useQuery(
    patientAppointmentsQuery(clinicId)
  );

  // Patient Prescriptions Query
  const { data: prescriptions = [], isLoading: loadingPrescriptions } = useQuery(
    patientPrescriptionsQuery(clinicId)
  );

  // Patient Invoices Query
  const { data: invoices = [], isLoading: loadingInvoices } = useQuery(
    patientInvoicesQuery(clinicId)
  );

  // Derived appointment calculations
  const upcomingAppointments = appointments.filter(
    (a) => a.status === "SCHEDULED" || a.status === "CONFIRMED" || a.status === "CHECKED_IN"
  );
  const completedAppointments = appointments.filter((a) => a.status === "COMPLETED");
  const nextAppointment = upcomingAppointments[0];

  // Derived invoice calculations
  const unpaidInvoices = invoices.filter((inv) => inv.status === "ISSUED");
  const totalAmountDue = unpaidInvoices.reduce(
    (acc, inv) => acc + (Number(inv.amount_due) || 0),
    0
  );

  // Primary patient record
  const primaryRecord = profileSummary?.patientRecords?.[0];
  const patientDisplayName =
    primaryRecord
      ? `${primaryRecord.first_name} ${primaryRecord.last_name ?? ""}`.trim()
      : profileSummary?.profile?.display_name || "Patient";

  return (
    <div className="space-y-8">
      {/* Page Title & Actions */}
      <PageTitle
        title="Your care overview"
        description="Track your scheduled clinic visits, authenticated prescriptions, and medical records."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <Link to="/patient/prescriptions">
                <Pill className="mr-2 size-4" /> View prescriptions
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/patient/appointments">
                <CalendarDays className="mr-2 size-4" /> Appointment history
              </Link>
            </Button>
          </div>
        }
      />

      {/* Spotlight: Upcoming Appointment or Care Welcome */}
      {nextAppointment ? (
        <Card className="rounded-lg border-primary/40 bg-primary/5 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <span className="flex size-2.5 rounded-full bg-primary animate-pulse" />
              <CardTitle className="text-base font-semibold text-primary">
                Upcoming clinic visit
              </CardTitle>
            </div>
            <StatusBadge
              tone={
                nextAppointment.status === "CONFIRMED"
                  ? "success"
                  : nextAppointment.status === "CHECKED_IN"
                    ? "info"
                    : "neutral"
              }
            >
              {appointmentStatusLabel[nextAppointment.status as AppointmentStatus] || nextAppointment.status}
            </StatusBadge>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CalendarDays className="size-6" />
                </span>
                <div>
                  <p className="text-lg font-bold text-foreground">
                    {nextAppointment.scheduled_start ? nextAppointment.scheduled_start.slice(0, 10) : "Scheduled date"} at{" "}
                    {nextAppointment.scheduled_start ? formatTime12h(nextAppointment.scheduled_start.slice(11, 16)) : "Scheduled time"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {nextAppointment.clinic?.name || "CareFlow Medical Clinic"} ·{" "}
                    Dr. {nextAppointment.doctor?.display_name || "Specialist"} ({nextAppointment.doctor?.specialization || "Consultant"})
                  </p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/patient/appointments">View appointment details</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card/60 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Heart className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Welcome back, {patientDisplayName}
              </p>
              <p className="text-xs text-muted-foreground">
                Your health records and prescriptions are securely kept up to date by your clinic care team.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/patient/prescriptions">View prescriptions</Link>
          </Button>
        </div>
      )}

      {/* Overview Statistics Cards */}
      <section aria-label="Care statistics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatisticsCard
          label="Upcoming visits"
          value={loadingAppointments ? null : upcomingAppointments.length}
          detail={
            upcomingAppointments.length > 0
              ? `${upcomingAppointments.length} scheduled appointment${upcomingAppointments.length === 1 ? "" : "s"}`
              : "No upcoming visits"
          }
          icon={CalendarDays}
        />
        <StatisticsCard
          label="Prescriptions on file"
          value={loadingPrescriptions ? null : prescriptions.length}
          detail="Authenticated e-prescriptions"
          icon={Pill}
        />
        <StatisticsCard
          label="Invoices &amp; receipts"
          value={loadingInvoices ? null : invoices.length}
          detail={
            unpaidInvoices.length > 0
              ? `₹${totalAmountDue.toLocaleString("en-IN")} pending payment`
              : "All invoices settled"
          }
          icon={Receipt}
        />
        <StatisticsCard
          label="Past consultations"
          value={loadingAppointments ? null : completedAppointments.length}
          detail="Completed clinic visits"
          icon={ClipboardCheck}
        />
      </section>

      {/* Main Grid: Appointments & Prescriptions */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
        {/* Left Column: Appointments & Prescriptions */}
        <div className="space-y-6 xl:col-span-2">
          {/* Recent Appointments Card */}
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Your appointments</CardTitle>
                <CardDescription className="text-xs">
                  Upcoming and recent visits
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
                <Link to="/patient/appointments">
                  View all <ArrowUpRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {loadingAppointments ? (
                <LoadingState label="Loading your appointments…" />
              ) : appointments.length === 0 ? (
                <EmptyState
                  title="No appointments on record"
                  description="When you book appointments with a clinic, they will be listed here."
                  icon={CalendarDays}
                />
              ) : (
                <div className="divide-y divide-border overflow-hidden rounded-md border text-sm">
                  {appointments.slice(0, 4).map((appt) => {
                    const timeLabel = appt.scheduled_start
                      ? formatTime12h(appt.scheduled_start.slice(11, 16))
                      : "—";
                    const dateLabel = appt.scheduled_start
                      ? appt.scheduled_start.slice(0, 10)
                      : "—";
                    const doctorName = appt.doctor?.display_name || "Doctor";
                    const clinicName = appt.clinic?.name || "Clinic";

                    return (
                      <div
                        key={appt.id}
                        className="flex flex-wrap items-center justify-between gap-3 p-3.5 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground font-mono text-xs">
                            <Clock className="size-4" />
                          </span>
                          <div>
                            <p className="font-medium text-foreground">
                              {dateLabel} at {timeLabel}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Dr. {doctorName} · {clinicName}
                            </p>
                          </div>
                        </div>
                        <StatusBadge
                          tone={
                            appt.status === "COMPLETED"
                              ? "success"
                              : appt.status === "CHECKED_IN"
                                ? "info"
                                : appt.status === "CANCELLED"
                                  ? "danger"
                                  : "neutral"
                          }
                        >
                          {appointmentStatusLabel[appt.status as AppointmentStatus] || appt.status}
                        </StatusBadge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Prescriptions Card */}
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Prescriptions &amp; medications</CardTitle>
                <CardDescription className="text-xs">
                  Doctor-authorized medications and dosage directions
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
                <Link to="/patient/prescriptions">
                  View all <ArrowUpRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {loadingPrescriptions ? (
                <LoadingState label="Loading prescriptions…" />
              ) : prescriptions.length === 0 ? (
                <EmptyState
                  title="No prescriptions on file"
                  description="When a doctor completes a consultation and prescribes medicine, it will appear here."
                  icon={Pill}
                />
              ) : (
                <div className="space-y-3">
                  {prescriptions.slice(0, 3).map((rx) => {
                    const doctorName = rx.doctor?.display_name || "Doctor";
                    const firstItem = rx.items?.[0];

                    return (
                      <div
                        key={rx.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-md border p-4 transition-colors hover:bg-muted/30"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground text-sm">
                              Prescription #{rx.id.slice(0, 8).toUpperCase()}
                            </span>
                            <StatusBadge tone="success">Active</StatusBadge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Prescribed by Dr. {doctorName} on {rx.prescription_date}
                          </p>
                          {firstItem && (
                            <p className="text-xs font-medium text-foreground/90 mt-1">
                              {firstItem.medicine_name} {firstItem.dosage ? `(${firstItem.dosage})` : ""} ·{" "}
                              {formatFrequencyLabel(firstItem.frequency)}
                              {firstItem.instructions ? ` · ${firstItem.instructions}` : ""}
                              {(rx.items?.length || 0) > 1 ? ` +${(rx.items?.length || 0) - 1} more` : ""}
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedRx(rx);
                            setPreviewOpen(true);
                          }}
                        >
                          <Eye className="mr-1.5 size-3.5" /> View details
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Profile Summary & Invoices */}
        <div className="space-y-6 xl:col-span-1">
          {/* Patient Profile Card */}
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Patient profile</CardTitle>
                <CardDescription className="text-xs">Your registered health record</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
                <Link to="/patient/profile">
                  Edit <ArrowUpRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center gap-3 pb-2 border-b">
                <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-primary font-semibold text-sm">
                  {patientDisplayName.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <p className="font-semibold text-foreground text-sm">{patientDisplayName}</p>
                  <p className="text-muted-foreground">
                    Record #{primaryRecord?.patient_number || "CF-PATIENT"}
                  </p>
                </div>
              </div>

              {primaryRecord?.phone && (
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="font-medium text-foreground">{primaryRecord.phone}</span>
                </div>
              )}

              {primaryRecord?.gender && (
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">Gender</span>
                  <span className="font-medium text-foreground">{primaryRecord.gender}</span>
                </div>
              )}

              {primaryRecord?.date_of_birth && (
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">Date of birth</span>
                  <span className="font-medium text-foreground">{primaryRecord.date_of_birth}</span>
                </div>
              )}

              {primaryRecord?.emergency_contact_name && (
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">Emergency contact</span>
                  <span className="font-medium text-foreground">
                    {primaryRecord.emergency_contact_name}
                  </span>
                </div>
              )}

              <Button asChild variant="outline" size="sm" className="w-full mt-2">
                <Link to="/patient/profile">View full profile</Link>
              </Button>
            </CardContent>
          </Card>

          {/* Invoices & Receipts Card */}
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Bills &amp; receipts</CardTitle>
                <CardDescription className="text-xs">
                  {invoices.length} transaction{invoices.length === 1 ? "" : "s"} on file
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
                <Link to="/patient/bills">
                  All <ArrowUpRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {loadingInvoices ? (
                <LoadingState label="Loading bills…" />
              ) : invoices.length === 0 ? (
                <EmptyState
                  title="No bills on record"
                  description="Invoices issued for consultations and medications will appear here."
                  icon={Receipt}
                  className="min-h-32 py-3"
                />
              ) : (
                <div className="space-y-2">
                  {invoices.slice(0, 3).map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between rounded-md border p-2.5 text-xs"
                    >
                      <div>
                        <p className="font-medium text-foreground">{inv.invoice_number}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {inv.issued_at ? inv.issued_at.slice(0, 10) : "Issued"} · ₹{Number(inv.total_amount).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <StatusBadge tone={inv.status === "PAID" ? "success" : "warning"}>
                        {inv.status}
                      </StatusBadge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Care Shortcuts Card */}
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Care shortcuts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                asChild
                variant="outline"
                className="w-full justify-start text-xs font-medium shadow-none h-9"
              >
                <Link to="/patient/prescriptions">
                  <Pill className="mr-2 size-3.5 text-primary" /> My prescriptions
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full justify-start text-xs font-medium shadow-none h-9"
              >
                <Link to="/patient/appointments">
                  <CalendarDays className="mr-2 size-3.5 text-primary" /> Appointment history
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full justify-start text-xs font-medium shadow-none h-9"
              >
                <Link to="/patient/bills">
                  <Receipt className="mr-2 size-3.5 text-primary" /> Medical invoices &amp; bills
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full justify-start text-xs font-medium shadow-none h-9"
              >
                <Link to="/patient/history">
                  <History className="mr-2 size-3.5 text-primary" /> Consultation history
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Prescription Preview Modal */}
      <PrescriptionPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        prescription={selectedRx}
      />
    </div>
  );
}
