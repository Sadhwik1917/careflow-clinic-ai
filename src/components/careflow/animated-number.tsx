import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

/** Short count-up for real numeric values; renders the final value immediately for reduced motion. */
export function AnimatedNumber({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) { setShown(value); return; }
    const c = animate(0, value, { duration: 0.6, ease: "easeOut", onUpdate: v => setShown(Math.round(v)) });
    return () => c.stop();
  }, [value, reduced]);
  return <>{shown.toLocaleString("en-IN")}</>;
}
