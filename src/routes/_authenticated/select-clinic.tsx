import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowUpRight, Building2 } from "lucide-react";
import { AreaError, AreaPending } from "@/components/careflow/area-layout";
import { CenteredPanel } from "@/components/careflow/auth-ui";
import { Button } from "@/components/ui/button";
import { accessQueryOptions, activeMemberships, dashboardForRole, memberRoleForArea, safeRedirect, setSelectedClinicId } from "@/lib/access";
import { roleLabels, type AppRole } from "@/lib/navigation";

type ClinicRole = Exclude<AppRole, "PLATFORM_ADMIN">;
const clinicRoles: ClinicRole[] = ["OWNER", "DOCTOR", "STAFF", "PATIENT"];

export const Route = createFileRoute("/_authenticated/select-clinic")({
  validateSearch: (s: Record<string, unknown>): { role: ClinicRole; redirect?: string } => ({ role: clinicRoles.includes(s.role as ClinicRole) ? (s.role as ClinicRole) : "OWNER", redirect: safeRedirect(s.redirect) }),
  head: () => ({ meta: [{ title: "Choose a clinic — CAREFLOW AI" }, { name: "description", content: "Choose which clinic to work in." }, { property: "og:title", content: "Choose a clinic — CAREFLOW AI" }, { property: "og:description", content: "Choose which clinic to work in." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  beforeLoad: ({ context }) => context.queryClient.ensureQueryData(accessQueryOptions(context.user.id, context.user.email ?? null)).then(() => undefined),
  pendingComponent: AreaPending,
  errorComponent: AreaError,
  component: SelectClinic,
});

function SelectClinic() {
  const { user } = Route.useRouteContext();
  const { role, redirect } = Route.useSearch();
  const { data: access } = useSuspenseQuery(accessQueryOptions(user.id, user.email ?? null));
  const navigate = useNavigate();
  const options = activeMemberships(access).filter(m => m.role === memberRoleForArea[role]);
  const home = dashboardForRole[role];
  const area = home.split("/")[1];
  const target = redirect && redirect.startsWith(`/${area}/`) ? redirect : home;
  return <CenteredPanel>
    <h1 className="text-2xl font-semibold">Choose a clinic</h1>
    <p className="mt-2 text-sm text-muted-foreground">You're a {roleLabels[role].toLowerCase()} in more than one clinic. Choose where to work.</p>
    <ul className="mt-6 space-y-3">{options.map(m => <li key={m.id}><Button variant="outline" className="h-auto w-full justify-between gap-4 bg-card p-4 text-left shadow-none" onClick={() => { setSelectedClinicId(m.clinic_id); void navigate({ to: target }); }}><span className="flex items-center gap-3"><Building2 className="size-5 text-primary" /><span className="font-medium">{m.clinic?.name}</span></span><ArrowUpRight className="text-muted-foreground" /></Button></li>)}</ul>
    {options.length === 0 && <p className="mt-6 text-sm text-muted-foreground">No active clinics found for this role.</p>}
    <Button variant="ghost" asChild className="mt-6"><Link to="/workspace">All workspaces</Link></Button>
  </CenteredPanel>;
}
