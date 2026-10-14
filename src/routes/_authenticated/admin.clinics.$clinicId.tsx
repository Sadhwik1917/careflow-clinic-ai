import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, Loader2 } from "lucide-react";
import { PageTitle } from "@/components/careflow/page-title";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@/components/careflow/feedback";
import { FormAlert } from "@/components/careflow/auth-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { pageMetadata } from "@/lib/navigation";
import { clinicTypes, statusLabel, statusTone, type VerificationStatus } from "@/lib/verification";
import { subscriptionLabel } from "@/lib/admin-data";
import { actionHelp, actionLabel, actionProblem, adminActionErrorMessage, availableActions, type AdminClinicAction } from "@/lib/entitlements";
import { effectiveStatusBadge } from "@/lib/clinic-restriction";
import { ClinicActivityHistory } from "@/components/careflow/clinic-activity-history";
import { AdminAiUsage } from "@/components/careflow/admin-ai-usage";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export const clinicDetailQuery = (clinicId: string) => queryOptions({
  queryKey: ["admin-verifications", "clinic", clinicId],
  queryFn: async () => {
    const { data, error } = await supabase.from("clinics")
      .select("id, name, display_name, clinic_code, clinic_type, status, phone, email, address, city, state, postal_code, country, latitude, longitude, registration_number, representative_name, representative_phone, created_at, owner:profiles(display_name, phone), verification:clinic_verifications(status, cycle, decided_at, decision_reason), events:verification_events(event_type, reason, created_at), links:subscription_clinics(subscription:clinic_subscriptions(status, clinic_scope, amount, currency, next_billing_date, trial_end_date, plan:plans(name)))")
      .eq("id", clinicId).maybeSingle();
    if (error) throw new Error("We couldn't load this clinic.");
    return data as any;
  },
});

export const Route = createFileRoute("/_authenticated/admin/clinics/$clinicId")({
  head: () => pageMetadata("Clinic details", "PLATFORM_ADMIN"),
  component: Page,
});

function Page() {
  const { clinicId } = Route.useParams();
  const qc = useQueryClient();
  const q = useQuery(clinicDetailQuery(clinicId));
  const [action, setAction] = useState<AdminClinicAction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const back = <Button variant="ghost" size="sm" asChild><Link to="/admin/clinics"><ArrowLeft />All clinics</Link></Button>;

  if (q.isPending) return <div className="px-6"><LoadingState label="Loading clinic…" /></div>;
  if (q.isError) return <div className="space-y-4 px-4 py-6 md:px-6">{back}<ErrorState title="Clinic couldn't load" description="Check your connection or admin access, then try again." onRetry={() => q.refetch()} /></div>;
  const c = q.data;
  if (!c) return <div className="space-y-4 px-4 py-6 md:px-6">{back}<EmptyState icon={Building2} title="Clinic not found" description="It may have been removed, or you may not have access." /></div>;

  const ver = one<{ status: VerificationStatus; cycle: number; decided_at: string | null; decision_reason: string | null }>(c.verification);
  const vs = ver?.status ?? null;
  const subs = ((c.links ?? []) as any[]).map(l => one<any>(l.subscription)).filter(Boolean);
  const actions = availableActions(vs, c.status);

  async function confirm() {
    if (!action) return;
    const p = actionProblem(action, vs, c.status, reason);
    if (p) { setMsg({ ok: false, text: p }); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("admin_clinic_action", { p_clinic: clinicId, p_action: action, p_reason: reason });
    setBusy(false);
    setMsg(error ? { ok: false, text: adminActionErrorMessage(error.message) } : { ok: true, text: `${actionLabel[action]}: recorded.` });
    if (!error) { setAction(null); setReason(""); }
    await qc.invalidateQueries({ queryKey: ["admin-verifications"] });
  }

  const section = (title: string, rows: [string, unknown][]) => <section className="rounded-lg border bg-card p-5">
    <h2 className="text-base font-semibold">{title}</h2>
    <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">{rows.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-40 shrink-0 text-muted-foreground">{k}</dt><dd className="min-w-0 break-words">{v === null || v === undefined || v === "" ? "—" : String(v)}</dd></div>)}</dl>
  </section>;

  const badge = effectiveStatusBadge(c.status, vs, c.events ?? [], statusLabel, statusTone);
  return <>
    <PageTitle title={c.display_name} description={`${c.name} · ${c.clinic_code}`} actions={<StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>} />
    <div className="space-y-6 border-t px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">{back}<Button variant="outline" size="sm" asChild><Link to="/admin/verifications/$clinicId" params={{ clinicId }}>View verification application</Link></Button></div>
      {msg && <FormAlert tone={msg.ok ? "success" : "error"}>{msg.text}</FormAlert>}
      {section("Identity", [["Display name", c.display_name], ["Registered name", c.name], ["Clinic code", c.clinic_code], ["Type", clinicTypes.find(t => t.value === c.clinic_type)?.label ?? c.clinic_type], ["Created", new Date(c.created_at).toLocaleDateString()]])}
      {section("Contact and location", [["Phone", c.phone], ["Email", c.email], ["Address", c.address], ["City / State", [c.city, c.state].filter(Boolean).join(", ")], ["Postal code", c.postal_code], ["Country", c.country], ["Coordinates", c.latitude != null && c.longitude != null ? `${c.latitude}, ${c.longitude}` : null]])}
      {section("Registration and owner", [["Registration no.", c.registration_number], ["Owner", one<any>(c.owner)?.display_name], ["Owner phone", one<any>(c.owner)?.phone], ["Representative", c.representative_name], ["Representative phone", c.representative_phone]])}
      {section("Verification", [["Status", vs ? statusLabel[vs] : "Not submitted"], ["Round", ver?.cycle], ["Decided", ver?.decided_at ? new Date(ver.decided_at).toLocaleString() : null], ["Reason", ver?.decision_reason]])}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-base font-semibold">Subscription</h2>
        {subs.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No subscription.</p> :
          <ul className="mt-3 divide-y text-sm">{subs.map((s, i) => <li key={i} className="flex flex-wrap justify-between gap-2 py-2"><span>{one<any>(s.plan)?.name ?? "Plan"}{s.clinic_scope ? ` · ${s.clinic_scope === "MULTI" ? "Multi-clinic" : "Single clinic"}` : ""}</span><span className="text-muted-foreground">{subscriptionLabel[s.status as keyof typeof subscriptionLabel]} · {s.currency} {Number(s.amount).toLocaleString()}{s.next_billing_date ? ` · next ${new Date(s.next_billing_date).toLocaleDateString()}` : ""}</span></li>)}</ul>}
      </section>
      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-base font-semibold">Action on an approved clinic</h2>
        <p className="mt-1 text-sm text-muted-foreground">For applications still under review, use the verification application instead.</p>
        {actions.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Available only once a clinic is approved.</p> : !action ?
          <div className="mt-3 flex flex-wrap gap-2">{actions.map(a => <Button key={a} variant={a === "REINSTATE" ? "default" : a === "REVOKE" ? "destructive" : "outline"} onClick={() => { setAction(a); setMsg(null); }}>{actionLabel[a]}</Button>)}</div>
          : <div className="mt-3 space-y-3">
            <p className="text-sm"><strong>{actionLabel[action]}.</strong> {actionHelp[action]}</p>
            <Textarea aria-label="Reason" placeholder="Reason (required)" value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} />
            <div className="flex flex-wrap gap-2"><Button variant={action === "REINSTATE" ? "default" : "destructive"} disabled={busy || !reason.trim()} onClick={() => void confirm()}>{busy && <Loader2 className="animate-spin" />}Confirm</Button><Button variant="ghost" disabled={busy} onClick={() => setAction(null)}>Back</Button></div>
          </div>}
      </section>
      <AdminAiUsage clinicId={clinicId} />
      <ClinicActivityHistory clinicId={clinicId} />
    </div>
  </>;
}
