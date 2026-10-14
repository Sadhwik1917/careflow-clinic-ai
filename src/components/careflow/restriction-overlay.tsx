import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSignOut } from "@/lib/auth";
import type { ClinicRestriction } from "@/lib/clinic-restriction";

/** Blurs and disables the whole clinic app (inert = no clicks, focus or keyboard) behind a non-dismissible notice. */
export function RestrictionGate({ restriction, canSwitch, children }: { restriction: NonNullable<ClinicRestriction>; canSwitch: boolean; children: ReactNode }) {
  const signOut = useSignOut();
  const primary = useRef<HTMLAnchorElement>(null);
  useEffect(() => { primary.current?.focus(); }, []);
  const title = restriction.kind === "SUSPENDED" ? "Your clinic has been suspended" : "Your clinic approval has been revoked";
  return <>
    <div inert aria-hidden="true" className="pointer-events-none select-none blur-md">{children}</div>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="restriction-title" aria-describedby="restriction-desc" className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-6 shrink-0 text-destructive" />
          <div className="min-w-0">
            <h2 id="restriction-title" className="text-lg font-semibold">{title}</h2>
            <p id="restriction-desc" className="mt-1 text-sm text-muted-foreground">Your clinic's access has been restricted by the platform administrator.</p>
          </div>
        </div>
        <div className="mt-5 rounded-md border bg-muted/50 p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Reason provided by the administrator</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{restriction.reason ?? "No reason was recorded."}</p>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Re-verifying sends your clinic for review. Access returns only after the administrator approves it{restriction.kind === "SUSPENDED" ? " and lifts the suspension" : ""}.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild><Link ref={primary} to="/clinic/verification">Re-verify Clinic</Link></Button>
          {canSwitch && <Button variant="outline" asChild><Link to="/workspace">Switch clinic</Link></Button>}
          <Button variant="ghost" onClick={() => void signOut()}><LogOut />Sign out</Button>
        </div>
      </div>
    </div>
  </>;
}
