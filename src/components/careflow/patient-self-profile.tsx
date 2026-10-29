import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  FileText,
  HeartPulse,
  Hospital,
  Mail,
  MapPin,
  Phone,
  Shield,
  User,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageTitle } from "./page-title";
import { StatusBadge, EmptyState, LoadingState } from "./feedback";
import { MotionReveal } from "./motion-primitives";
import { patientProfileSummaryQuery } from "@/lib/clinical-queries";
import { patientStatus } from "@/lib/patients";

interface PatientSelfProfileProps {
  userId: string;
  clinicId?: string | undefined;
}

export function PatientSelfProfile({ userId, clinicId }: PatientSelfProfileProps) {
  const { data: summary, isLoading, error } = useQuery(patientProfileSummaryQuery(userId));

  if (isLoading) {
    return <LoadingState label="Loading your patient profile…" />;
  }

  if (error || !summary) {
    return (
      <div className="space-y-6">
        <PageTitle title="My Health Profile" description="Your clinic registration and personal care profile." />
        <EmptyState
          icon={HeartPulse}
          title="Profile couldn't load"
          description="Check your network connection and access status, then try again."
        />
      </div>
    );
  }

  // Find the record for the active clinic or default to primary record
  const records = summary.patientRecords ?? [];
  const activeRecord = (clinicId ? records.find(r => r.clinic_id === clinicId) : null) || records[0];

  if (!activeRecord) {
    return (
      <div className="space-y-6">
        <PageTitle title="My Health Profile" description="Your clinic registration and personal care profile." />
        <EmptyState
          icon={User}
          title="No clinic record linked"
          description="We couldn't find a patient record linked to your verified email. If you recently self-registered, please ensure your email is verified."
        />
      </div>
    );
  }

  const patientName = `${activeRecord.first_name} ${activeRecord.last_name || ""}`.trim();
  const clinicName = activeRecord.clinic?.name || "Clinic";

  return (
    <div className="space-y-8">
      <PageTitle
        title={patientName}
        description={`Record #${activeRecord.patient_number} • Registered with ${clinicName}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge tone={(activeRecord.status ?? "ACTIVE") === "ACTIVE" ? "success" : "neutral"}>
              {patientStatus(activeRecord.status ?? "ACTIVE")}
            </StatusBadge>
          </div>
        }
      />

      <MotionReveal className="grid gap-6 md:grid-cols-2">
        {/* Contact & Personal Information */}
        <Card className="rounded-lg shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <User className="size-4 text-primary" />
              Personal & Contact Details
            </CardTitle>
            <CardDescription className="text-xs">
              Information on file from your patient registration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between py-1.5 border-b">
              <span className="text-xs text-muted-foreground">Full name</span>
              <span className="font-medium text-foreground">{patientName}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Mail className="size-3.5" /> Email
              </span>
              <span className="font-medium text-foreground">{activeRecord.email || "—"}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Phone className="size-3.5" /> Phone
              </span>
              <span className="font-medium text-foreground">{activeRecord.phone || "—"}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CalendarDays className="size-3.5" /> Date of birth
              </span>
              <span className="font-medium text-foreground">{activeRecord.date_of_birth || "—"}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b">
              <span className="text-xs text-muted-foreground">Gender</span>
              <span className="font-medium text-foreground">{activeRecord.gender || "—"}</span>
            </div>
            <div className="flex items-start justify-between py-1.5">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <MapPin className="size-3.5" /> Address
              </span>
              <span className="font-medium text-foreground text-right max-w-[220px]">
                {activeRecord.address || "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Emergency Contact & Registration Info */}
        <div className="space-y-6">
          <Card className="rounded-lg shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Users className="size-4 text-primary" />
                Emergency Contact
              </CardTitle>
              <CardDescription className="text-xs">
                Primary contact for health emergencies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between py-1.5 border-b">
                <span className="text-xs text-muted-foreground">Contact name</span>
                <span className="font-medium text-foreground">
                  {activeRecord.emergency_contact_name || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-muted-foreground">Emergency phone</span>
                <span className="font-medium text-foreground">
                  {activeRecord.emergency_contact_phone || "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Hospital className="size-4 text-primary" />
                Registered Clinic
              </CardTitle>
              <CardDescription className="text-xs">
                Clinic tenant isolation details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between py-1.5 border-b">
                <span className="text-xs text-muted-foreground">Clinic</span>
                <span className="font-medium text-foreground">{clinicName}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b">
                <span className="text-xs text-muted-foreground">Patient number</span>
                <span className="font-medium font-mono text-foreground">
                  {activeRecord.patient_number}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-muted-foreground">Registered on</span>
                <span className="font-medium text-foreground text-xs">
                  {activeRecord.created_at ? new Date(activeRecord.created_at).toLocaleDateString() : "Active record"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Clinical Notes / Chief Complaint (if provided) */}
        {activeRecord.notes && (
          <Card className="rounded-lg shadow-sm md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                Registration Notes & Reason for Care
              </CardTitle>
              <CardDescription className="text-xs">
                Health summary and notes recorded during patient registration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-muted/30 p-4 rounded-md border">
                {activeRecord.notes}
              </p>
            </CardContent>
          </Card>
        )}
      </MotionReveal>
    </div>
  );
}
