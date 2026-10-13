import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/** Renders "CAREFLOW AI" and, when a clinic is selected, "× [Clinic Display Name]". */
export function CareflowBrand({ compact = false, clinicName, ownerProfileLink = false, className }: { compact?: boolean; clinicName?: string | null | undefined; ownerProfileLink?: boolean; className?: string }) {
  const displayName = clinicName?.trim();
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        aria-hidden="true"
      >
        <Activity className="size-6" strokeWidth={2.2} />
      {/* </span>
      {!compact && (
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="whitespace-nowrap text-xl font-bold">
            CAREFLOW<span className="ml-1 text-xs font-semibold text-primary">AI</span>
         </span> */}
          {displayName ? <>
            <span aria-label="for" className="shrink-0 text-lg font-medium text-muted-foreground">×</span>
            <span className="min-w-0 max-w-full flex-1 truncate text-base font-semibold" title={displayName}>{displayName}</span>
          </> : ownerProfileLink && <Button asChild variant="link" size="sm" className="h-auto max-w-full whitespace-normal p-0 text-left"><Link to="/clinic/dashboard">Complete Clinic Profile</Link></Button>}
        </span>
      )}
    </div>
  );
}
