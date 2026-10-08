import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export function CareflowBrand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-hidden="true"><Activity className="size-6" strokeWidth={2.2} /></span>
      {!compact && <span className="whitespace-nowrap text-xl font-bold">careflow<span className="ml-1 text-xs font-semibold text-primary">AI</span></span>}
    </div>
  );
}