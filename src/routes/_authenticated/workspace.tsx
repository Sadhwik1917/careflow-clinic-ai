import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowUpRight, ShieldAlert, UserRoundX } from "lucide-react";
import { AreaError, AreaPending } from "@/components/careflow/area-layout";
import { CenteredPanel } from "@/components/careflow/auth-ui";
import { EmptyState } from "@/components/careflow/feedback";
import { Button } from "@/components/ui/button";
import { accessQueryOptions, availableWorkspaces, dashboardForRole, setSelectedClinicId } from "@/lib/access";
import { useSignOut } from "@/lib/auth";
import { roleLabels, type AppRole } from "@/lib/navigation";

const roles: AppRole[] = ["PLATFORM_ADMIN", "OWNER", "DOCTOR", "STAFF", "PATIENT"];

export const Route = createFileRoute("/_authenticated/workspace")({
  validateSearch: (s: Record<string, unknown>): { denied?: AppRole | undefined } => ({ denied: roles.includes(s["denied"] as AppRole) ? (s["denied"] as AppRole) : undefined }),
  head: () => ({ meta: [{ title: "Your workspaces — CAREFLOW AI" }, { name: "description", content: "Choose a CAREFLOW AI workspace." }, { property: "og:title", content: "Your workspaces — CAREFLOW AI" }, { property: "og:description", content: "Choose a CAREFLOW AI workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  beforeLoad: async ({ context, search }) => {
    const access = await context.queryClient.ensureQueryData(accessQueryOptions(context.user.id, context.user.email ?? null));
    const list = availableWorkspaces(access);
    // Auto-enter only when exactly one verified workspace exists; never pick between several.
    if (!search.denied && list.length === 1 && list[0]) { setSelectedClinicId(list[0].clinicId); throw redirect({ to: dashboardForRole[list[0].role] }); }
  },
  pendingComponent: AreaPending,
  errorComponent: AreaError,
  component: WorkspacePicker,
});

function WorkspacePicker() {
  const { user } = Route.useRouteContext();
  const { denied } = Route.useSearch();
  const { data: access } = useSuspenseQuery(accessQueryOptions(user.id, user.email ?? null));
  const navigate = useNavigate();
  const signOut = useSignOut();
  const list = availableWorkspaces(access);
  return <CenteredPanel>
    <h1 className="text-2xl font-semibold">Your workspaces</h1>
    <p className="mt-2 text-sm text-muted-foreground">Signed in as {access.profile?.display_name || access.email}</p>
    {denied && <div role="alert" className="mt-6 flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><p>You don't have {denied === "PLATFORM_ADMIN" ? "platform administrator" : `an active ${roleLabels[denied].toLowerCase()}`} access for that area.</p></div>}
    {!access.profile && <div role="alert" className="mt-6 rounded-md border bg-warning px-4 py-3 text-sm text-warning-foreground">Your account profile could not be found. Please contact support.</div>}
    {list.length > 0 ? <ul className="mt-6 space-y-3">{list.map(w => <li key={w.key}><Button variant="outline" className="h-auto w-full justify-between gap-4 bg-card p-4 text-left shadow-none" onClick={() => { setSelectedClinicId(w.clinicId); void navigate({ to: dashboardForRole[w.role] }); }}><span><span className="block font-medium">{w.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{roleLabels[w.role]}</span></span><ArrowUpRight className="text-muted-foreground" /></Button></li>)}</ul>
      : <div className="mt-6 rounded-lg border bg-card"><EmptyState icon={UserRoundX} title="No clinic access yet" description="Your account isn't linked to an active clinic. If you were invited, ask the clinic owner to confirm your invitation, or set up your own clinic." action={<Button asChild><Link to="/setup-clinic">Set up your clinic</Link></Button>} /></div>}
    <div className="mt-8 flex flex-wrap gap-3"><Button variant="ghost" asChild><Link to="/">Home</Link></Button><Button variant="outline" onClick={() => void signOut()}>Sign out</Button></div>
  </CenteredPanel>;
}
