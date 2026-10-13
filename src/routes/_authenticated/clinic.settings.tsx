import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2 } from "lucide-react";
import { PageTitle } from "@/components/careflow/page-title";
import { EmptyState, LoadingState } from "@/components/careflow/feedback";
import { FormAlert } from "@/components/careflow/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { pageMetadata } from "@/lib/navigation";
import { clinicAllowanceQuery } from "@/lib/plan-state";
import { addClinicErrorMessage } from "@/lib/entitlements";
import { setSelectedClinicId } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/clinic/settings")({
  head: () => pageMetadata("Settings", "OWNER"),
  component: Page,
});

const fields = [["displayName", "Clinic Display Name", 60], ["name", "Clinic name", 120], ["city", "City", 80], ["state", "State", 80]] as const;
type Form = Record<(typeof fields)[number][0], string>;

function Page() {
  const allowance = useQuery(clinicAllowanceQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>({ displayName: "", name: "", city: "", state: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = allowance.data;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!form.displayName.trim() || form.name.trim().length < 2) { setError("Enter a display name and a clinic name."); return; }
    setBusy(true); setError(null);
    const args: { p_display_name: string; p_name: string; p_city?: string; p_state?: string } = { p_display_name: form.displayName.trim(), p_name: form.name.trim() };
    if (form.city.trim()) args.p_city = form.city.trim();
    if (form.state.trim()) args.p_state = form.state.trim();
    const { data, error: err } = await supabase.rpc("create_additional_clinic", args);
    setBusy(false);
    if (err || !data) { setError(addClinicErrorMessage(err?.message)); return; }
    setSelectedClinicId(data);
    await qc.invalidateQueries();
    void navigate({ to: "/clinic/verification" });
  }

  return <>
    <PageTitle title="Settings" description="Manage your clinics." />
    <div className="space-y-6 border-t px-4 py-6 md:px-6">
      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-base font-semibold">Clinics</h2>
        {allowance.isPending ? <LoadingState label="Checking your plan…" />
          : !a || !a.eligible ? <EmptyState icon={Building2} title={a && a.limit > 1 ? "Clinic limit reached" : "Adding clinics needs a multi-clinic plan"} description={a && a.limit > 1 ? `You're using ${a.used} of ${a.limit} clinics on your plan.` : "Your current plan covers one clinic. Upgrade to a multi-clinic plan to add more."} />
          : !open ? <div className="mt-3 flex flex-wrap items-center gap-3"><p className="text-sm text-muted-foreground">Using {a.used} of {a.limit} clinics. Each new clinic needs its own verification.</p><Button onClick={() => setOpen(true)}>Add clinic</Button></div>
          : <form onSubmit={submit} className="mt-3 grid gap-4 md:grid-cols-2">
            {fields.map(([k, label, max]) => <div key={k} className="space-y-1.5"><Label htmlFor={k}>{label}{k === "city" || k === "state" ? " (optional)" : ""}</Label><Input id={k} maxLength={max} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} /></div>)}
            {error && <div className="md:col-span-2"><FormAlert tone="error">{error}</FormAlert></div>}
            <div className="flex gap-2 md:col-span-2"><Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Add clinic and start verification</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Close</Button></div>
          </form>}
      </section>
    </div>
  </>;
}
