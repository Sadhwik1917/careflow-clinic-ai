import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { emptyPatientForm, patientFieldsSchema, registrationSchema, type Patient, type PatientFormValues } from "@/lib/patients";

const fields = [
  ["first_name", "First name", "text", 100], ["last_name", "Last name", "text", 100],
  ["date_of_birth", "Date of birth", "date", 10], ["gender", "Gender", "text", 40],
  ["phone", "Phone", "tel", 25], ["email", "Email", "email", 255],
  ["emergency_contact_name", "Emergency contact name", "text", 100], ["emergency_contact_phone", "Emergency contact phone", "tel", 25],
] as const;
export function PatientForm({ patient, onSave, onCancel }: { patient?: Patient; onSave: (fields: PatientFormValues) => Promise<unknown>; onCancel: () => void }) {
  const [values, setValues] = useState<PatientFormValues>(() => patient ? Object.fromEntries(Object.keys(emptyPatientForm).map(k => [k, patient[k as keyof Patient] ?? ""])) as PatientFormValues : { ...emptyPatientForm });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useMutation({ mutationFn: onSave });
  const change = (key: keyof PatientFormValues, value: string) => { setValues(v => ({ ...v, [key]: value })); setErrors(e => ({ ...e, [key]: "" })); mutation.reset(); };
  const control = (key: keyof PatientFormValues, label: string, type: string, max: number) => <div key={key} className="min-w-0 space-y-2"><Label htmlFor={key}>{label}{key === "first_name" || key === "patient_number" ? " *" : ""}</Label><Input id={key} type={type} maxLength={max} value={values[key]} onChange={e => change(key, e.target.value)} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} required={key === "first_name" || key === "patient_number"} />{errors[key] && <p id={`${key}-error`} className="text-sm text-destructive">{errors[key]}</p>}</div>;
  return <form noValidate className="max-w-3xl space-y-6" onSubmit={e => {
    e.preventDefault(); if (mutation.isPending) return;
    const { patient_number, ...editable } = values;
    const parsed = patient ? patientFieldsSchema.safeParse(editable) : registrationSchema.safeParse(values);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(i => [String(i.path[0]), i.message]))); return; }
    setErrors({}); mutation.mutate(values);
  }}>
    <fieldset disabled={mutation.isPending} className="grid min-w-0 gap-5 sm:grid-cols-2">
      <legend className="mb-4 text-base font-semibold">Patient information</legend>
      {!patient && control("patient_number", "Patient number", "text", 100)}
      {fields.map(([key, label, type, max]) => control(key, label, type, max))}
      {([ ["address", "Address", 1000], ["notes", "Notes", 5000] ] as const).map(([key, label, max]) => <div key={key} className="space-y-2 sm:col-span-2"><Label htmlFor={key}>{label}</Label><Textarea id={key} maxLength={max} value={values[key]} onChange={e => change(key, e.target.value)} aria-invalid={!!errors[key]} />{errors[key] && <p className="text-sm text-destructive">{errors[key]}</p>}</div>)}
    </fieldset>
    {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error instanceof Error ? mutation.error.message : "Changes could not be saved."}</p>}
    <div className="flex flex-wrap gap-3 border-t pt-5"><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? <LoaderCircle className="animate-spin" /> : <Save />}{mutation.isPending ? "Saving…" : patient ? "Save changes" : "Register patient"}</Button><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onCancel}>Cancel</Button></div>
  </form>;
}