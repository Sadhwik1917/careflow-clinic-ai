import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  FileBadge,
  GraduationCap,
  Hospital,
  LoaderCircle,
  ShieldAlert,
  Stethoscope,
  UserCheck,
} from "lucide-react";
import { AuthLayout, FormAlert } from "@/components/careflow/auth-ui";
import { LoadingState, StatusBadge } from "@/components/careflow/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { setSelectedClinicId } from "@/lib/access";
import { useAuth, useSignOut } from "@/lib/auth";
import { publicMeta } from "@/lib/public-meta";
import { invitationPreviewQuery } from "@/lib/team-queries";
import { acceptClinicInvitation } from "@/lib/team.functions";
import { doctorOnboardingSchema, staffOnboardingSchema } from "@/lib/team";
import { toast } from "@/lib/toast";

export const Route = createFileRoute("/accept-invitation")({
  validateSearch: (s: Record<string, unknown>): { token?: string | undefined; confirmed?: boolean | undefined } => ({
    token: typeof s["token"] === "string" ? s["token"] : typeof s["id"] === "string" ? s["id"] : undefined,
    confirmed: s["confirmed"] === true || s["confirmed"] === "true" || undefined,
  }),
  head: () => publicMeta("Clinic Invitation", "Accept your clinic invitation to join CAREFLOW AI.", { noindex: true }),
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  const { token, confirmed } = Route.useSearch();
  const { session, ready } = useAuth();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const accept = useServerFn(acceptClinicInvitation);

  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [destination, setDestination] = useState<string>("/workspace");

  // Doctor onboarding fields
  const [specialization, setSpecialization] = useState("General Practice");
  const [department, setDepartment] = useState("");
  const [qualification, setQualification] = useState("");
  const [experienceYears, setExperienceYears] = useState("0");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [consultationFee, setConsultationFee] = useState("");
  const [bio, setBio] = useState("");

  // Staff onboarding fields
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");

  const userEmail = session?.user?.email?.toLowerCase().trim();

  const { data: preview, isLoading } = useQuery({
    ...invitationPreviewQuery(token ?? "", userEmail),
    enabled: Boolean(token),
  });

  if (!token) {
    return (
      <AuthLayout title="Clinic Invitation">
        <div className="space-y-4">
          <FormAlert tone="error">
            Invalid invitation link. Please check the full invitation link or ask your clinic administrator to send a new one.
          </FormAlert>
          <Button asChild variant="outline" className="w-full">
            <Link to="/">Back to Home</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (isLoading || !ready) {
    return (
      <AuthLayout title="Clinic Invitation">
        <LoadingState label="Verifying invitation link…" />
      </AuthLayout>
    );
  }

  if (!preview || !preview.valid) {
    const reason = preview?.reason;
    const clinicTitle = preview?.clinicName ? `Invitation to ${preview.clinicName}` : "Clinic Invitation";

    if (reason === "ALREADY_ACCEPTED") {
      return (
        <AuthLayout title={clinicTitle} description="This invitation has already been accepted.">
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <StatusBadge tone="success">Accepted</StatusBadge>
              <span className="text-sm text-muted-foreground">Team membership active</span>
            </div>
            <p className="text-sm text-muted-foreground">
              This invitation has already been redeemed. If you are already a member of this clinic, open your workspace.
            </p>
            {session ? (
              <Button asChild className="w-full">
                <Link to="/workspace">Go to workspace</Link>
              </Button>
            ) : (
              <Button asChild className="w-full">
                <Link to="/login" search={{ redirect: "/workspace" }}>
                  Sign in
                </Link>
              </Button>
            )}
          </div>
        </AuthLayout>
      );
    }

    if (reason === "CANCELLED") {
      return (
        <AuthLayout title={clinicTitle} description="Invitation cancelled.">
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <StatusBadge tone="neutral">Cancelled</StatusBadge>
            </div>
            <FormAlert tone="error">
              This invitation has been cancelled by the clinic administrator. If you believe this is an error, please reach out to the clinic owner.
            </FormAlert>
            <Button asChild variant="outline" className="w-full">
              <Link to="/">Back to Home</Link>
            </Button>
          </div>
        </AuthLayout>
      );
    }

    if (reason === "EXPIRED") {
      return (
        <AuthLayout title={clinicTitle} description="Invitation expired.">
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <StatusBadge tone="warning">Expired</StatusBadge>
            </div>
            <FormAlert tone="error">
              This invitation has expired (invitations are valid for 7 days). Please contact the clinic administrator to request a new invitation.
            </FormAlert>
            <Button asChild variant="outline" className="w-full">
              <Link to="/">Back to Home</Link>
            </Button>
          </div>
        </AuthLayout>
      );
    }

    if (reason === "CLINIC_NOT_OPERATIONAL") {
      return (
        <AuthLayout title={clinicTitle} description="Clinic unavailable.">
          <div className="space-y-5">
            <FormAlert tone="error">
              This clinic is not currently operational. Team invitations cannot be accepted at this time.
            </FormAlert>
            <Button asChild variant="outline" className="w-full">
              <Link to="/">Back to Home</Link>
            </Button>
          </div>
        </AuthLayout>
      );
    }

    return (
      <AuthLayout title="Clinic Invitation">
        <div className="space-y-4">
          <FormAlert tone="error">
            This invitation could not be found or has expired. Please check the link or contact your clinic administrator.
          </FormAlert>
          <Button asChild variant="outline" className="w-full">
            <Link to="/">Back to Home</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const roleDisplay = preview.role === "DOCTOR" ? "Doctor" : "Staff";
  const invitedEmail = preview.email?.toLowerCase().trim();
  const isMatchingUser = Boolean(userEmail && invitedEmail && userEmail === invitedEmail);

  async function handleCompleteOnboarding(e: React.FormEvent) {
    e.preventDefault();
    if (accepting || accepted || !preview || !preview.valid) return;
    const currentPreview = preview;

    setAcceptError(null);

    let docInput;
    let staffInput;

    if (currentPreview.role === "DOCTOR") {
      const parsedDoc = doctorOnboardingSchema.safeParse({
        displayName,
        specialization,
        department,
        qualification,
        experience_years: experienceYears,
        license_number: licenseNumber,
        consultation_fee: consultationFee,
        bio,
      });
      if (!parsedDoc.success) {
        const firstErr = parsedDoc.error.issues[0]?.message ?? "Please check your profile details.";
        setAcceptError(firstErr);
        toast.error(firstErr);
        return;
      }
      docInput = parsedDoc.data;
    } else {
      const parsedStaff = staffOnboardingSchema.safeParse({
        displayName,
        phone,
      });
      if (!parsedStaff.success) {
        const firstErr = parsedStaff.error.issues[0]?.message ?? "Please check your profile details.";
        setAcceptError(firstErr);
        toast.error(firstErr);
        return;
      }
      staffInput = parsedStaff.data;
    }

    setAccepting(true);

    try {
      const res = await accept({
        data: {
          token,
          doctorProfile: docInput,
          staffProfile: staffInput,
        },
      });

      setAccepted(true);
      if (res.clinicId) setSelectedClinicId(res.clinicId);
      await qc.invalidateQueries();

      const targetDest = res.role === "DOCTOR" ? "/doctor/dashboard" : "/staff/dashboard";
      setDestination(targetDest);

      toast.success({
        title: "Welcome to the team!",
        description: `You have successfully joined ${currentPreview.clinicName} as a ${roleDisplay}.`,
      });
    } catch (err) {
      setAccepting(false);
      const msg = err instanceof Error ? err.message : "Failed to accept invitation. Please try again.";
      setAcceptError(msg);
      toast.error(msg);
    }
  }

  return (
    <AuthLayout
      title={`Welcome, ${roleDisplay}, to ${preview.clinicName}!`}
      description={`You have been invited to join the clinic team on CAREFLOW AI.`}
      footer={
        session ? (
          <p className="text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{session.user.email}</span>
          </p>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {/* Clinic badge banner */}
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
              <Hospital className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{preview.clinicName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge tone="info">{roleDisplay}</StatusBadge>
                {preview.expiresAt && (
                  <span className="text-xs text-muted-foreground">
                    Valid until {new Date(preview.expiresAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {accepted ? (
          <div className="space-y-5 rounded-lg border border-primary/20 bg-primary/5 p-5 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="size-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Welcome to {preview.clinicName}!</h2>
              <p className="text-sm text-muted-foreground">
                Your {roleDisplay} profile has been verified and your clinic workspace is active.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                void navigate({ to: destination as "/doctor/dashboard" | "/staff/dashboard", replace: true });
              }}
            >
              Open {roleDisplay} Workspace <ArrowRight className="size-4 ml-1.5" />
            </Button>
          </div>
        ) : !session ? (
          <div className="space-y-4">
            {confirmed ? (
              <div className="flex items-start gap-2.5 rounded-md border border-primary/20 bg-primary/10 p-3.5 text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Email confirmed successfully</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Please sign in with your email to continue and join <strong className="text-foreground">{preview.clinicName}</strong> as a {roleDisplay}.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This invitation was sent to <strong className="font-semibold text-foreground">{preview.maskedEmail || preview.email}</strong>. Create an account to join <strong className="font-semibold text-foreground">{preview.clinicName}</strong> as a {roleDisplay}.
              </p>
            )}

            <div className="space-y-2 pt-1">
              {confirmed ? (
                <>
                  <Button asChild className="w-full">
                    <Link to="/login" search={{ redirect: `/accept-invitation?token=${token}` }}>
                      <UserCheck className="size-4 mr-1.5" />
                      Sign in to join
                    </Link>
                  </Button>
                  <div className="text-center pt-1">
                    <span className="text-xs text-muted-foreground">
                      Need to create a different account?{" "}
                      <Link
                        to="/signup"
                        search={{ redirect: `/accept-invitation?token=${token}`, email: preview.email }}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Create account
                      </Link>
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <Button asChild className="w-full">
                    <Link to="/signup" search={{ redirect: `/accept-invitation?token=${token}`, email: preview.email }}>
                      Create Account
                    </Link>
                  </Button>
                  <div className="text-center pt-1">
                    <span className="text-xs text-muted-foreground">
                      Already have an account?{" "}
                      <Link
                        to="/login"
                        search={{ redirect: `/accept-invitation?token=${token}` }}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Sign in to join
                      </Link>
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : !isMatchingUser ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Account email mismatch</p>
                <p className="mt-1 text-xs leading-relaxed opacity-90">
                  You are currently signed in as <strong className="underline">{session.user.email}</strong>, but this invitation was issued to <strong className="underline">{preview.maskedEmail || preview.email}</strong>.
                </p>
              </div>
            </div>
            <div className="space-y-2 pt-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  void signOut();
                }}
              >
                Sign out & switch to invited account
              </Button>
              <Button asChild variant="ghost" className="w-full text-xs">
                <Link to="/workspace">Go to your workspace</Link>
              </Button>
            </div>
          </div>
        ) : (
          <form noValidate className="space-y-4" onSubmit={handleCompleteOnboarding}>
            {confirmed && (
              <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 p-3 text-xs text-foreground">
                <CheckCircle2 className="size-4 text-primary shrink-0" />
                <span>Email confirmed! Complete your {roleDisplay.toLowerCase()} profile below to join {preview.clinicName}.</span>
              </div>
            )}
            {acceptError && <FormAlert tone="error">{acceptError}</FormAlert>}

            {preview.role === "DOCTOR" ? (
              <div className="space-y-4 rounded-lg border bg-card/40 p-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <Stethoscope className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Doctor Clinical Profile</h2>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="doc-name">Full Name / Display Name</Label>
                  <Input
                    id="doc-name"
                    placeholder="e.g. Dr. Jane Smith"
                    maxLength={120}
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="doc-specialization">Specialization / Specialty *</Label>
                  <Input
                    id="doc-specialization"
                    placeholder="e.g. General Practice, Pediatrics, Cardiology"
                    maxLength={120}
                    value={specialization}
                    onChange={e => setSpecialization(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="doc-department">Department</Label>
                    <Input
                      id="doc-department"
                      placeholder="e.g. Outpatient, Internal Med"
                      maxLength={120}
                      value={department}
                      onChange={e => setDepartment(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc-exp">Years of Experience</Label>
                    <Input
                      id="doc-exp"
                      type="number"
                      min={0}
                      max={70}
                      value={experienceYears}
                      onChange={e => setExperienceYears(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="doc-license">Medical License Number</Label>
                    <Input
                      id="doc-license"
                      placeholder="e.g. MED-12345"
                      maxLength={80}
                      value={licenseNumber}
                      onChange={e => setLicenseNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc-fee">Consultation Fee</Label>
                    <Input
                      id="doc-fee"
                      type="number"
                      min={0}
                      placeholder="Optional fee"
                      value={consultationFee}
                      onChange={e => setConsultationFee(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="doc-qualification">Qualification / Degrees</Label>
                  <Input
                    id="doc-qualification"
                    placeholder="e.g. MBBS, MD, FRCP"
                    maxLength={200}
                    value={qualification}
                    onChange={e => setQualification(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="doc-bio">Short Professional Bio</Label>
                  <Textarea
                    id="doc-bio"
                    placeholder="Brief background or areas of clinical focus…"
                    maxLength={1000}
                    rows={3}
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4 rounded-lg border bg-card/40 p-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <Briefcase className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Staff Member Profile</h2>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="staff-name">Display Name</Label>
                  <Input
                    id="staff-name"
                    placeholder="Your preferred name in clinic"
                    maxLength={120}
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="staff-phone">Contact Phone</Label>
                  <Input
                    id="staff-phone"
                    type="tel"
                    placeholder="+91 …"
                    maxLength={30}
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <Button type="submit" className="w-full" disabled={accepting}>
                {accepting ? <LoaderCircle className="animate-spin mr-1.5" /> : <UserCheck className="size-4 mr-1.5" />}
                {accepting ? "Completing onboarding…" : `Accept & Join as ${roleDisplay}`}
              </Button>
              <Button asChild variant="ghost" className="w-full text-xs text-muted-foreground">
                <Link to="/workspace">Cancel</Link>
              </Button>
            </div>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
