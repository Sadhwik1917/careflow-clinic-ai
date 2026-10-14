import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Circular fill gauge adapted from the Kokonut UI "Liquid Gauge" idea (MIT, see kokonut-LICENSE.txt),
 * rebuilt with SVG + Motion and semantic tokens. Wave motion is disabled for reduced-motion users.
 * Only render it with a known, displayable limit — never for plans whose limit is hidden.
 */
export function LiquidGauge({ value, label, size = 96, tone = "primary", className }: { value: number; label: string; size?: number; tone?: "primary" | "destructive"; className?: string }) {
  const reduced = useReducedMotion();
  const id = useId().replace(/:/g, "");
  const pct = Math.max(0, Math.min(100, value));
  const level = 100 - pct; // y of the liquid surface in a 0–100 viewBox
  const wave = "M0 0 Q12.5 -4 25 0 T50 0 T75 0 T100 0 T125 0 T150 0 T175 0 T200 0 V120 H0 Z";
  const fill = tone === "destructive" ? "var(--destructive)" : "var(--primary)";
  return <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
    <svg viewBox="0 0 100 100" className="size-full" aria-hidden="true">
      <defs><clipPath id={`g${id}`}><circle cx="50" cy="50" r="46" /></clipPath></defs>
      <circle cx="50" cy="50" r="48" fill="var(--accent)" stroke="var(--border)" strokeWidth="1.5" />
      <g clipPath={`url(#g${id})`}>
        <motion.g initial={reduced ? false : { y: 100 }} animate={{ y: level }} transition={{ duration: reduced ? 0 : 0.9, ease: "easeOut" }}>
          <motion.path d={wave} fill={fill} opacity={0.85}
            animate={reduced ? { x: 0 } : { x: [0, -50] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} />
        </motion.g>
      </g>
    </svg>
    <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums text-foreground [text-shadow:0_0_6px_var(--background)]">{Math.round(pct)}%</span>
  </div>;
}
