import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { PageTitle } from "@/components/careflow/page-title";
import { EmptyState, StatusBadge } from "@/components/careflow/feedback";
import { FormAlert } from "@/components/careflow/auth-ui";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { pageMetadata } from "@/lib/navigation";
import { canViewPlans, statusLabel } from "@/lib/verification";

const plansQuery = (clinicId: string) => queryOptions({
  queryKey: ["plans", clinicId],
  queryFn: async () => {
    const ver = await supabase.from("clinic_verifications").select("status").eq("clinic_id", clinicId).maybeSingle();
    if (ver.error) throw new Error("We couldn't load your verification status.");
    const status = ver.data?.status ?? null;
    if (!canViewPlans(status)) return { status, plans: [] };
    const plans = await supabase.from("plans").select("id, name, description, price, currency, billing_cycle, trial_enabled, trial_duration_days, max_doctors, max_staff").eq("is_active", true).order("price");
    if (plans.error) throw new Error("We couldn't load plans.");
    return { status, plans: plans.data ?? [] };
  },
});

export const Route = createFileRoute("/_authenticated/clinic/plans")({
  head: () => pageMetadata("Plans", "OWNER"),
  component: Page,
});

function Page() {
  const { membership } = Route.useRouteContext();
  const { data } = useSuspenseQuery(plansQuery(membership?.clinic_id ?? ""));
  return <>
    <PageTitle title="Plans" description="Choose a plan once your clinic is approved." />
    <div className="space-y-6 border-t px-4 py-6 md:px-6">
      {!canViewPlans(data.status) ? <div className="rounded-lg border bg-card"><EmptyState icon={CreditCard} title="Plans unlock after approval" description={`Your verification status is ${data.status ? statusLabel[data.status].toLowerCase() : "not started"}. Plans become available once CAREFLOW approves your clinic.`} action={<Button asChild><Link to="/clinic/verification">Go to verification</Link></Button>} /></div> : <>
        <FormAlert>Online enrollment and payment aren't available yet, so plans can't be activated from here. Your clinic stays approved in the meantime.</FormAlert>
        {data.plans.length === 0 ? <div className="rounded-lg border bg-card"><EmptyState icon={CreditCard} title="No plans published yet" description="CAREFLOW hasn't published any plans yet." /></div> :
          <ul className="grid gap-4 md:grid-cols-3">{data.plans.map(p => <li key={p.id} className="rounded-lg border bg-card p-5">
            <h2 className="font-semibold">{p.name}</h2>
            {p.description && <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>}
            <p className="mt-3 text-xl font-semibold">{p.currency} {p.price} <span className="text-sm font-normal text-muted-foreground">/ {p.billing_cycle.toLowerCase()}</span></p>
            {p.trial_enabled && <p className="mt-2"><StatusBadge tone="info">{p.trial_duration_days ?? ""} day trial</StatusBadge></p>}
            <Button className="mt-4 w-full" disabled>Enrollment coming soon</Button>
          </li>)}</ul>}
      </>}
    </div>
  </>;
}
