import { Outlet, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { ApplicationShell } from "./application-shell";
import { ErrorState, LoadingState } from "./feedback";
import type { AccessMembership, UserAccess } from "@/lib/access";
import type { AppRole } from "@/lib/navigation";

export function AreaLayout({ role, access, membership }: { role: AppRole; access: UserAccess; membership: AccessMembership | null }) {
  return <ApplicationShell role={role} access={access} membership={membership}><Outlet /></ApplicationShell>;
}

export function AreaPending() {
  return <div className="mx-auto max-w-md px-4 pt-24"><LoadingState label="Checking your access…" /></div>;
}

export function AreaError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return <div className="mx-auto max-w-md px-4 pt-24"><ErrorState title="We couldn't verify your access" description={error instanceof Error ? error.message : "Please try again."} onRetry={() => { void router.invalidate(); reset(); }} /></div>;
}
