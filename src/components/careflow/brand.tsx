import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

/** Renders "CAREFLOW AI" and, when a clinic is selected, "× [Clinic Display Name]". */
export function CareflowBrand({ compact = false, clinicName, className }: { compact?: boolean; clinicName?: string | null | undefined; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        aria-hidden="true"
      >
        <Activity className="size-6" strokeWidth={2.2} />
      </span>
      {!compact && (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="whitespace-nowrap text-xl font-bold">
            CAREFLOW<span className="ml-1 text-xs font-semibold text-primary">AI</span>
          </span>
          {clinicName && <>
            <span aria-label="for" className="shrink-0 text-lg font-medium text-muted-foreground">×</span>
            <span className="min-w-0 truncate text-base font-semibold" title={clinicName}>{clinicName}</span>
          </>}
        </span>
      )}
    </div>
  );
}
