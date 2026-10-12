import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Check, CreditCard } from "lucide-react";
import { PageTitle } from "@/components/careflow/page-title";
import { EmptyState, StatusBadge } from "@/components/careflow/feedback";
import { FormAlert } from "@/components/careflow/auth-ui";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { pageMetadata } from "@/lib/navigation";
import { useServerFn } from "@tanstack/react-start";
import { createClinicSubscription, verifySubscriptionPayment } from "@/lib/subscriptions.functions";
import { EnrollDialog, type EnrollPlan } from "@/components/careflow/enroll-dialog";
import { openSubscriptionCheckout } from "@/lib/razorpay-checkout";
import { canViewPlans, statusLabel } from "@/lib/verification";

const plansQuery = (clinicId: string) => queryOptions({
  queryKey: ["plans", clinicId],
  queryFn: async () => {
    const ver = await supabase.from("clinic_verifications").select("status").eq("clinic_id", clinicId).maybeSingle();
    if (ver.error) throw new Error("We couldn't load your verification status.");
    const status = ver.data?.status ?? null;
    if (!canViewPlans(status)) return { status, plans: [] };
    const plans = await supabase.from("plans").select("id, name, description, price, currency, billing_cycle, trial_enabled, trial_duration_days, clinic_mode, ai_enabled, ai_credit_type, ai_credit_limit, max_clinics, features").eq("is_active", true).order("price");
    if (plans.error) throw new Error("We couldn't load plans.");
    return { status, plans: plans.data ?? [] };
  },
});

type Plan = Awaited<ReturnType<NonNullable<ReturnType<typeof plansQuery>["queryFn"]>>>["plans"][number];

export const Route = createFileRoute("/_authenticated/clinic/plans")({
  head: () => pageMetadata("Plans", "OWNER"),
  component: Page,
});

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;

function describePlan(p: Plan, scope: "SINGLE" | "MULTI") {
  const flexible = p.clinic_mode === "SINGLE_OR_MULTI";
  const mode = flexible ? scope : p.clinic_mode;
  const clinics = mode === "SINGLE" ? 1 : p.max_clinics;
  const scopeText = clinics === 1 ? "Single clinic" : `Multi-clinic · up to ${clinics} clinics`;
  const ai = !p.ai_enabled || p.ai_credit_type === "NONE" ? "No AI features"
    : p.ai_credit_type === "UNLIMITED" ? "Unlimited AI credits"
    : `${p.ai_credit_limit} AI credits / month${p.clinic_mode === "MULTI" ? " (shared across clinics)" : ""}`;
  const features = Array.isArray(p.features) ? (p.features as string[]) : [];
  const price = p.currency === "INR" ? inr(p.price) : `${p.currency} ${p.price}`;
  return { flexible, scopeText, ai, features, price, trial: p.trial_enabled ? `${p.trial_duration_days}-day free trial` : null };
}

function PlanCard({ p, canEnroll, busy, onChoose }: { p: Plan; canEnroll: boolean; busy: boolean; onChoose: (p: Plan) => void }) {
  const d = describePlan(p, "SINGLE");
  return <li className="flex flex-col rounded-lg border bg-card p-5">
    <div className="flex items-start justify-between gap-2">
      <h2 className="font-semibold">{p.name}</h2>
      {p.ai_credit_type === "UNLIMITED" && <StatusBadge tone="success">Unlimited AI</StatusBadge>}
    </div>
    {p.description && <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>}
    <p className="mt-3 text-xl font-semibold">{d.price} <span className="text-sm font-normal text-muted-foreground">/ month</span></p>
    {d.trial && <div className="mt-2"><StatusBadge tone="info">{d.trial}</StatusBadge></div>}
    <dl className="mt-3 space-y-1 text-sm">
      <div><dt className="inline text-muted-foreground">Clinic scope: </dt><dd className="inline font-medium">{d.flexible ? "Single clinic or multi-clinic (choose when enrolling)" : d.scopeText}</dd></div>
      <div><dt className="inline text-muted-foreground">AI allowance: </dt><dd className="inline font-medium">{d.ai}</dd></div>
    </dl>
    <ul className="mt-3 flex-1 space-y-1 text-sm">{d.features.map(f => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{f}</li>)}</ul>
    <Button type="button" className="mt-4 w-full" disabled={!canEnroll || busy} onClick={() => onChoose(p)}>{canEnroll ? "Enroll" : "Enrollment unavailable"}</Button>
  </li>;
}

type Notice = { tone: "ok" | "error" | "info"; text: string };

function Page() {
  const { membership } = Route.useRouteContext();
  const { data } = useSuspenseQuery(plansQuery(membership?.clinic_id ?? ""));
  const create = useServerFn(createClinicSubscription);
  const verify = useServerFn(verifySubscriptionPayment);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const canEnroll = !!membership && membership.role === "OWNER" && data.status === "APPROVED";

  const confirm = async (scope: "SINGLE" | "MULTI") => {
    if (busy || !membership || !selected) return;
    setBusy(true); setDialogError(null);
    try {
      const r = await create({ data: { clinicId: membership.clinic_id, planId: selected.id, scope: selected.clinic_mode === "SINGLE_OR_MULTI" ? scope : null } });
      if (!r.ok) { setDialogError(r.error); return; }
      setSelected(null);
      const outcome = await openSubscriptionCheckout({ keyId: r.keyId, subscriptionId: r.razorpaySubscriptionId, name: "CAREFLOW AI", description: selected.name });
      if (outcome.kind === "dismissed") { setNotice({ tone: "info", text: `Checkout was closed. Your subscription ${r.razorpaySubscriptionId} is still awaiting payment; choose the same plan again to resume.` }); return; }
      if (outcome.kind === "failed") { setNotice({ tone: "error", text: `Payment didn't go through${outcome.reason ? `: ${outcome.reason}` : ""}. Nothing was activated; you can try again with the same plan.` }); return; }
      if (outcome.kind === "load_error") { setNotice({ tone: "error", text: "We couldn't open Razorpay checkout. Check your connection and try again." }); return; }
      const v = await verify({ data: outcome.result });
      setNotice(v.ok
        ? { tone: "ok", text: `Payment received for subscription ${r.razorpaySubscriptionId}. Razorpay will confirm it shortly; your plan becomes active only after that confirmation (current status: ${v.status.replace("_", " ").toLowerCase()}).` }
        : { tone: "error", text: v.error });
    } catch (e) {
      console.error("[plans] enroll failed", e instanceof Error ? e.message : e);
      setDialogError("We couldn't start the subscription. Please check your connection and try again.");
    } finally { setBusy(false); }
  };

  const tone = notice?.tone === "ok" ? "border-primary/40 bg-primary/5" : notice?.tone === "error" ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted";
  const sel: EnrollPlan | null = selected ? { name: selected.name, flexible: selected.clinic_mode === "SINGLE_OR_MULTI", describe: s => describePlan(selected, s) } : null;
  return <>
    <PageTitle title="Plans" description="Choose a plan once your clinic is approved." />
    <div className="space-y-6 border-t px-4 py-6 md:px-6">
      {!canViewPlans(data.status) ? <div className="rounded-lg border bg-card"><EmptyState icon={CreditCard} title="Plans unlock after approval" description={`Your verification status is ${data.status ? statusLabel[data.status].toLowerCase() : "not started"}. Plans become available once CAREFLOW approves your clinic.`} action={<Button asChild><Link to="/clinic/verification">Go to verification</Link></Button>} /></div> : <>
        {notice ? <div role="status" className={`rounded-md border p-3 text-sm ${tone}`}>{notice.text}</div>
          : <FormAlert>Payments run in Razorpay Test Mode. Your plan becomes active only after Razorpay confirms the payment.</FormAlert>}
        <p className="text-sm text-muted-foreground">AI-enabled plans include a monthly AI credit allowance. Max AI removes the credit limit and lets you pick single-clinic or multi-clinic scope at the same price.</p>
        {data.plans.length === 0 ? <div className="rounded-lg border bg-card"><EmptyState icon={CreditCard} title="No plans published yet" description="CAREFLOW hasn't published any plans yet." /></div> :
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.plans.map(p => <PlanCard key={p.id} p={p} canEnroll={canEnroll} busy={busy} onChoose={pl => { setDialogError(null); setNotice(null); setSelected(pl); }} />)}</ul>}
      </>}
    </div>
    <EnrollDialog plan={sel} busy={busy} error={dialogError} onCancel={() => { if (!busy) setSelected(null); }} onConfirm={confirm} />
  </>;
}
