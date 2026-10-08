import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatisticsCard({ label, value, detail, icon: Icon }: { label: string; value: string | number | null; detail?: string; icon: LucideIcon }) {
  return <Card className="rounded-lg shadow-none"><CardContent className="p-5"><div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{label}</span><Icon aria-hidden="true" className="size-5 text-primary" strokeWidth={1.6} /></div><p aria-label={value === null ? `${label}: not connected` : `${label}: ${value}`} className="mt-5 text-3xl font-semibold tabular-nums">{value ?? "—"}</p>{detail && <p className="mt-2 text-xs text-muted-foreground">{detail}</p>}</CardContent></Card>;
}