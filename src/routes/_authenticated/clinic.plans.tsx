import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Check, CreditCard } from "lucide-react";
import { PageTitle } from "@/components/careflow/page-title";
import { EmptyState, StatusBadge } from "@/components/careflow/feedback";
import { FormAlert } from "@/components/careflow/auth-ui";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { pageMetadata } from "@/lib/navigation";
import { useServerFn } from "@tanstack/react-start";
import { cancelClinicSubscription, cancelClinicTrial, createClinicSubscription, startClinicTrial, verifySubscriptionPayment } from "@/lib/subscriptions.functions";
import { planStateQuery } from "@/lib/plan-state";
import { trialDaysLeft } from "@/lib/subscription-rules";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EnrollDialog, type EnrollPlan } from "@/components/careflow/enroll-dialog";
import { openSubscriptionCheckout } from "@/lib/razorpay-checkout";
import { canViewPlans, statusLabel } from "@/lib/verification";
import { monthlyPlanPrice, planChoiceLabel, planComparisonPrice } from "@/lib/plan-selection";

const plansQuery = (clinicId: string) =>
  queryOptions({
    queryKey: ["plans", clinicId],
    queryFn: async () => {
      const ver = await supabase.from("clinic_verifications").select("status").eq("clinic_id", clinicId).maybeSingle();
      if (ver.error) throw new Error("We couldn't load your verification status.");
      const status = ver.data?.status ?? null;
      if (!canViewPlans(status)) return { status, plans: [] };
      const plans = await supabase
        .from("plans")
        .select(
          "id, name, description, price, currency, billing_cycle, trial_enabled, trial_duration_days, multi_price, clinic_mode, ai_enabled, ai_credit_type, ai_credit_limit, max_clinics, features",
        )
        .eq("is_active", true)
        .order("price");
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
  const ai =
    !p.ai_enabled || p.ai_credit_type === "NONE"
      ? "No AI features"
      : p.ai_credit_type === "UNLIMITED"
        ? "Unlimited AI credits"
        : `${p.ai_credit_limit} AI credits / month${p.clinic_mode === "MULTI" ? " (shared across clinics)" : ""}`;
  const features = Array.isArray(p.features) ? (p.features as string[]) : [];
  const amount = monthlyPlanPrice(p, scope);
  const price = p.currency === "INR" ? inr(amount) : `${p.currency} ${amount}`;
  return {
    flexible,
    scopeText,
    ai,
    features,
    price,
    trial: p.trial_enabled ? `${p.trial_duration_days}-day free trial` : null,
    priceRange: flexible && p.multi_price != null ? `${inr(p.price)} single · ${inr(p.multi_price)} multi-clinic` : null,
  };
}

type State = NonNullable<ReturnType<typeof useQuery<Awaited<ReturnType<NonNullable<ReturnType<typeof planStateQuery>["queryFn"]>>>>>["data"]>;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function PlanCard({ p, state, canEnroll, busy, selectedId, selectedScope, comparisonPrice, onChoose, onContinue, onCancelTrial, onCancelPaid }: {
  p: Plan; state: State | undefined; canEnroll: boolean; busy: boolean;
  selectedId: string | undefined; selectedScope: "SINGLE" | "MULTI"; comparisonPrice: number | null;
  onChoose: (p: Plan) => void; onContinue: () => void; onCancelTrial: () => void; onCancelPaid: () => void;
}) {
  const cur = state?.current;
  const isCurrent = cur?.planId === p.id;
  const isSelected = selectedId === p.id;
  const scope = isSelected ? selectedScope : isCurrent && cur?.scope === "MULTI" ? "MULTI" : "SINGLE";
  const d = describePlan(p, scope);
  const choiceLabel = planChoiceLabel(monthlyPlanPrice(p, scope), comparisonPrice);
  const trial = isCurrent && cur?.status === "TRIAL_ACTIVE" && cur.trialEnd ? cur.trialEnd : null;
  const curScope = isCurrent && cur?.scope ? describePlan(p, cur.scope as "SINGLE" | "MULTI").scopeText : null;
  return (
    <li className={`flex flex-col rounded-lg border bg-card p-5 ${isCurrent || isSelected ? "border-primary ring-1 ring-primary/30" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold">{p.name}</h2>
        {isSelected ? <StatusBadge tone="info">Selected plan</StatusBadge> : isCurrent ? <StatusBadge tone="success">{trial ? "Current plan · Free trial" : "Current plan"}</StatusBadge>
          : p.ai_credit_type === "UNLIMITED" && <StatusBadge tone="success">Unlimited AI</StatusBadge>}
      </div>
      {p.description && <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>}
      <p className="mt-3 text-xl font-semibold">{d.price} <span className="text-sm font-normal text-muted-foreground">/ month</span></p>
      {d.priceRange && <p className="text-xs text-muted-foreground">{d.priceRange}</p>}
      {d.trial && !isCurrent && <div className="mt-2"><StatusBadge tone="info">{d.trial}</StatusBadge></div>}
      <dl className="mt-3 space-y-1 text-sm">
        <div><dt className="inline text-muted-foreground">Clinic scope: </dt><dd className="inline font-medium">{curScope ?? (d.flexible ? "Single clinic or multi-clinic (choose when enrolling)" : d.scopeText)}</dd></div>
        <div><dt className="inline text-muted-foreground">AI allowance: </dt><dd className="inline font-medium">{d.ai}</dd></div>
        {trial && <div><dt className="inline text-muted-foreground">Trial ends: </dt><dd className="inline font-medium">{fmtDate(trial)} · {trialDaysLeft(trial)} day{trialDaysLeft(trial) === 1 ? "" : "s"} left</dd></div>}
      </dl>
      <ul className="mt-3 flex-1 space-y-1 text-sm">
        {d.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{f}</li>)}
      </ul>
      {trial ? (
        <div className="mt-4 grid gap-2">
          {cur?.mandate === "AUTHORIZED"
            ? <p className="text-xs text-muted-foreground">Renews automatically at {d.price}/month on {fmtDate(trial)}. Cancel up to 1 hour before to avoid the charge.</p>
            : <Button type="button" disabled={busy} onClick={onContinue}>Continue to Full Plan</Button>}
          <Button type="button" variant="outline" disabled={busy} onClick={onCancelTrial}>Cancel Free Trial</Button>
        </div>
      ) : isCurrent && (cur?.status === "ACTIVE" || cur?.status === "PAST_DUE") ? (
        <div className="mt-4 grid gap-2">
          {d.flexible
            ? <Button type="button" title="Choose clinic scope" disabled={!canEnroll || busy} onClick={() => onChoose(p)}>{choiceLabel}</Button>
            : <Button type="button" variant="outline" disabled>Your Current Plan</Button>}
          <Button type="button" variant="outline" disabled={busy} onClick={onCancelPaid}>Cancel Subscription</Button>
        </div>
      ) : isCurrent && !d.flexible ? (
        <Button type="button" className="mt-4 w-full" variant="outline" disabled>Your Current Plan</Button>
      ) : (
        <Button type="button" className="mt-4 w-full" disabled={!canEnroll || busy || !state} onClick={() => onChoose(p)}>
          {!canEnroll ? "Enrollment unavailable" : choiceLabel}
        </Button>
      )}
    </li>
  );
}

type Notice = { tone: "ok" | "error" | "info"; text: string };

function Page() {
  const { membership } = Route.useRouteContext();
  const clinicId = membership?.clinic_id ?? "";
  const { data } = useSuspenseQuery(plansQuery(clinicId));
  const planState = useQuery(planStateQuery(clinicId));
  const qc = useQueryClient();
  const router = useRouter();
  const create = useServerFn(createClinicSubscription);
  const verify = useServerFn(verifySubscriptionPayment);
  const startTrial = useServerFn(startClinicTrial);
  const cancelTrial = useServerFn(cancelClinicTrial);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [selectedScope, setSelectedScope] = useState<"SINGLE" | "MULTI">("SINGLE");
  const [busy, setBusy] = useState<"trial" | "paid" | "cancel" | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmCancelPaid, setConfirmCancelPaid] = useState(false);
  const cancelPaid = useServerFn(cancelClinicSubscription);
  const canEnroll = !!membership && membership.role === "OWNER" && data.status === "APPROVED";
  const state = planState.data;
  const comparisonPrice = planComparisonPrice(data.plans, selected, selectedScope, state?.current);

  const refresh = async () => { await qc.invalidateQueries({ queryKey: ["plan-state", clinicId] }); await router.invalidate(); };

  // The webhook, not the browser, activates plans; poll briefly so the page reflects it without a manual refresh.
  const waitForActivation = async (subscriptionId: string) => {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const s = await qc.fetchQuery({ ...planStateQuery(clinicId), staleTime: 0 });
      if (s.current?.id === subscriptionId && s.current.status === "ACTIVE") return true;
      if (s.current?.status === "ACTIVE" && s.current.type === "PAID" && s.current.id === subscriptionId) return true;
    }
    return false;
  };

  const runPaid = async (planId: string, planName: string, scope: "SINGLE" | "MULTI" | null) => {
    if (busy || !membership) return;
    setBusy("paid"); setDialogError(null);
    try {
      const r = await create({ data: { clinicId, planId, scope } });
      if (!r.ok) { if (selected) setDialogError(r.error); else setNotice({ tone: "error", text: r.error }); return; }
      setSelected(null);
      const outcome = await openSubscriptionCheckout({ keyId: r.keyId, subscriptionId: r.razorpaySubscriptionId, name: "CAREFLOW AI", description: planName });
      if (outcome.kind === "dismissed") { setNotice({ tone: "info", text: "Checkout was closed. Nothing was charged and your current access is unchanged; choose the plan again to resume." }); return; }
      if (outcome.kind === "failed") { setNotice({ tone: "error", text: `Payment didn't go through${outcome.reason ? `: ${outcome.reason}` : ""}. Nothing was activated; you can try again.` }); return; }
      if (outcome.kind === "load_error") { setNotice({ tone: "error", text: "We couldn't open Razorpay checkout. Check your connection and try again." }); return; }
      const v = await verify({ data: outcome.result });
      if (!v.ok) { setNotice({ tone: "error", text: v.error }); return; }
      setNotice({ tone: "info", text: "Payment received. Waiting for Razorpay to confirm it…" });
      const active = await waitForActivation(r.subscriptionId);
      setNotice(active ? { tone: "ok", text: "Payment confirmed. Your plan is now active." }
        : { tone: "info", text: "Payment received. Razorpay hasn't confirmed it yet; your plan becomes active as soon as it does." });
    } catch (e) {
      console.error("[plans] enroll failed", e instanceof Error ? e.message : e);
      const msg = "We couldn't start the subscription. Please check your connection and try again.";
      if (selected) setDialogError(msg); else setNotice({ tone: "error", text: msg });
    } finally { setBusy(null); await refresh(); }
  };

  const waitForTrial = async (subscriptionId: string) => {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const st = await qc.fetchQuery({ ...planStateQuery(clinicId), staleTime: 0 });
      if (st.current?.id === subscriptionId && st.current.status === "TRIAL_ACTIVE") return true;
    }
    return false;
  };

  // Trial = Razorpay mandate authorization; the trial starts only when the signed webhook confirms it.
  const runTrial = async (scope: "SINGLE" | "MULTI") => {
    if (busy || !selected) return;
    const plan = selected;
    setBusy("trial"); setDialogError(null);
    try {
      const r = await startTrial({ data: { clinicId, planId: plan.id, scope: plan.clinic_mode === "SINGLE_OR_MULTI" ? scope : null } });
      if (!r.ok) { setDialogError(r.error); return; }
      setSelected(null);
      const outcome = await openSubscriptionCheckout({ keyId: r.keyId, subscriptionId: r.razorpaySubscriptionId, name: "CAREFLOW AI", description: `${plan.name} — 21-day free trial authorization` });
      if (outcome.kind === "dismissed") { setNotice({ tone: "info", text: "Authorization wasn't completed. Your trial hasn't started and nothing has been charged. If you did approve it, the trial starts as soon as Razorpay confirms." }); return; }
      if (outcome.kind === "failed") { setNotice({ tone: "error", text: `Authorization didn't go through${outcome.reason ? `: ${outcome.reason}` : ""}. Your trial hasn't started.` }); return; }
      if (outcome.kind === "load_error") { setNotice({ tone: "error", text: "We couldn't open Razorpay checkout. Check your connection and try again." }); return; }
      const v = await verify({ data: outcome.result });
      if (!v.ok) { setNotice({ tone: "error", text: v.error }); return; }
      setNotice({ tone: "info", text: "Authorization received. Waiting for Razorpay to confirm it…" });
      const ok = await waitForTrial(r.subscriptionId);
      setNotice(ok ? { tone: "ok", text: `Your 21-day free trial of ${plan.name} has started. It renews automatically on ${fmtDate(r.trialEnd)} unless you cancel before then.` }
        : { tone: "info", text: "Authorization received. Your trial starts as soon as Razorpay confirms it." });
    } catch (e) {
      console.error("[plans] trial failed", e instanceof Error ? e.message : e);
      setDialogError("We couldn't start the trial. Please check your connection and try again.");
    } finally { setBusy(null); await refresh(); }
  };

  const runCancelTrial = async () => {
    const id = state?.current?.id;
    if (busy || !id) return;
    setBusy("cancel");
    try {
      const r = await cancelTrial({ data: { subscriptionId: id } });
      setNotice(r.ok ? { tone: "info", text: "Your free trial was cancelled. Clinic access has ended; choose a full plan to continue." } : { tone: "error", text: r.error });
      setConfirmCancel(false);
      await refresh();
    } catch { setNotice({ tone: "error", text: "We couldn't cancel the trial. Please try again." }); }
    finally { setBusy(null); }
  };

  const runCancelPaid = async () => {
    const id = state?.current?.id;
    if (busy || !id) return;
    setBusy("cancel");
    try {
      const r = await cancelPaid({ data: { subscriptionId: id } });
      setNotice(r.ok ? { tone: "info", text: "Your subscription was cancelled. No further charges will be made and clinic access has ended." } : { tone: "error", text: r.error });
      setConfirmCancelPaid(false);
      await refresh();
    } catch { setNotice({ tone: "error", text: "We couldn't cancel the subscription. Please try again." }); }
    finally { setBusy(null); }
  };

  const trialPlan = data.plans.find((p) => p.id === state?.current?.planId);
  const tone = notice?.tone === "ok" ? "border-primary/40 bg-primary/5" : notice?.tone === "error" ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted";
  const sel: EnrollPlan | null = useMemo(() => selected ? {
    name: selected.name,
    flexible: selected.clinic_mode === "SINGLE_OR_MULTI",
    trialAvailable: selected.trial_enabled && !state?.current && state?.trialUsed === false && !state?.registrationMissing,
    registrationMissing: selected.trial_enabled && !state?.current && state?.trialUsed === false && !!state?.registrationMissing,
    describe: (s) => describePlan(selected, s),
  } : null, [selected, state?.current, state?.trialUsed, state?.registrationMissing]);
  const title = state?.current ? "Upgrade Plan" : "Plans";
  return (
    <>
      <PageTitle title={title} description="Choose a plan once your clinic is approved." />
      <div className="space-y-6 border-t px-4 py-6 md:px-6">
        {!canViewPlans(data.status) ? (
          <div className="rounded-lg border bg-card">
            <EmptyState icon={CreditCard} title="Plans unlock after approval"
              description={`Your verification status is ${data.status ? statusLabel[data.status].toLowerCase() : "not started"}. Plans become available once CAREFLOW approves your clinic.`}
              action={<Button asChild><Link to="/clinic/verification">Go to verification</Link></Button>} />
          </div>
        ) : (
          <>
            {notice ? <div role="status" className={`rounded-md border p-3 text-sm ${tone}`}>{notice.text}</div>
              : <FormAlert>Payments run in Razorpay Test Mode. A paid plan becomes active only after Razorpay confirms the payment.</FormAlert>}
            {planState.isError && <p role="alert" className="text-sm text-destructive">We couldn't load your current plan. Refresh the page to try again.</p>}
            <p className="text-sm text-muted-foreground">AI-enabled plans include a monthly AI credit allowance. Max AI removes the credit limit and lets you pick single-clinic or multi-clinic scope.</p>
            {data.plans.length === 0 ? (
              <div className="rounded-lg border bg-card"><EmptyState icon={CreditCard} title="No plans published yet" description="CAREFLOW hasn't published any plans yet." /></div>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.plans.map((p) => (
                  <PlanCard key={p.id} p={p} state={state} canEnroll={canEnroll} busy={!!busy} selectedId={selected?.id} selectedScope={selectedScope} comparisonPrice={comparisonPrice}
                    onChoose={(pl) => { setDialogError(null); setNotice(null); setSelectedScope("SINGLE"); setSelected(pl); }}
                    onContinue={() => trialPlan && void runPaid(trialPlan.id, trialPlan.name, trialPlan.clinic_mode === "SINGLE_OR_MULTI" ? (state?.current?.scope as "SINGLE" | "MULTI") : null)}
                    onCancelTrial={() => setConfirmCancel(true)} onCancelPaid={() => setConfirmCancelPaid(true)} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <EnrollDialog plan={sel} busy={busy === "trial" || busy === "paid" ? busy : null} error={dialogError}
        onScopeChange={setSelectedScope}
        onCancel={() => { if (!busy) setSelected(null); }}
        onConfirm={(scope) => selected && void runPaid(selected.id, selected.name, selected.clinic_mode === "SINGLE_OR_MULTI" ? scope : null)}
        onStartTrial={(scope) => void runTrial(scope)} />
      <AlertDialog open={confirmCancel} onOpenChange={(o) => { if (!busy) setConfirmCancel(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your free trial?</AlertDialogTitle>
            <AlertDialogDescription>Cancelling stops the automatic charge scheduled for the end of your trial and ends clinic access immediately. A free trial can only be used once, so you won't be able to start another — you'll need a full plan to continue.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "cancel"}>Keep trial</AlertDialogCancel>
            <AlertDialogAction disabled={busy === "cancel"} onClick={(e) => { e.preventDefault(); void runCancelTrial(); }}>{busy === "cancel" ? "Cancelling…" : "Cancel Free Trial"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmCancelPaid} onOpenChange={(o) => { if (!busy) setConfirmCancelPaid(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Cancelling stops all future charges at Razorpay and ends clinic access immediately{state?.current?.nextBilling ? ` (your next charge would have been on ${fmtDate(state.current.nextBilling)})` : ""}. Payments already made aren't refunded automatically. You can choose a plan again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "cancel"}>Keep subscription</AlertDialogCancel>
            <AlertDialogAction disabled={busy === "cancel"} onClick={(e) => { e.preventDefault(); void runCancelPaid(); }}>{busy === "cancel" ? "Cancelling…" : "Cancel Subscription"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
