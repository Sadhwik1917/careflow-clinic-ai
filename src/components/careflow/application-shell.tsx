import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Building2, ChevronRight, ShieldCheck, X } from "lucide-react";
import { CareflowBrand } from "./brand";
import { navigation, roleForPath, roleLabels, type AppRole } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

function WorkspaceSidebar({ role, pathname }: { role: AppRole; pathname: string }) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const items = navigation[role];
  return <Sidebar collapsible="icon" className="border-sidebar-border">
    <SidebarHeader className="gap-6 px-4 py-6 group-data-[collapsible=icon]:px-1.5">
      <div className="flex items-center justify-between"><CareflowBrand compact={state === "collapsed" && !isMobile} />{isMobile && <Button size="icon" variant="ghost" aria-label="Close navigation" onClick={() => setOpenMobile(false)}><X /></Button>}</div>
      <div className="flex items-center gap-3 rounded-md border border-sidebar-border px-3 py-3 group-data-[collapsible=icon]:hidden"><Building2 className="size-5 shrink-0 text-primary" /><div><p className="text-sm font-medium">{role === "PLATFORM_ADMIN" ? "Platform workspace" : role === "PATIENT" ? "Patient portal" : "Clinic workspace"}</p><p className="mt-0.5 text-xs text-muted-foreground">{roleLabels[role]} preview</p></div></div>
    </SidebarHeader>
    <SidebarContent className="gap-3 px-2 group-data-[collapsible=icon]:px-0">
      {(["Workspace", "Management", "Account"] as const).map(group => {
        const groupItems = items.filter(item => item.group === group);
        if (!groupItems.length) return null;
        return <SidebarGroup key={group}><SidebarGroupLabel className="mb-2 text-[11px] font-semibold uppercase">{group}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu className="gap-1.5">{groupItems.map(item => {
          const active = pathname === item.path || (pathname === "/" && item.path === "/clinic/dashboard") || pathname.startsWith(`${item.path}/`);
          return <SidebarMenuItem key={item.path}><SidebarMenuButton asChild isActive={active} tooltip={item.title} className="h-10 gap-3 px-3"><Link to={item.path} aria-current={active ? "page" : undefined} onClick={() => setOpenMobile(false)}><item.icon strokeWidth={1.7} /><span>{item.title}</span></Link></SidebarMenuButton></SidebarMenuItem>;
        })}</SidebarMenu></SidebarGroupContent></SidebarGroup>;
      })}
    </SidebarContent>
    <SidebarFooter className="border-t border-sidebar-border px-5 py-5 group-data-[collapsible=icon]:px-3"><div className="flex items-center gap-2 text-muted-foreground"><ShieldCheck className="size-4 shrink-0" /><span className="text-xs group-data-[collapsible=icon]:hidden">Care, thoughtfully connected.</span></div></SidebarFooter>
  </Sidebar>;
}

export function ApplicationShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const role = roleForPath(pathname);
  const navigate = useNavigate();
  const currentPage = navigation[role].find(item => pathname === item.path || pathname.startsWith(`${item.path}/`))?.title ?? "Dashboard";
  return <SidebarProvider><a href="#main-content" className="sr-only z-50 rounded-md bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a><WorkspaceSidebar role={role} pathname={pathname} /><div className="flex min-w-0 flex-1 flex-col">
    <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 md:px-8">
      <div className="flex items-center gap-3"><SidebarTrigger className="size-10 text-muted-foreground" title="Toggle navigation" /><div className="hidden items-center gap-2 text-sm sm:flex"><span className="text-muted-foreground">{role === "PLATFORM_ADMIN" ? "Platform" : role === "PATIENT" ? "Patient portal" : "Workspace"}</span><ChevronRight className="size-3 text-muted-foreground" /><span className="font-medium">{currentPage}</span></div><CareflowBrand className="sm:hidden" compact /></div>
      <div className="flex items-center gap-3"><span className="hidden rounded-md bg-warning px-2 py-1 text-[11px] font-medium text-warning-foreground lg:inline-flex">Design preview</span><Select value={role} onValueChange={value => { const selected = value as AppRole; const first = navigation[selected][0]; if (first) void navigate({ to: first.path }); }}><SelectTrigger aria-label="Preview role" className="w-44 bg-card shadow-none"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(roleLabels) as AppRole[]).map(key => <SelectItem key={key} value={key}>{roleLabels[key]}</SelectItem>)}</SelectContent></Select></div>
    </header>
    <main id="main-content" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-7 md:px-8 md:py-9" tabIndex={-1}>{children}</main>
    <footer className="flex flex-wrap justify-between gap-2 border-t px-4 py-4 text-[11px] text-muted-foreground md:px-8"><span>© CAREFLOW AI</span><span>Phase 1A · Design preview · No live clinic data</span></footer>
  </div></SidebarProvider>;
}