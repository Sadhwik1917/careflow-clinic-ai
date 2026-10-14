import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
  if (q.isPending) return <LoadingState label="Loading AI usage…" />;
  if (q.isError) return <ErrorState title="Couldn't load AI usage" onRetry={() => void q.refetch()} />;
  const u = q.data;
  if (!u.included) return null;
  const state = usageState(u);
  const left = remaining(u);
  return <Card className="rounded-lg shadow-none"><CardContent className="space-y-3 p-5">
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm font-medium"><Sparkles aria-hidden="true" className="size-4 text-primary" />AI credits this month</span>
      {state === "LIMIT_REACHED" ? <StatusBadge tone="danger">Limit reached</StatusBadge> : u.creditType === "UNLIMITED" ? <StatusBadge tone="success">Unlimited</StatusBadge> : <StatusBadge tone="success">Available</StatusBadge>}
    </div>
    {u.creditType === "UNLIMITED"
      ? <p className="text-2xl font-semibold">Unlimited</p>
      : <>
        <div className="flex items-center gap-5">
          {u.limit != null && u.limit > 0 && <LiquidGauge value={(u.used / u.limit) * 100} label="AI credits used" size={84} tone={state === "LIMIT_REACHED" ? "destructive" : "primary"} />}
          <p className="text-2xl font-semibold tabular-nums">{u.used}{u.limit != null && <span className="text-base font-normal text-muted-foreground"> / {u.limit}</span>}</p>
        </div>
      </>}
    <p className="text-xs text-muted-foreground">
      {left != null && u.creditType === "LIMITED" && `${left} remaining · `}Resets on {fmt(u.periodEnd)}{u.shared && " · shared by all clinics on your plan"}
    </p>
    {state === "LIMIT_REACHED" && <p className="text-sm text-destructive">You've used this month's AI credits. AI requests are paused until the reset date, or upgrade your plan.</p>}
    {state === "THROTTLED" && <p className="text-sm text-muted-foreground">Response may delay due to over credit usage.</p>}
  </CardContent></Card>;
}
