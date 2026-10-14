// Adapted from Kokonut UI Smooth Tab (MIT, Dorian Baffier).
// Source: https://github.com/kokonut-labs/kokonutui/blob/main/components/kokonutui/smooth-tab.tsx
// Reuse the moving indicator concept only; Radix retains accessible tabs instead of custom swipe/keyboard logic.
import { useId } from "react";
import { motion, LayoutGroup, useReducedMotion } from "motion/react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SmoothTabs({ value, items, label }: { value: string; items: { value: string; label: string }[]; label: string }) {
  const id = useId();
  const reduced = useReducedMotion();
  return <LayoutGroup id={id}><TabsList aria-label={label} className="mb-4">
    {items.map(item => <TabsTrigger key={item.value} value={item.value} className="relative isolate data-[state=active]:bg-transparent data-[state=active]:shadow-none">
      {value === item.value && <motion.span aria-hidden="true" {...(reduced ? {} : { layoutId: "active-tab" })} transition={{ duration: reduced ? 0 : 0.16 }} className="absolute inset-0 -z-10 rounded-md bg-background shadow-sm" />}
      {item.label}
    </TabsTrigger>)}
  </TabsList></LayoutGroup>;
}