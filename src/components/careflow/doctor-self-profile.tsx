import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  Briefcase,
  CalendarDays,
  FileBadge,
  GraduationCap,
  Pencil,
  Stethoscope,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTitle } from "./page-title";
import { StatusBadge, EmptyState, type StatusTone } from "./feedback";
import { MotionReveal } from "./motion-primitives";
import { DoctorForm } from "./doctor-form";
import { doctorSelfProfileQuery } from "@/lib/team-queries";
import { updateMyDoctorProfileFn } from "@/lib/team.functions";
import { doctorStatusLabel, type DoctorFormValues } from "@/lib/team";
import { toast } from "@/lib/toast";

const statusTone: Record<string, StatusTone> = {
  ACTIVE: "success",
  INACTIVE: "neutral",
  ON_LEAVE: "warning",
};

interface DoctorSelfProfileProps {
  userId: string;
  clinicId: string;
}

export function DoctorSelfProfile({ userId, clinicId }: DoctorSelfProfileProps) {
  const query = doctorSelfProfileQuery(clinicId);
  const { data: d } = useSuspenseQuery(query);
  const qc = useQueryClient();
  const updateMyProfile = useServerFn(updateMyDoctorProfileFn);

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(d?.display_name ?? "");

  if (!d) {
    return (
      <div className="space-y-6">
        <PageTitle title="My Doctor Profile" description="Clinical role and professional details." />
        <EmptyState
          icon={Stethoscope}
          title="Profile unavailable"
          description="Your doctor profile for this clinic hasn't been set up yet. Please contact the clinic owner."
        />
      </div>
    );
  }

  const handleSave = async (fields: DoctorFormValues) => {
    const result = await updateMyProfile({
      data: {
        clinicId,
        updatedAt: d.updated_at,
        fields,
        displayName: displayName.trim() || undefined,
      },
    });

    qc.setQueryData(query.queryKey, result);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["my-doctor-profile", clinicId] }),
      qc.invalidateQueries({ queryKey: ["doctors", userId, clinicId] }),
    ]);

    toast.success("Doctor profile updated successfully.");
    setEditing(false);
  };

  return (
    <div className="space-y-6">
      <PageTitle
        title={d.display_name ? `Dr. ${d.display_name.replace(/^dr\.?\s+/i, "")}` : "My Doctor Profile"}
        description="Your professional medical profile, consultation details, and clinical identity in this clinic."
        actions={
          !editing && (
            <Button
              variant="outline"
              onClick={() => {
                setDisplayName(d.display_name ?? "");
                setEditing(true);
              }}
            >
              <Pencil className="size-4 mr-2" />
              Edit profile
            </Button>
          )
        }
      />

      <MotionReveal className="border-t py-6">
        {editing ? (
          <div className="space-y-6 max-w-3xl">
            <div className="space-y-2">
              <Label htmlFor="doctor-display-name">Full Name / Display Name</Label>
              <Input
                id="doctor-display-name"
                maxLength={120}
                placeholder="Dr. Full Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This name appears on appointments, prescriptions, and the clinic directory.
              </p>
            </div>

            <DoctorForm
              key={d.updated_at}
              doctor={d}
              onCancel={() => setEditing(false)}
              onReload={async () => {
                await qc.invalidateQueries({ queryKey: query.queryKey });
              }}
              onSave={handleSave}
            />
          </div>
        ) : (
          <div className="space-y-8 max-w-4xl">
            {/* Overview Card */}
            <Card className="rounded-lg border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-lg font-semibold">
                    {d.display_name ? `Dr. ${d.display_name.replace(/^dr\.?\s+/i, "")}` : "Doctor"}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <Stethoscope className="size-3.5 text-primary" />
                    <span>{d.specialization}</span>
                    {d.department && <span>· {d.department}</span>}
                  </CardDescription>
                </div>
                <StatusBadge tone={statusTone[d.status] ?? "neutral"}>
                  {doctorStatusLabel[d.status]}
                </StatusBadge>
              </CardHeader>
              <CardContent className="pt-4 border-t">
                <dl className="grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                      <GraduationCap className="size-4" /> Qualification
                    </dt>
                    <dd className="mt-1 font-medium text-foreground">{d.qualification || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                      <Briefcase className="size-4" /> Clinical Experience
                    </dt>
                    <dd className="mt-1 font-medium text-foreground">
                      {d.experience_years} {d.experience_years === 1 ? "year" : "years"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                      <FileBadge className="size-4" /> License Number
                    </dt>
                    <dd className="mt-1 font-medium text-foreground">{d.license_number || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                      <span>₹</span> Consultation Fee
                    </dt>
                    <dd className="mt-1 font-medium text-foreground">
                      {d.consultation_fee != null ? `₹${d.consultation_fee}` : "Not set"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                      <CalendarDays className="size-4" /> Member Since
                    </dt>
                    <dd className="mt-1 text-muted-foreground">
                      {new Date(d.created_at).toLocaleDateString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground font-medium">Last Profile Update</dt>
                    <dd className="mt-1 text-muted-foreground">
                      {new Date(d.updated_at).toLocaleString()}
                    </dd>
                  </div>
                  {d.bio && (
                    <div className="sm:col-span-2 pt-2 border-t">
                      <dt className="text-muted-foreground font-medium mb-1">Biography / About</dt>
                      <dd className="text-foreground whitespace-pre-wrap leading-relaxed">
                        {d.bio}
                      </dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          </div>
        )}
      </MotionReveal>
    </div>
  );
}
