import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedNumber } from "./animated-number";

export function StatisticsCard({ label, value, detail, icon: Icon }: { label: string; value: string | number | null; detail?: string; icon: LucideIcon }) {
  return <Card className="rounded-lg shadow-none transition-colors hover:border-primary/30"><CardContent className="p-5">
    <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{label}</span><span className="flex size-9 items-center justify-center rounded-md bg-accent text-primary"><Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.7} /></span></div>
    <p aria-label={value === null ? `${label}: not connected` : `${label}: ${value}`} className="mt-4 text-3xl font-semibold tabular-nums">{value === null ? "—" : typeof value === "number" ? <AnimatedNumber value={value} /> : value}</p>
    {detail && <p className="mt-2 text-xs text-muted-foreground">{detail}</p>}
  </CardContent></Card>;
}
