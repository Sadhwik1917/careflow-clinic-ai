import { Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { EmptyState, StatusBadge } from "./feedback";
import { statusLabel, statusTone } from "@/lib/verification";
import { subscriptionLabel, type AdminClinic } from "@/lib/admin-data";

export function AdminClinicRows({ rows, emptyTitle = "No clinics yet", emptyDescription = "Clinics appear here once owners create them." }: { rows: AdminClinic[]; emptyTitle?: string; emptyDescription?: string }) {
  if (rows.length === 0) return <EmptyState icon={Building2} title={emptyTitle} description={emptyDescription} />;
  return <ul className="divide-y">{rows.map(c => <li key={c.id}>
    <Link to="/admin/verifications/$clinicId" params={{ clinicId: c.id }} aria-label={`View details for ${c.display_name}`} className="grid gap-2 px-5 py-4 hover:bg-muted/50 sm:grid-cols-[1.6fr_1fr_auto] sm:items-center">
      <span className="min-w-0"><span className="block truncate font-medium">{c.display_name} <span className="text-muted-foreground">· {c.clinic_code}</span></span>
        <span className="block truncate text-xs text-muted-foreground">{c.name} · {[c.city, c.state].filter(Boolean).join(", ") || "No location"} · Created {new Date(c.created_at).toLocaleDateString()}</span></span>
      <span className="text-sm text-muted-foreground">{c.subscription ? `${c.subscription.plan ?? "Plan"} · ${subscriptionLabel[c.subscription.status]}` : "No subscription"}</span>
      {c.verification ? <StatusBadge tone={statusTone[c.verification]}>{statusLabel[c.verification]}</StatusBadge> : <StatusBadge>Not submitted</StatusBadge>}
    </Link></li>)}</ul>;
}

export function ClinicListHeader() {
  return <div className="hidden items-center gap-3 border-b bg-muted/50 px-5 py-3 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1.6fr_1fr_auto]"><span>Clinic</span><span>Subscription</span><span>Status</span></div>;
}
