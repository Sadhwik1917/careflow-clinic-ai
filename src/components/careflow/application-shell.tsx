import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Building2, ShieldCheck, X } from "lucide-react";
import { CareflowBrand } from "./brand";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import { navigation, roleLabels, type AppRole } from "@/lib/navigation";
import {
  availableWorkspaces,
  dashboardForRole,
  setSelectedClinicId,
  type AccessMembership,
  type UserAccess,
} from "@/lib/access";
import { useSignOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

/** Presentation-only label overrides keyed by path (e.g. "Upgrade Plan" once a clinic has a plan). */
export const NavTitleOverrides = createContext<Record<string, string>>({});
/** Presentation-only: paths hidden from navigation (e.g. AI assistant on a plan without AI). The database still enforces access. */
export const NavHiddenPaths = createContext<string[]>([]);
function useNavItems(role: AppRole) {
  const o = useContext(NavTitleOverrides);
  const hidden = useContext(NavHiddenPaths);
  return navigation[role]
    .filter((i) => !hidden.includes(i.path))
    .map((i) => {
      const title = o[i.path];
      return title ? { ...i, title } : i;
    });
}

function WorkspaceSidebar({
  role,
  pathname,
  contextLabel,
  clinicName,
}: {
  role: AppRole;
  pathname: string;
  contextLabel: string;
  clinicName: string | null;
}) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const items = useNavItems(role);
  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="gap-6 px-4 py-6 group-data-[collapsible=icon]:px-1.5">
        <div className="flex items-center justify-between">
          <CareflowBrand compact={state === "collapsed" && !isMobile} />
          {isMobile && (
            <Button size="icon" variant="ghost" aria-label="Close navigation" onClick={() => setOpenMobile(false)}>
              <X />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3 rounded-md border border-sidebar-border px-3 py-3 group-data-[collapsible=icon]:hidden">
          <Building2 className="size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{contextLabel}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{roleLabels[role]}</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-3 px-2 group-data-[collapsible=icon]:px-0">
        {(["Workspace", "Management", "Account"] as const).map((group) => {
          const groupItems = items.filter((item) => item.group === group);
          if (!groupItems.length) return null;
          return (
            <SidebarGroup key={group}>
              <SidebarGroupLabel className="mb-2 text-[11px] font-semibold uppercase">{group}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1.5">
                  {groupItems.map((item) => {
                    const active = pathname === item.path || pathname.startsWith(`${item.path}/`);
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.title} className="h-10 gap-3 px-3">
                          <Link
                            to={item.path}
                            aria-current={active ? "page" : undefined}
                            onClick={() => setOpenMobile(false)}
                          >
                            <item.icon strokeWidth={1.7} />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border px-5 py-5 group-data-[collapsible=icon]:px-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" />
          <span className="text-xs group-data-[collapsible=icon]:hidden">Care, thoughtfully connected.</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function ApplicationShell({
  role,
  access,
  membership,
  children,
}: {
  role: AppRole;
  access: UserAccess;
  membership: AccessMembership | null;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const navItems = useNavItems(role);
  const signOut = useSignOut();
  const workspaces = availableWorkspaces(access);
  const clinicName = role === "PLATFORM_ADMIN" ? null : membership?.clinic?.display_name?.trim() || null;
  const ownerProfileLink = role === "OWNER" && membership?.role === "OWNER";
  const currentKey = role === "PLATFORM_ADMIN" ? "admin" : (membership?.id ?? "");
  const contextLabel =
    role === "PLATFORM_ADMIN"
      ? "Platform administration"
      : membership?.clinic?.display_name || membership?.clinic?.name || "Clinic";
  const currentPage =
    navItems.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))?.title ?? "Dashboard";
  const name = access.profile?.display_name || access.email || "Signed in";
  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <WorkspaceSidebar role={role} pathname={pathname} contextLabel={contextLabel} clinicName={clinicName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 md:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <SidebarTrigger className="size-10 shrink-0 text-muted-foreground" title="Toggle navigation" />
            <div className="min-w-0 flex-1">
              {role === "PLATFORM_ADMIN" ? (
                <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-base">
                  <span className="text-muted-foreground">Admin</span>
                  <span aria-hidden="true" className="text-muted-foreground">
                    /
                  </span>
                  <span className="truncate font-semibold" title={currentPage}>
                    {currentPage}
                  </span>
                </nav>
              ) : (
                <>
                  <CareflowBrand className="min-w-0" clinicName={clinicName} ownerProfileLink={ownerProfileLink} />
                  <p className="mt-1 hidden text-xs text-muted-foreground sm:block">{currentPage}</p>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {workspaces.length > 1 && (
              <Select
                value={currentKey}
                onValueChange={(key) => {
                  const w = workspaces.find((x) => x.key === key);
                  if (!w) return;
                  setSelectedClinicId(w.clinicId);
                  void navigate({ to: dashboardForRole[w.role] });
                }}
              >
                <SelectTrigger aria-label="Switch workspace" className="w-52 bg-card shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((w) => (
                    <SelectItem key={w.key} value={w.key}>
                      {w.label} · {roleLabels[w.role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <NotificationBell userId={access.userId} role={role} />
            <UserMenu name={name} email={access.email ?? null} onSignOut={() => void signOut()} />
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-7 md:px-8 md:py-9"
          tabIndex={-1}
        >
          {children}
        </main>
        <footer className="flex flex-wrap justify-between gap-2 border-t px-4 py-4 text-[11px] text-muted-foreground md:px-8">
          <span>© CAREFLOW AI</span>
        </footer>
      </div>
    </SidebarProvider>
  );
}
