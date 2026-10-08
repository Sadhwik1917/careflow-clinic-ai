import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { PageTitle } from "@/components/careflow/page-title";
import { StatusBadge } from "@/components/careflow/feedback";
import { FormAlert } from "@/components/careflow/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { pageMetadata } from "@/lib/navigation";
import { BUCKET, clinicTypes, statusLabel, statusTone, verificationErrorMessage, type VerificationStatus } from "@/lib/verification";

const detailQuery = (clinicId: string) => queryOptions({
  queryKey: ["admin-verification", clinicId],
  queryFn: async () => {
    const [clinic, ver, docs, events] = await Promise.all([
      supabase.from("clinics").select("name, display_name, clinic_code, clinic_type, phone, email, address, city, state, postal_code, latitude, longitude, registration_number, representative_name, representative_phone").eq("id", clinicId).single(),
      supabase.from("clinic_verifications").select("status, cycle, submitted_at, decided_at, decision_reason").eq("clinic_id", clinicId).maybeSingle(),
      supabase.from("clinic_documents").select("id, storage_path, file_name, size_bytes, review_status, review_note, requirement:document_requirements(label, is_required)").eq("clinic_id", clinicId),
      supabase.from("verification_events").select("id, cycle, event_type, reason, created_at, actor:profiles(display_name)").eq("clinic_id", clinicId).order("created_at", { ascending: false }),
    ]);
    const err = clinic.error ?? ver.error ?? docs.error ?? events.error;
    if (err) throw new Error("We couldn't load this application.");
    return { clinic: clinic.data, verification: ver.data, docs: docs.data ?? [], events: events.data ?? [] };
  },
});

export const Route = createFileRoute("/_authenticated/admin/verifications/$clinicId")({
  head: () => pageMetadata("Verification review", "PLATFORM_ADMIN"),
  component: Page,
});

function Page() {
  const { clinicId } = Route.useParams();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(detailQuery(clinicId));
  const status = data.verification?.status ?? null;
  const pending = status === "PENDING_REVIEW";
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<VerificationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["admin-verification", clinicId] }), qc.invalidateQueries({ queryKey: ["admin-verifications"] })]);
  const c = data.clinic;

  async function view(path: string) {
    const { data: s, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error || !s) { setMsg({ ok: false, text: "Couldn't open this document." }); return; }
    window.open(s.signedUrl, "_blank", "noopener");
  }
  async function reviewDoc(id: string, s: "ACCEPTED" | "NEEDS_REPLACEMENT") {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("review_clinic_document", { p_document: id, p_status: s, p_note: notes[id] ?? "" });
    setBusy(false); setMsg(error ? { ok: false, text: verificationErrorMessage(error.message) } : { ok: true, text: "Document updated." });
    await refresh();
  }
  async function decide(d: VerificationStatus) {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("review_clinic_verification", { p_clinic: clinicId, p_decision: d, p_reason: reason });
    setBusy(false); setConfirm(null);
    setMsg(error ? { ok: false, text: verificationErrorMessage(error.message) } : { ok: true, text: `Decision recorded: ${statusLabel[d]}.` });
    if (!error) setReason("");
    await refresh();
  }

  const rows: [string, string | number | null][] = [["Registered name", c.name], ["Clinic code", c.clinic_code], ["Type", clinicTypes.find(t => t.value === c.clinic_type)?.label ?? c.clinic_type], ["Registration no.", c.registration_number], ["Address", c.address], ["City / State", [c.city, c.state].filter(Boolean).join(", ")], ["Postal code", c.postal_code], ["Coordinates", c.latitude != null && c.longitude != null ? `${c.latitude}, ${c.longitude}` : null], ["Representative", c.representative_name], ["Representative phone", c.representative_phone], ["Clinic phone", c.phone], ["Clinic email", c.email]];

  return <>
    <PageTitle title={c.display_name} description="Clinic application" actions={<StatusBadge tone={status ? statusTone[status] : "neutral"}>{status ? statusLabel[status] : "No record"}</StatusBadge>} />
    <div className="space-y-6 border-t px-4 py-6 md:px-6">
      <Button variant="ghost" size="sm" asChild><Link to="/admin/verifications"><ArrowLeft />All applications</Link></Button>
      {msg && <FormAlert tone={msg.ok ? "success" : "error"}>{msg.text}</FormAlert>}
      {!pending && <FormAlert tone="success">This application isn't pending review, so no decision can be made right now.</FormAlert>}

      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-base font-semibold">Clinic information</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">{rows.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-40 shrink-0 text-muted-foreground">{k}</dt><dd>{v || "—"}</dd></div>)}</dl>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-base font-semibold">Documents</h2>
        {data.docs.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No documents uploaded.</p> :
          <ul className="mt-3 divide-y">{data.docs.map(d => <li key={d.id} className="space-y-2 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm"><span className="font-medium">{d.requirement?.label}</span> {d.requirement?.is_required ? "(required)" : "(optional)"} · {d.file_name}</p>
              <div className="flex items-center gap-2"><StatusBadge tone={d.review_status === "ACCEPTED" ? "success" : d.review_status === "NEEDS_REPLACEMENT" ? "danger" : "neutral"}>{d.review_status.replace("_", " ").toLowerCase()}</StatusBadge><Button size="sm" variant="outline" onClick={() => void view(d.storage_path)}>View</Button></div>
            </div>
            {d.review_note && <p className="text-sm text-muted-foreground">Note: {d.review_note}</p>}
            {pending && <div className="flex flex-wrap gap-2">
              <Input aria-label="Document note" placeholder="Note (required to flag)" value={notes[d.id] ?? ""} onChange={e => setNotes(s => ({ ...s, [d.id]: e.target.value }))} className="max-w-sm" />
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void reviewDoc(d.id, "ACCEPTED")}>Accept</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void reviewDoc(d.id, "NEEDS_REPLACEMENT")}>Needs replacement</Button>
            </div>}
          </li>)}</ul>}
      </section>

      {pending && <section className="rounded-lg border bg-card p-5">
        <h2 className="text-base font-semibold">Decision</h2>
        <Textarea aria-label="Reason" placeholder="Reason (required to request changes or reject)" value={reason} onChange={e => setReason(e.target.value)} className="mt-3" maxLength={1000} />
        {!confirm ? <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => setConfirm("APPROVED")}>Approve</Button>
          <Button variant="outline" disabled={busy || !reason.trim()} onClick={() => setConfirm("CHANGES_REQUESTED")}>Request changes</Button>
          <Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => setConfirm("REJECTED")}>Reject</Button>
        </div> : <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm">Confirm: <strong>{statusLabel[confirm]}</strong>?</span>
          <Button disabled={busy} onClick={() => void decide(confirm)}>{busy && <Loader2 className="animate-spin" />}Confirm</Button>
          <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
        </div>}
      </section>}

      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-base font-semibold">Review history</h2>
        {data.events.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No history yet.</p> :
          <ul className="mt-3 space-y-2 text-sm">{data.events.map(ev => <li key={ev.id}><span className="font-medium">{ev.event_type.replace("_", " ").toLowerCase()}</span> · round {ev.cycle} · {ev.actor?.display_name ?? "Unknown user"} · {new Date(ev.created_at).toLocaleString()}{ev.reason && <span className="text-muted-foreground"> — {ev.reason}</span>}</li>)}</ul>}
      </section>
    </div>
  </>;
}
