import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { doctorFieldsSchema, doctorStatusLabel, type DoctorFormValues, type DoctorProfile } from "@/lib/team";

const textFields = [
  ["specialization", "Specialty", 120], ["department", "Department", 120],
  ["qualification", "Qualification", 200], ["license_number", "License number", 80],
] as const;

export function DoctorForm({
  doctor,
  onSave,
  onCancel,
  onReload,
}: {
  doctor: DoctorProfile;
  onSave: (fields: DoctorFormValues) => Promise<unknown>;
  onCancel: () => void;
  onReload?: () => Promise<void> | void;
}) {
  const [values, setValues] = useState<DoctorFormValues>(() => ({
    specialization: doctor.specialization, department: doctor.department ?? "", qualification: doctor.qualification ?? "",
    experience_years: doctor.experience_years, license_number: doctor.license_number ?? "",
    consultation_fee: doctor.consultation_fee ?? "", bio: doctor.bio ?? "", status: doctor.status,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useMutation({ mutationFn: onSave });
  const change = (key: keyof DoctorFormValues, value: string) => { setValues(v => ({ ...v, [key]: value })); setErrors(e => ({ ...e, [key]: "" })); mutation.reset(); };
  const control = (key: keyof DoctorFormValues, label: string, max: number, required = false) => <div key={key} className="min-w-0 space-y-2"><Label htmlFor={key}>{label}{required ? " *" : ""}</Label><Input id={key} maxLength={max} value={String(values[key] ?? "")} onChange={e => change(key, e.target.value)} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} required={required} />{errors[key] && <p id={`${key}-error`} className="text-sm text-destructive">{errors[key]}</p>}</div>;

  const isConflict = Boolean(
    mutation.isError &&
    mutation.error instanceof Error &&
    (mutation.error.message.includes("changed or is no longer available") ||
      mutation.error.message.toLowerCase().includes("reload"))
  );

  return <form noValidate className="max-w-3xl space-y-6" onSubmit={e => {
    e.preventDefault(); if (mutation.isPending) return;
    const parsed = doctorFieldsSchema.safeParse(values);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(i => [String(i.path[0]), i.message]))); return; }
    setErrors({}); mutation.mutate(values);
  }}>
    <fieldset disabled={mutation.isPending} className="grid min-w-0 gap-5 sm:grid-cols-2">
      <legend className="mb-4 text-base font-semibold">Doctor profile</legend>
      {textFields.map(([key, label, max]) => control(key, label, max, key === "specialization"))}
      {control("experience_years", "Experience (years)", 3)}
      {control("consultation_fee", "Consultation fee (₹)", 9)}
      <div className="min-w-0 space-y-2"><Label htmlFor="status">Status</Label><Select value={values.status} onValueChange={v => change("status", v)}><SelectTrigger id="status"><SelectValue /></SelectTrigger><SelectContent>{(["ACTIVE", "INACTIVE", "ON_LEAVE"] as const).map(s => <SelectItem key={s} value={s}>{doctorStatusLabel[s]}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" maxLength={2000} value={values['bio'] ?? ""} onChange={e => change("bio", e.target.value)} aria-invalid={!!errors['bio']} aria-describedby={errors['bio'] ? "bio-error" : undefined} />
        {errors['bio'] && <p id="bio-error" className="text-sm text-destructive">{errors['bio']}</p>}
      </div>
    </fieldset>

    {isConflict ? (
      <div role="alert" className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200 space-y-2">
        <p className="font-medium">Conflict detected: Profile changed by another session</p>
        <p>{mutation.error instanceof Error ? mutation.error.message : "This doctor profile was modified elsewhere."}</p>
        {onReload && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1"
            onClick={async () => {
              mutation.reset();
              await onReload();
            }}
          >
            Reload latest profile
          </Button>
        )}
      </div>
    ) : mutation.isError ? (
      <p role="alert" className="text-sm text-destructive">
        {mutation.error instanceof Error ? mutation.error.message : "Changes could not be saved."}
      </p>
    ) : null}

    <div className="flex flex-wrap gap-3 border-t pt-5">
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
        {mutation.isPending ? "Saving…" : "Save changes"}
      </Button>
      <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onCancel}>
        Cancel
      </Button>
    </div>
  </form>;
}
