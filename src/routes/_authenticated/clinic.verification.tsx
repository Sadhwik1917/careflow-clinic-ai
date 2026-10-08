import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { FileText, Loader2, Upload } from "lucide-react";
import { PageTitle } from "@/components/careflow/page-title";
import { StatusBadge } from "@/components/careflow/feedback";
import { FormAlert, FormField } from "@/components/careflow/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { pageMetadata } from "@/lib/navigation";
import { BUCKET, clinicTypes, documentPath, fileProblem, isEditable, statusLabel, statusTone, submissionProblems, verificationErrorMessage, type ClinicDocument, type Requirement } from "@/lib/verification";

const verificationQuery = (clinicId: string) => queryOptions({
  queryKey: ["verification", clinicId],
  queryFn: async () => {
    const [clinic, ver, reqs, docs, events] = await Promise.all([
      supabase.from("clinics").select("id, name, display_name, clinic_type, address, city, state, postal_code, latitude, longitude, registration_number, representative_name, representative_phone").eq("id", clinicId).single(),
      supabase.from("clinic_verifications").select("status, cycle, submitted_at, decided_at, decision_reason").eq("clinic_id", clinicId).maybeSingle(),
      supabase.from("document_requirements").select("id, clinic_type, doc_key, label, description, is_required, allowed_mime_types, max_size_bytes, provisional, sort_order").eq("is_active", true).order("sort_order"),
      supabase.from("clinic_documents").select("id, requirement_id, storage_path, file_name, mime_type, size_bytes, review_status, review_note, created_at").eq("clinic_id", clinicId),
      supabase.from("verification_events").select("id, cycle, event_type, reason, created_at").eq("clinic_id", clinicId).order("created_at", { ascending: false }),
    ]);
    const err = clinic.error ?? ver.error ?? reqs.error ?? docs.error ?? events.error;
    if (err) throw new Error("We couldn't load your verification. Please try again.");
    return { clinic: clinic.data, verification: ver.data, reqs: (reqs.data ?? []) as Requirement[], docs: (docs.data ?? []) as ClinicDocument[], events: events.data ?? [] };
  },
});

export const Route = createFileRoute("/_authenticated/clinic/verification")({
  head: () => pageMetadata("Verification", "OWNER"),
  component: Page,
});

type Details = { clinic_type: string; address: string; city: string; state: string; postal_code: string; registration_number: string; representative_name: string; representative_phone: string; latitude: string; longitude: string };

function Page() {
  const { membership } = Route.useRouteContext();
  const clinicId = membership?.clinic_id ?? "";
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(verificationQuery(clinicId));
  const status = data.verification?.status ?? null;
  const editable = isEditable(status);
  const c = data.clinic;
  const [form, setForm] = useState<Details>({ clinic_type: c.clinic_type ?? "", address: c.address ?? "", city: c.city ?? "", state: c.state ?? "", postal_code: c.postal_code ?? "", registration_number: c.registration_number ?? "", representative_name: c.representative_name ?? "", representative_phone: c.representative_phone ?? "", latitude: c.latitude?.toString() ?? "", longitude: c.longitude?.toString() ?? "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["verification", clinicId] });
  const reqs = data.reqs.filter(r => r.clinic_type === c.clinic_type);
  const problems = submissionProblems(c, data.reqs, data.docs.filter(d => reqs.some(r => r.id === d.requirement_id)));

  // Clear uploaded files that never got registered (e.g. an interrupted upload or replacement).
  useEffect(() => {
    if (!editable || !clinicId) return;
    void (async () => {
      for (const r of reqs) {
        const { data: files } = await supabase.storage.from(BUCKET).list(`${clinicId}/${r.id}`);
        const orphans = (files ?? []).map(f => `${clinicId}/${r.id}/${f.name}`).filter(p => !data.docs.some(d => d.storage_path === p));
        if (orphans.length) await supabase.storage.from(BUCKET).remove(orphans);
      }
    })();
  }, [editable, clinicId, data.docs, reqs.map(r => r.id).join()]);

  async function saveDetails(e: FormEvent) {
    e.preventDefault(); setBusy("details"); setMessage(null);
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    const { error } = await supabase.from("clinics").update({ clinic_type: form.clinic_type || null, address: form.address.trim() || null, city: form.city.trim() || null, state: form.state.trim() || null, postal_code: form.postal_code.trim() || null, registration_number: form.registration_number.trim() || null, representative_name: form.representative_name.trim() || null, representative_phone: form.representative_phone.trim() || null, latitude: num(form.latitude), longitude: num(form.longitude) }).eq("id", clinicId);
    setBusy(null);
    setMessage(error ? { ok: false, text: verificationErrorMessage(error.message) } : { ok: true, text: "Clinic details saved." });
    if (!error) await refresh();
  }

  async function upload(req: Requirement, file: File) {
    const problem = fileProblem(file, req);
    if (problem) { setMessage({ ok: false, text: `${req.label}: ${problem}` }); return; }
    setBusy(req.id); setMessage(null);
    const path = documentPath(clinicId, req.id, file.name);
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) { setBusy(null); setMessage({ ok: false, text: "Upload failed. Please try again." }); return; }
    const reg = await supabase.rpc("register_clinic_document", { p_clinic: clinicId, p_requirement: req.id, p_path: path, p_file_name: file.name });
    if (reg.error) { await supabase.storage.from(BUCKET).remove([path]); setBusy(null); setMessage({ ok: false, text: verificationErrorMessage(reg.error.message) }); return; }
    if (reg.data) await supabase.storage.from(BUCKET).remove([reg.data]);
    setBusy(null); setMessage({ ok: true, text: `${req.label} uploaded.` }); await refresh();
  }

  async function remove(doc: ClinicDocument) {
    setBusy(doc.id); setMessage(null);
    const { data: path, error } = await supabase.rpc("remove_clinic_document", { p_document: doc.id });
    if (!error && path) await supabase.storage.from(BUCKET).remove([path]);
    setBusy(null); setMessage(error ? { ok: false, text: verificationErrorMessage(error.message) } : { ok: true, text: "Document removed." });
    await refresh();
  }

  async function submit() {
    setBusy("submit"); setMessage(null);
    const { error } = await supabase.rpc("submit_clinic_verification", { p_clinic: clinicId });
    setBusy(null); setConfirming(false);
    setMessage(error ? { ok: false, text: verificationErrorMessage(error.message) } : { ok: true, text: "Application submitted. We'll review it and let you know." });
    await refresh();
  }

  const set = (k: keyof Details) => (e: { target: { value: string } }) => setForm(s => ({ ...s, [k]: e.target.value }));
  const disabled = !editable || busy !== null;

  return <>
    <PageTitle title="Clinic verification" description="Submit your clinic's details and documents for review by CAREFLOW." actions={<StatusBadge tone={status ? statusTone[status] : "neutral"}>{status ? statusLabel[status] : "Not started"}</StatusBadge>} />
    <div className="space-y-6 border-t px-4 py-6 md:px-6">
      {status === "PENDING_REVIEW" && <FormAlert tone="info">Your application is under review. Details and documents are locked until a decision is made.</FormAlert>}
      {status === "CHANGES_REQUESTED" && <FormAlert>Changes requested: {data.verification?.decision_reason}. Update the details or documents below and resubmit.</FormAlert>}
      {status === "REJECTED" && <FormAlert>Application rejected: {data.verification?.decision_reason}. You can correct it and apply again.</FormAlert>}
      {status === "APPROVED" && <FormAlert tone="info">Your clinic is approved. <Link to="/clinic/plans" className="underline">Choose a plan</Link> to start using CAREFLOW.</FormAlert>}
      {message && <FormAlert tone={message.ok ? "info" : undefined}>{message.text}</FormAlert>}

      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-base font-semibold">Clinic details</h2>
        <form onSubmit={e => void saveDetails(e)} className="mt-4 grid gap-4 md:grid-cols-2">
          <FormField id="clinic_type" label="Clinic type">
            <select id="clinic_type" value={form.clinic_type} onChange={set("clinic_type")} disabled={disabled} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Choose…</option>{clinicTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </FormField>
          <FormField id="registration_number" label="Registration / licence number (optional)"><Input id="registration_number" value={form.registration_number} onChange={set("registration_number")} disabled={disabled} maxLength={80} /></FormField>
          <FormField id="address" label="Address"><Input id="address" value={form.address} onChange={set("address")} disabled={disabled} maxLength={300} /></FormField>
          <FormField id="city" label="City"><Input id="city" value={form.city} onChange={set("city")} disabled={disabled} maxLength={80} /></FormField>
          <FormField id="state" label="State"><Input id="state" value={form.state} onChange={set("state")} disabled={disabled} maxLength={80} /></FormField>
          <FormField id="postal_code" label="Postal code (optional)"><Input id="postal_code" value={form.postal_code} onChange={set("postal_code")} disabled={disabled} maxLength={12} /></FormField>
          <FormField id="latitude" label="Latitude (optional)"><Input id="latitude" inputMode="decimal" value={form.latitude} onChange={set("latitude")} disabled={disabled} /></FormField>
          <FormField id="longitude" label="Longitude (optional)"><Input id="longitude" inputMode="decimal" value={form.longitude} onChange={set("longitude")} disabled={disabled} /></FormField>
          <FormField id="representative_name" label="Owner / authorised representative"><Input id="representative_name" value={form.representative_name} onChange={set("representative_name")} disabled={disabled} maxLength={120} /></FormField>
          <FormField id="representative_phone" label="Representative phone (optional)"><Input id="representative_phone" type="tel" value={form.representative_phone} onChange={set("representative_phone")} disabled={disabled} maxLength={20} /></FormField>
          {editable && <div className="md:col-span-2"><Button type="submit" variant="outline" disabled={busy !== null}>{busy === "details" && <Loader2 className="animate-spin" />}Save details</Button></div>}
        </form>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-base font-semibold">Documents</h2>
        <p className="mt-1 text-sm text-muted-foreground">PDF, JPG or PNG, up to 10 MB each. This list is provisional and may change; requirements depend on your clinic type and location.</p>
        {!c.clinic_type ? <p className="mt-4 text-sm text-muted-foreground">Choose and save a clinic type to see which documents to upload.</p> :
          <ul className="mt-4 divide-y">{reqs.map(r => {
            const d = data.docs.find(x => x.requirement_id === r.id);
            return <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
              <div className="min-w-0">
                <p className="font-medium">{r.label} <StatusBadge tone={r.is_required ? "warning" : "neutral"}>{r.is_required ? "Required" : "Optional"}</StatusBadge></p>
                {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                {d && <p className="mt-1 flex items-center gap-1 text-sm"><FileText className="size-4" />{d.file_name} · <StatusBadge tone={d.review_status === "ACCEPTED" ? "success" : d.review_status === "NEEDS_REPLACEMENT" ? "danger" : "neutral"}>{d.review_status === "NEEDS_REPLACEMENT" ? "Needs replacement" : d.review_status === "ACCEPTED" ? "Accepted" : "Uploaded"}</StatusBadge></p>}
                {d?.review_note && <p className="text-sm text-destructive">Reviewer: {d.review_note}</p>}
              </div>
              {editable && <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" disabled={busy !== null}>
                  <label className="cursor-pointer">{busy === r.id ? <Loader2 className="animate-spin" /> : <Upload />}{busy === r.id ? "Uploading…" : d ? "Replace" : "Upload"}
                    <input type="file" className="sr-only" accept={r.allowed_mime_types.join(",")} disabled={busy !== null} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(r, f); }} />
                  </label>
                </Button>
                {d && <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void remove(d)}>Remove</Button>}
              </div>}
            </li>;
          })}</ul>}
      </section>

      {editable && <section className="rounded-lg border bg-card p-5">
        <h2 className="text-base font-semibold">{status === "DRAFT" ? "Submit application" : "Resubmit application"}</h2>
        {problems.length > 0 ? <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{problems.map(p => <li key={p}>{p}</li>)}</ul>
          : <p className="mt-2 text-sm text-muted-foreground">Everything required is in place. Once submitted, details and documents are locked until review.</p>}
        <div className="mt-4 flex gap-2">
          {!confirming ? <Button disabled={problems.length > 0 || busy !== null} onClick={() => setConfirming(true)}>Submit for review</Button>
            : <><Button disabled={busy !== null} onClick={() => void submit()}>{busy === "submit" && <Loader2 className="animate-spin" />}Confirm submission</Button><Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button></>}
        </div>
      </section>}

      {data.events.length > 0 && <section className="rounded-lg border bg-card p-5">
        <h2 className="text-base font-semibold">History</h2>
        <ul className="mt-3 space-y-2 text-sm">{data.events.map(ev => <li key={ev.id}><span className="font-medium">{ev.event_type.replace("_", " ").toLowerCase()}</span> · {new Date(ev.created_at).toLocaleString()}{ev.reason && <span className="text-muted-foreground"> — {ev.reason}</span>}</li>)}</ul>
      </section>}
    </div>
  </>;
}
