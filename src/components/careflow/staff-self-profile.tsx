import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  LoaderCircle,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
  UserRoundCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTitle } from "./page-title";
import { StatusBadge, EmptyState } from "./feedback";
import { MotionReveal } from "./motion-primitives";
import { staffSelfProfileQuery } from "@/lib/team-queries";
import { updateMyStaffProfileFn } from "@/lib/team.functions";
import { toast } from "@/lib/toast";

interface StaffSelfProfileProps {
  userId: string;
  clinicId: string;
}

export function StaffSelfProfile({ userId, clinicId }: StaffSelfProfileProps) {
  const query = staffSelfProfileQuery(clinicId);
  const { data } = useSuspenseQuery(query);
  const qc = useQueryClient();
  const updateProfile = useServerFn(updateMyStaffProfileFn);

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(data.profile.display_name ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => updateProfile({ data: { clinicId, displayName: displayName.trim() } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: query.queryKey }),
        qc.invalidateQueries({ queryKey: ["staff", userId, clinicId] }),
      ]);
      toast.success("Profile name updated successfully.");
      setEditing(false);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to update profile name.");
    },
  });

  const member = data.member;
  const profile = data.profile;
  const clinic = data.clinic;

  return (
    <div className="space-y-6">
      <PageTitle
        title={profile.display_name || "Staff Member Profile"}
        description="Your clinic staff membership details, role, and workspace settings."
        actions={
          !editing && (
            <Button
              variant="outline"
              onClick={() => {
                setDisplayName(profile.display_name ?? "");
                setError(null);
                setEditing(true);
              }}
            >
              <Pencil className="size-4 mr-2" />
              Edit display name
            </Button>
          )
        }
      />

      <MotionReveal className="border-t py-6">
        <div className="grid gap-6 md:grid-cols-2 max-w-4xl">
          {/* Staff Member Card */}
          <Card className="rounded-lg border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold">Staff Identity</CardTitle>
                <CardDescription>Your account credentials and role</CardDescription>
              </div>
              <StatusBadge tone={member.status === "ACTIVE" ? "success" : "neutral"}>
                {member.status === "ACTIVE" ? "Active" : member.status}
              </StatusBadge>
            </CardHeader>
            <CardContent className="pt-4 border-t space-y-4">
              {editing ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!displayName.trim()) {
                      setError("Display name cannot be empty.");
                      return;
                    }
                    mutation.mutate();
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="staff-name">Display Name</Label>
                    <Input
                      id="staff-name"
                      maxLength={120}
                      value={displayName}
                      onChange={(e) => {
                        setDisplayName(e.target.value);
                        setError(null);
                      }}
                      required
                    />
                    {error && <p className="text-xs text-destructive">{error}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={mutation.isPending}>
                      {mutation.isPending && <LoaderCircle className="size-3.5 mr-1.5 animate-spin" />}
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={mutation.isPending}
                      onClick={() => setEditing(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground block">Full Name</span>
                    <span className="font-medium text-foreground">{profile.display_name || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Clinic Role</span>
                    <span className="font-medium text-foreground">Clinic Staff</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Joined Clinic</span>
                    <span className="text-muted-foreground">
                      {member.joined_at ? new Date(member.joined_at).toLocaleDateString() : "—"}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Associated Clinic Card */}
          <Card className="rounded-lg border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold">Assigned Clinic</CardTitle>
                <CardDescription>Clinic operations you have access to</CardDescription>
              </div>
              <Building2 className="size-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pt-4 border-t space-y-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground block">Clinic Name</span>
                <span className="font-medium text-foreground">
                  {clinic?.display_name || clinic?.name || "Clinic"}
                </span>
              </div>
              {(clinic?.city || clinic?.state) && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="size-4 shrink-0 text-muted-foreground" />
                  <span>{[clinic.city, clinic.state].filter(Boolean).join(", ")}</span>
                </div>
              )}
              {clinic?.phone && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Phone className="size-4 shrink-0 text-muted-foreground" />
                  <span>{clinic.phone}</span>
                </div>
              )}
              {clinic?.email && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="size-4 shrink-0 text-muted-foreground" />
                  <span>{clinic.email}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </MotionReveal>
    </div>
  );
}
