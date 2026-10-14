import { useQuery } from "@tanstack/react-query";
import { aiUsageQuery } from "@/components/careflow/ai-usage-card";
import { usageState } from "@/lib/ai-credits";

/** Platform-admin only: shows the internal monthly threshold, which the database withholds from clinic members. */
export function AdminAiUsage({ clinicId }: { clinicId: string }) {
  const q = useQuery(aiUsageQuery(clinicId));
  let body: React.ReactNode;
  if (q.isPending) body = "Loading…";
  else if (q.isError) body = "AI usage couldn't load.";
  else if (!q.data.included) body = "No active AI plan.";
  else {
    const u = q.data;
    const state = usageState(u);
    body = <>
      <span className="font-medium">{u.creditType === "UNLIMITED" ? "Unlimited (shown to clinic)" : "Limited"}</span>
      {" · "}{u.used}{u.limit != null ? ` / ${u.limit}` : ""} credits used this period
      {u.creditType === "UNLIMITED" && u.limit != null && <> · internal threshold {u.limit}/month, then slower responses</>}
      {state !== "OK" && <span className="text-destructive"> · {state === "THROTTLED" ? "throttled" : "limit reached"}</span>}
      <span className="block text-xs text-muted-foreground">Resets {new Date(u.periodEnd).toLocaleDateString()}{u.shared ? " · shared across clinics" : ""}</span>
    </>;
  }
  return <section className="rounded-lg border bg-card p-5">
    <h2 className="text-base font-semibold">AI credit monitoring</h2>
    <p className="mt-1 text-xs text-muted-foreground">Visible to platform admins only.</p>
    <div className="mt-3 text-sm">{body}</div>
  </section>;
}
