import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiquidGauge } from "@/components/careflow/liquid-gauge";
import { ErrorState, LoadingState, StatusBadge } from "@/components/careflow/feedback";
import { supabase } from "@/integrations/supabase/client";
import { parseAiUsage, remaining, usageState } from "@/lib/ai-credits";

export const aiUsageQuery = (clinicId: string) => ({
  queryKey: ["plan-state", clinicId, "ai-usage"],
  queryFn: async () => {
    const { data, error } = await (supabase.rpc as unknown as (f: string, a: object) => Promise<{ data: unknown; error: unknown }>)("clinic_ai_usage", { p_clinic: clinicId });
    if (error) throw new Error("usage");
    return parseAiUsage(data);
  },
  enabled: !!clinicId,
  staleTime: 15_000,
});

const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function AiUsageCard({ clinicId }: { clinicId: string }) {
  const q = useQuery(aiUsageQuery(clinicId));

  if (q.isPending) {
    return (
      <section aria-label="AI Credits & Usage" className="rounded-lg border bg-card p-5">
        <LoadingState label="Loading AI credit usage…" />
      </section>
    );
  }

  if (q.isError) {
    return (
      <section aria-label="AI Credits & Usage" className="rounded-lg border bg-card p-5">
        <ErrorState title="Couldn't load AI usage" onRetry={() => void q.refetch()} />
      </section>
    );
  }

  const u = q.data;

  if (!u.included) {
    return (
      <section aria-label="AI Credits & Usage" className="rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles aria-hidden="true" className="size-5 text-primary" />
            <h2 className="text-base font-semibold">AI Credits & Usage</h2>
          </div>
          <StatusBadge tone="neutral">Not included</StatusBadge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          AI assistant features and credit allocations are not included in your current plan.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-4">
          <p className="text-sm text-muted-foreground">
            Upgrade to a plan with AI to enable smart clinical summaries and AI assistant credits.
          </p>
          <Button asChild size="sm">
            <Link to="/clinic/plans">View plans</Link>
          </Button>
        </div>
      </section>
    );
  }

  const state = usageState(u);
  const left = remaining(u);

  return (
    <section aria-label="AI Credits & Usage" className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden="true" className="size-5 text-primary" />
          <h2 className="text-base font-semibold">AI Credits & Usage</h2>
        </div>
        {state === "LIMIT_REACHED" ? (
          <StatusBadge tone="danger">Limit reached</StatusBadge>
        ) : u.creditType === "UNLIMITED" ? (
          <StatusBadge tone="success">Unlimited</StatusBadge>
        ) : (
          <StatusBadge tone="success">Available</StatusBadge>
        )}
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        Track your monthly AI credit allocation, consumption, and renewal dates.
      </p>

      {u.creditType === "UNLIMITED" ? (
        <div className="mt-4 space-y-2">
          <p className="text-2xl font-semibold">Unlimited</p>
          <p className="text-xs text-muted-foreground">
            Resets on {fmt(u.periodEnd)}{u.shared && " · shared by all clinics on your plan"}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-5">
            {u.limit != null && u.limit > 0 && (
              <LiquidGauge
                value={(u.used / u.limit) * 100}
                label="AI credits used"
                size={84}
                tone={state === "LIMIT_REACHED" ? "destructive" : "primary"}
              />
            )}
            <div>
              <p className="text-2xl font-semibold tabular-nums">
                {u.used}
                {u.limit != null && (
                  <span className="text-base font-normal text-muted-foreground"> / {u.limit}</span>
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {left != null && u.creditType === "LIMITED" && `${left} remaining · `}
                Resets on {fmt(u.periodEnd)}
                {u.shared && " · shared by all clinics on your plan"}
              </p>
            </div>
          </div>
        </div>
      )}

      {state === "LIMIT_REACHED" && (
        <p className="mt-3 text-sm text-destructive">
          You've used this month's AI credits. AI requests are paused until the reset date, or upgrade your plan.
        </p>
      )}
      {state === "THROTTLED" && (
        <p className="mt-3 text-sm text-muted-foreground">
          Response may delay due to over credit usage.
        </p>
      )}
    </section>
  );
}

export { AiUsageCard as ClinicAiCreditsSettings };
