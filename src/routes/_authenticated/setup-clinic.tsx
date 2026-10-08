import { useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AreaError, AreaPending } from "@/components/careflow/area-layout";
import { CenteredPanel, FormAlert, FormField } from "@/components/careflow/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { accessQueryOptions, setSelectedClinicId } from "@/lib/access";
import { canStartFirstClinic, clinicSetupErrorMessage, validateClinicSetup, type ClinicSetupErrors, type ClinicSetupForm } from "@/lib/clinic-setup";

export const Route = createFileRoute("/_authenticated/setup-clinic")({
  head: () => ({ meta: [{ title: "Set up your clinic — CAREFLOW AI" }, { name: "description", content: "Create your first clinic on CAREFLOW AI." }, { property: "og:title", content: "Set up your clinic — CAREFLOW AI" }, { property: "og:description", content: "Create your first clinic on CAREFLOW AI." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  beforeLoad: async ({ context }) => {
    const access = await context.queryClient.ensureQueryData(accessQueryOptions(context.user.id, context.user.email ?? null));
    if (!canStartFirstClinic(access)) throw redirect({ to: "/workspace" });
  },
  pendingComponent: AreaPending,
  errorComponent: AreaError,
  component: SetupClinic,
});

const empty: ClinicSetupForm = { displayName: "", name: "", phone: "", email: "", address: "", city: "", state: "" };
const fields: { key: keyof ClinicSetupForm; label: string; type?: string; autoComplete?: string; hint?: string; required?: boolean; maxLength: number }[] = [
  { key: "displayName", label: "Clinic Display Name", required: true, maxLength: 60, hint: "Shown beside the CAREFLOW AI brand throughout your clinic workspace. Up to 60 characters." },
  { key: "name", label: "Clinic name", required: true, maxLength: 120, autoComplete: "organization", hint: "Your clinic's full or registered name." },
  { key: "phone", label: "Phone (optional)", type: "tel", autoComplete: "tel", maxLength: 20 },
  { key: "email", label: "Email (optional)", type: "email", autoComplete: "email", maxLength: 254 },
  { key: "address", label: "Address (optional)", autoComplete: "street-address", maxLength: 300 },
  { key: "city", label: "City (optional)", autoComplete: "address-level2", maxLength: 80 },
  { key: "state", label: "State (optional)", autoComplete: "address-level1", maxLength: 80 },
];

function SetupClinic() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<ClinicSetupErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    const v = validateClinicSetup(form);
    setErrors(v); setFailure(null);
    if (Object.keys(v).length) return;
    inFlight.current = true; setSubmitting(true);
    const args: { p_display_name: string; p_name: string; p_phone?: string; p_email?: string; p_address?: string; p_city?: string; p_state?: string } = { p_display_name: form.displayName.trim(), p_name: form.name.trim() };
    for (const [k, v] of [["p_phone", form.phone], ["p_email", form.email], ["p_address", form.address], ["p_city", form.city], ["p_state", form.state]] as const) if (v.trim()) args[k] = v.trim();
    const { data, error } = await supabase.rpc("create_first_clinic", args);
    if (error || !data) { setFailure(clinicSetupErrorMessage(error?.message)); inFlight.current = false; setSubmitting(false); return; }
    setSelectedClinicId(data);
    await queryClient.invalidateQueries({ queryKey: accessQueryOptions(user.id, user.email ?? null).queryKey });
    void navigate({ to: "/clinic/dashboard" });
  }

  return <CenteredPanel>
    <h1 className="text-2xl font-semibold">Set up your clinic</h1>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Create your first clinic. You'll become its owner and can invite your team later.</p>
    <form noValidate onSubmit={e => void submit(e)} className="mt-6 space-y-5 rounded-lg border bg-card p-5 md:p-6" aria-busy={submitting}>
      {failure && <FormAlert>{failure}</FormAlert>}
      {fields.map(f => <FormField key={f.key} id={f.key} label={f.label} error={errors[f.key]} hint={f.hint}>
        <Input id={f.key} name={f.key} type={f.type ?? "text"} autoComplete={f.autoComplete} maxLength={f.maxLength} required={f.required} value={form[f.key]} disabled={submitting} aria-invalid={!!errors[f.key]} aria-describedby={errors[f.key] ? `${f.key}-error` : f.hint ? `${f.key}-hint` : undefined} onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))} />
      </FormField>)}
      <div className="flex flex-wrap gap-3 pt-1">
        <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="animate-spin" />}{submitting ? "Creating clinic…" : "Create clinic"}</Button>
        <Button type="button" variant="ghost" asChild disabled={submitting}><Link to="/workspace">Cancel</Link></Button>
      </div>
    </form>
  </CenteredPanel>;
}
