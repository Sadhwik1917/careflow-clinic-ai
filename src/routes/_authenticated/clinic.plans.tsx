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
import { createClinicSubscription } from "@/lib/subscriptions.functions";
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

type Enroll = { canEnroll: boolean; busy: boolean; onEnroll: (planId: string, scope: "SINGLE" | "MULTI" | null) => void };

function PlanCard({ p, enroll }: { p: Plan; enroll: Enroll }) {
  const [scope, setScope] = useState<"SINGLE" | "MULTI">("SINGLE");
  const flexible = p.clinic_mode === "SINGLE_OR_MULTI";
  const mode = flexible ? scope : p.clinic_mode;
  const clinics = mode === "SINGLE" ? 1 : p.max_clinics;
  const scopeText = clinics === 1 ? "Single clinic" : `Multi-clinic · up to ${clinics} clinics`;
  const ai = !p.ai_enabled || p.ai_credit_type === "NONE" ? "No AI features"
    : p.ai_credit_type === "UNLIMITED" ? "Unlimited AI credits"
    : `${p.ai_credit_limit} AI credits / month${p.clinic_mode === "MULTI" ? " (shared across clinics)" : ""}`;
  const features = Array.isArray(p.features) ? (p.features as string[]) : [];
  return <li className="flex flex-col rounded-lg border bg-card p-5">
    <div className="flex items-start justify-between gap-2">
      <h2 className="font-semibold">{p.name}</h2>
      {p.ai_credit_type === "UNLIMITED" && <StatusBadge tone="success">Unlimited AI</StatusBadge>}
    </div>
    {p.description && <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>}
    <p className="mt-3 text-xl font-semibold">{p.currency === "INR" ? inr(p.price) : `${p.currency} ${p.price}`} <span className="text-sm font-normal text-muted-foreground">/ month</span></p>
    {p.trial_enabled && <p className="mt-2"><StatusBadge tone="info">{p.trial_duration_days}-day free trial</StatusBadge></p>}
    {flexible && <div role="radiogroup" aria-label="Clinic scope" className="mt-3 grid grid-cols-2 gap-1 rounded-md border p-1 text-sm">
      {(["SINGLE", "MULTI"] as const).map(s => <button key={s} type="button" role="radio" aria-checked={scope === s} onClick={() => setScope(s)} className={`rounded px-2 py-1 ${scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{s === "SINGLE" ? "Single clinic" : "Multi-clinic"}</button>)}
    </div>}
    <dl className="mt-3 space-y-1 text-sm">
      <div><dt className="inline text-muted-foreground">Clinic scope: </dt><dd className="inline font-medium">{scopeText}</dd></div>
      <div><dt className="inline text-muted-foreground">AI allowance: </dt><dd className="inline font-medium">{ai}</dd></div>
    </dl>
    <ul className="mt-3 flex-1 space-y-1 text-sm">{features.map(f => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{f}</li>)}</ul>
    <Button className="mt-4 w-full" disabled={!enroll.canEnroll || enroll.busy} onClick={() => enroll.onEnroll(p.id, flexible ? scope : null)}>{enroll.busy ? "Creating subscription…" : enroll.canEnroll ? "Enroll" : "Only the clinic owner can enroll"}</Button>
  </li>;
}

function Page() {
  const { membership } = Route.useRouteContext();
  const { data } = useSuspenseQuery(plansQuery(membership?.clinic_id ?? ""));
  const create = useServerFn(createClinicSubscription);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const canEnroll = !!membership && membership.role === "OWNER" && data.status === "APPROVED" && !result?.ok;
  const onEnroll = async (planId: string, scope: "SINGLE" | "MULTI" | null) => {
    if (busy || !membership) return;
    setBusy(true); setResult(null);
    try {
      const r = await create({ data: { clinicId: membership.clinic_id, planId, scope } });
      if (r.ok) setResult({ ok: true, text: `Razorpay Test Mode subscription ${r.razorpaySubscriptionId} ${r.reused ? "already exists" : "was created"} and is awaiting payment. No payment has been taken, and your plan is not active yet.` });
      else setResult({ ok: false, text: r.error });
    } catch (e) {
      console.error("[plans] enroll failed", e instanceof Error ? e.message : e);
      setResult({ ok: false, text: "We couldn't start the subscription. Please check your connection and try again." });
    } finally { setBusy(false); }
  };
  return <>
    <PageTitle title="Plans" description="Choose a plan once your clinic is approved." />
    <div className="space-y-6 border-t px-4 py-6 md:px-6">
      {!canViewPlans(data.status) ? <div className="rounded-lg border bg-card"><EmptyState icon={CreditCard} title="Plans unlock after approval" description={`Your verification status is ${data.status ? statusLabel[data.status].toLowerCase() : "not started"}. Plans become available once CAREFLOW approves your clinic.`} action={<Button asChild><Link to="/clinic/verification">Go to verification</Link></Button>} /></div> : <>
        {result ? <div role="status" className={`rounded-md border p-3 text-sm ${result.ok ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5 text-destructive"}`}>{result.text}</div>
          : <FormAlert>Enrolling creates a Razorpay Test Mode subscription awaiting payment. Payment collection isn't available yet, so your plan won't become active from here.</FormAlert>}
        <p className="text-sm text-muted-foreground">AI-enabled plans include a monthly AI credit allowance. Max AI removes the credit limit and lets you pick single-clinic or multi-clinic scope at the same price.</p>
        {data.plans.length === 0 ? <div className="rounded-lg border bg-card"><EmptyState icon={CreditCard} title="No plans published yet" description="CAREFLOW hasn't published any plans yet." /></div> :
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.plans.map(p => <PlanCard key={p.id} p={p} enroll={{ canEnroll, busy, onEnroll }} />)}</ul>}
      </>}
    </div>
  </>;
}
