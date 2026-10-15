import type { ReactNode } from "react";
import { AlertCircle, Inbox, LoaderCircle, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <div role="status" aria-live="polite" className="space-y-5 py-8"><div className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />{label}</div><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div>;
}

export function EmptyState({ title, description, icon: Icon = Inbox, action, className }: { title: string; description?: string; icon?: LucideIcon; action?: ReactNode; className?: string }) {
  return <div className={cn("flex min-h-64 flex-col items-center justify-center px-5 py-10 text-center", className)}><div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon aria-hidden="true" className="size-6" strokeWidth={1.5} /></div><h3 className="text-sm font-semibold">{title}</h3>{description && <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{description}</p>}{action && <div className="mt-5">{action}</div>}</div>;
}

export function ErrorState({ title = "Something went wrong", description = "Please try again.", onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return <div role="alert" className="flex min-h-48 flex-col items-center justify-center gap-3 px-5 py-10 text-center"><div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"><AlertCircle aria-hidden="true" className="size-6" /></div><h3 className="text-sm font-semibold">{title}</h3><p className="max-w-sm text-sm text-muted-foreground">{description}</p>{onRetry && <Button variant="outline" onClick={onRetry}>Try again</Button>}</div>;
}

export type StatusTone = "success" | "warning" | "info" | "neutral" | "danger";
const statusStyles: Record<StatusTone, string> = {
  success: "bg-success text-success-foreground", warning: "bg-warning text-warning-foreground",
  info: "bg-info text-info-foreground", neutral: "bg-muted text-muted-foreground", danger: "bg-destructive/10 text-destructive",
};
export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: StatusTone }) {
  return <Badge variant="outline" className={cn("gap-1.5 whitespace-nowrap border-transparent font-medium shadow-none ring-1 ring-inset ring-current/15", statusStyles[tone])}><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{children}</Badge>;
}