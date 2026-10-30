import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  CheckCircle2,
  FileCheck2,
  Hospital,
  Info,
  LoaderCircle,
  Mail,
  RotateCcw,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { CenteredPanel, FormAlert, FormField } from "@/components/careflow/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getPublicClinicInfoFn,
  registerPatientSelfFn,
  resendPatientActivationFn,
} from "@/lib/patient-registration.functions";
import {
  selfRegistrationSchema,
  type SelfRegistrationInput,
  type RegistrationResult,
} from "@/lib/patient-registration";
import { publicMeta } from "@/lib/public-meta";
import { toast } from "@/lib/toast";

export const Route = createFileRoute("/register")({
  validateSearch: (s: Record<string, unknown>): { clinic?: string | undefined } => ({
    clinic: typeof s["clinic"] === "string" ? s["clinic"].trim() : undefined,
  }),
  head: () =>
    publicMeta(
      "Patient Registration",
      "Self-register as a patient with your clinic on CAREFLOW AI.",
      { noindex: true }
    ),
  component: PatientRegistrationPage,
});

function PatientRegistrationPage() {
  const { clinic: clinicId } = Route.useSearch();
  const getClinicInfo = useServerFn(getPublicClinicInfoFn);
  const registerPatient = useServerFn(registerPatientSelfFn);
  const resendActivation = useServerFn(resendPatientActivationFn);

  // Load clinic public details
  const {
    data: clinic,
    isLoading: loadingClinic,
    error: clinicError,
  } = useQuery({
    queryKey: ["public-clinic-info", clinicId],
    queryFn: async () => {
      if (!clinicId) throw new Error("Missing clinic identifier.");
      return getClinicInfo({ data: { clinicId } });
    },
    enabled: !!clinicId,
    retry: 1,
  });

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);

  // Validation & Result state
  type FormErrors = Partial<Record<keyof SelfRegistrationInput, string | undefined>>;
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submissionResult, setSubmissionResult] = useState<RegistrationResult | null>(null);
  const [resending, setResending] = useState(false);
  const [resendAlert, setResendAlert] = useState<{ tone: "error" | "success"; message: string } | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://careflow-clinic.internal";

  // Registration mutation
  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId) throw new Error("Missing clinic identifier.");

      const rawPayload = {
        clinicId,
        first_name: firstName,
        last_name: lastName || null,
        email: email,
        phone: phone || null,
        date_of_birth: dob || null,
        gender: gender || null,
        address: address || null,
        emergency_contact_name: emergencyName || null,
        emergency_contact_phone: emergencyPhone || null,
        notes: notes || null,
        consent,
      };

      const parsed = selfRegistrationSchema.safeParse(rawPayload);
      if (!parsed.success) {
        const flat = parsed.error.flatten().fieldErrors;
        const errMap: FormErrors = {};
        for (const [key, val] of Object.entries(flat)) {
          errMap[key as keyof SelfRegistrationInput] = val?.[0];
        }
        setErrors(errMap);
        throw new Error("Please correct the errors in the registration form.");
      }

      setErrors({});
      return registerPatient({
        data: {
          origin,
          input: parsed.data,
        },
      });
    },
    onSuccess: (result) => {
      setSubmissionResult(result);
      if (
        result.status === "CREATED_INVITED" ||
        result.status === "CREATED_EXISTING_USER" ||
        result.status === "CREATED_INVITE_PENDING"
      ) {
        toast.success("Patient registration completed successfully");
      }
    },
    onError: (err: Error) => {
      setFormError(err.message || "Registration failed. Please try again.");
    },
  });

  const handleResend = async () => {
    if (!clinicId || !email) return;
    setResending(true);
    setResendAlert(null);
    try {
      const res = await resendActivation({
        data: {
          origin,
          input: { clinicId, email },
        },
      });
      if (res.ok) {
        setResendAlert({ tone: "success", message: res.message });
        toast.success("Activation link requested");
      } else {
        setResendAlert({ tone: "error", message: res.message });
        toast.error(res.message);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to request activation link.";
      setResendAlert({ tone: "error", message: msg });
      toast.error(msg);
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    registerMutation.mutate();
  };

  // 1. Missing or invalid clinic in URL
  if (!clinicId) {
    return (
      <CenteredPanel>
        <div className="rounded-xl border bg-card p-6 shadow-sm text-center space-y-4">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Building2 className="size-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-foreground">Registration Link Incomplete</h1>
            <p className="text-sm text-muted-foreground">
              This registration page requires a clinic QR code link. Please scan the QR code displayed at your clinic reception desk.
            </p>
          </div>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/">CAREFLOW AI Home</Link>
          </Button>
        </div>
      </CenteredPanel>
    );
  }

  // 2. Loading clinic verification
  if (loadingClinic) {
    return (
      <CenteredPanel>
        <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
          <LoaderCircle className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying clinic registration desk…</p>
        </div>
      </CenteredPanel>
    );
  }

  // 3. Clinic not found or inactive/suspended
  if (clinicError || !clinic) {
    return (
      <CenteredPanel>
        <div className="rounded-xl border bg-card p-6 shadow-sm text-center space-y-4">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Hospital className="size-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-foreground">Clinic Registration Unavailable</h1>
            <p className="text-sm text-muted-foreground">
              {clinicError instanceof Error
                ? clinicError.message
                : "This clinic is currently inactive or not accepting patient self-registrations. Please check in with the clinic reception desk."}
            </p>
          </div>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/">CAREFLOW AI Home</Link>
          </Button>
        </div>
      </CenteredPanel>
    );
  }

  // 4. Success / Result View
  if (submissionResult) {
    return (
      <CenteredPanel>
        <div className="rounded-xl border bg-card p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="size-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="size-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {submissionResult.status === "CREATED_INVITED"
                  ? "Registration Submitted!"
                  : submissionResult.status === "CREATED_EXISTING_USER"
                  ? "Patient Record Created!"
                  : submissionResult.status === "CREATED_INVITE_PENDING"
                  ? "Registration Created (Activation Pending)"
                  : "Registration Notice"}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Clinic: <strong className="text-foreground">{clinic.displayName}</strong>
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-secondary/50 border border-border p-4 text-sm space-y-2 text-foreground">
            {"patientNumber" in submissionResult && (
              <p className="text-xs text-muted-foreground font-mono">
                Assigned Record #{submissionResult.patientNumber}
              </p>
            )}
            <p className="text-sm leading-relaxed">{submissionResult.message}</p>
          </div>

          {resendAlert && (
            <FormAlert tone={resendAlert.tone}>{resendAlert.message}</FormAlert>
          )}

          <div className="space-y-3 pt-2">
            {submissionResult.status === "CREATED_EXISTING_USER" || submissionResult.status === "EXISTS_LINKED" ? (
              <Button asChild className="w-full">
                <Link to="/login" search={{ redirect: "/patient/dashboard" }}>
                  Sign in to your account
                </Link>
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResend}
                  disabled={resending}
                  className="w-full text-xs gap-1.5"
                >
                  {resending ? <LoaderCircle className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                  Resend email activation link
                </Button>
                <Button asChild className="w-full">
                  <Link to="/login">
                    Go to Patient Sign In
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </CenteredPanel>
    );
  }

  // 5. Patient Self-Registration Form
  return (
    <CenteredPanel>
      <div className="rounded-xl border bg-card p-6 sm:p-8 shadow-sm space-y-6">
        {/* Clinic Branding Header */}
        <div className="border-b pb-4 space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <Hospital className="size-4" />
            <span>Clinic Patient Registration</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {clinic.displayName}
          </h1>
          {clinic.city && (
            <p className="text-xs text-muted-foreground">
              {clinic.address ? `${clinic.address}, ` : ""}
              {clinic.city}
            </p>
          )}
        </div>

        {/* Privacy Notice Banner */}
        <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
          <p>
            Your health records are strictly confidential and isolated to this clinic. After registering, you will receive a secure activation link to set your password and access your patient portal.
          </p>
        </div>

        {formError && <FormAlert tone="error">{formError}</FormAlert>}

        <form onSubmit={handleSubmit} noValidate className="space-y-4 text-left">
          {/* Patient Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField id="first_name" label="First name *" error={errors.first_name}>
              <Input
                id="first_name"
                required
                maxLength={100}
                placeholder="First name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
              />
            </FormField>

            <FormField id="last_name" label="Last name" error={errors.last_name}>
              <Input
                id="last_name"
                maxLength={100}
                placeholder="Last name (optional)"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
              />
            </FormField>
          </div>

          {/* Contact Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              id="email"
              label="Email address *"
              error={errors.email}
              hint="Activation instructions will be sent here."
            >
              <Input
                id="email"
                type="email"
                required
                maxLength={255}
                placeholder="your.email@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </FormField>

            <FormField
              id="phone"
              label="Phone number"
              error={errors.phone}
              hint="7–15 digits (e.g. +91 9876543210)"
            >
              <Input
                id="phone"
                type="tel"
                maxLength={25}
                placeholder="+91 98765 43210"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </FormField>
          </div>

          {/* Demographics: DOB and Gender */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField id="dob" label="Date of birth" error={errors.date_of_birth}>
              <Input
                id="dob"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={dob}
                onChange={e => setDob(e.target.value)}
              />
            </FormField>

            <FormField id="gender" label="Gender" error={errors.gender}>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger id="gender">
                  <SelectValue placeholder="Select gender (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                  <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          {/* Address */}
          <FormField id="address" label="Residential address" error={errors.address}>
            <Textarea
              id="address"
              rows={2}
              maxLength={1000}
              placeholder="Address, city, postal code"
              value={address}
              onChange={e => setAddress(e.target.value)}
            />
          </FormField>

          {/* Emergency Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              id="emergency_name"
              label="Emergency contact name"
              error={errors.emergency_contact_name}
            >
              <Input
                id="emergency_name"
                maxLength={100}
                placeholder="Contact person name"
                value={emergencyName}
                onChange={e => setEmergencyName(e.target.value)}
              />
            </FormField>

            <FormField
              id="emergency_phone"
              label="Emergency contact phone"
              error={errors.emergency_contact_phone}
            >
              <Input
                id="emergency_phone"
                type="tel"
                maxLength={25}
                placeholder="Emergency phone number"
                value={emergencyPhone}
                onChange={e => setEmergencyPhone(e.target.value)}
              />
            </FormField>
          </div>

          {/* Notes / Reason for Visit */}
          <FormField
            id="notes"
            label="Reason for visit / medical notes"
            error={errors.notes}
            hint="Describe your symptoms or reason for consulting the clinic."
          >
            <Textarea
              id="notes"
              rows={3}
              maxLength={5000}
              placeholder="Brief summary of symptoms, allergies, or care needs (optional)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </FormField>

          {/* Consent Checkbox */}
          <div className="pt-2">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="consent"
                checked={consent}
                onCheckedChange={checked => setConsent(checked === true)}
                className="mt-1"
              />
              <Label
                htmlFor="consent"
                className="text-xs text-muted-foreground leading-snug cursor-pointer"
              >
                I consent to the collection and processing of my personal and health details by{" "}
                <strong className="text-foreground">{clinic.displayName}</strong> for medical care
                and clinical record keeping in accordance with the{" "}
                <Link to="/privacy" target="_blank" className="text-primary underline">
                  CAREFLOW AI Privacy Policy
                </Link>
                . *
              </Label>
            </div>
            {errors.consent && (
              <p className="text-xs text-destructive mt-1 font-medium">{errors.consent}</p>
            )}
          </div>

          {/* Submission Action */}
          <div className="pt-4 space-y-2">
            <Button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full h-11 text-sm font-semibold"
            >
              {registerMutation.isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin mr-2" />
                  Registering patient…
                </>
              ) : (
                "Register myself as a patient."
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Already have an active account?{" "}
              <Link to="/login" className="text-primary font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </form>
      </div>
    </CenteredPanel>
  );
}
