import { useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormAlert } from "@/components/careflow/auth-ui";
import { ErrorState, LoadingState, StatusBadge } from "@/components/careflow/feedback";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET } from "@/lib/verification";
import { documentUpdateErrorMessage, reviewNoteProblem, updateStatusLabel, updateStatusTone, type DocumentUpdate } from "@/lib/document-updates";

type Row = DocumentUpdate & { requirement: { label: string } | null };

export const documentUpdatesQuery = (clinicId: string) => queryOptions({
  queryKey: ["admin-verifications", "document-updates", clinicId],
  queryFn: async () => {
    const { data, error } = await supabase.from("clinic_document_updates")
      .select("id, clinic_id, requirement_id, previous_path, previous_file_name, new_path, new_file_name, size_bytes, reason, status, review_note, reviewed_at, created_at, requirement:document_requirements(label)")
      .eq("clinic_id", clinicId).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error("We couldn't load document updates.");
    return (data ?? []) as unknown as Row[];
  },
});

export function AdminDocumentUpdates({ clinicId }: { clinicId: string }) {
  const qc = useQueryClient();
  const q = useQuery(documentUpdatesQuery(clinicId));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function view(path: string) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error || !data) { setMsg({ ok: false, text: "Couldn't open this document." }); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }
  async function review(id: string, status: "ACCEPTED" | "NEEDS_REPLACEMENT") {
    const note = notes[id] ?? "";
    const p = reviewNoteProblem(status, note);
    if (p) { setMsg({ ok: false, text: p }); return; }
    setBusy(id); setMsg(null);
    const { error } = await supabase.rpc("review_document_update", { p_update: id, p_status: status, p_note: note });
    setBusy(null);
    setMsg(error ? { ok: false, text: documentUpdateErrorMessage(error.message) } : { ok: true, text: status === "ACCEPTED" ? "Update accepted. The new file is now the clinic's document." : "Another replacement requested. The owner has been notified." });
    await qc.invalidateQueries({ queryKey: ["admin-verifications"] });
  }

  return <section className="rounded-lg border bg-card p-5" aria-label="Document updates">
    <h2 className="text-base font-semibold">Document updates</h2>
    <p className="mt-1 text-sm text-muted-foreground">Replacements sent by the owner after approval. Reviewing them never changes the clinic's approval or status.</p>
    {msg && <div className="mt-3"><FormAlert tone={msg.ok ? "success" : "error"}>{msg.text}</FormAlert></div>}
    {q.isPending ? <LoadingState label="Loading updates…" /> : q.isError ? <ErrorState title="Updates couldn't load" onRetry={() => q.refetch()} /> :
      q.data.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No document updates.</p> :
      <ul className="mt-3 divide-y">{q.data.map(u => <li key={u.id} className="space-y-2 py-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">{u.requirement?.label ?? "Document"}</p>
          <StatusBadge tone={updateStatusTone[u.status]}>{updateStatusLabel[u.status]}</StatusBadge>
        </div>
        <p className="text-xs text-muted-foreground">Sent {new Date(u.created_at).toLocaleString()}{u.reviewed_at && ` · reviewed ${new Date(u.reviewed_at).toLocaleString()}`}</p>
        <p className="break-words"><span className="text-muted-foreground">Owner's reason:</span> {u.reason}</p>
        <div className="flex flex-wrap gap-2">
          {u.previous_path && <Button size="sm" variant="outline" onClick={() => void view(u.previous_path!)}>Previous: {u.previous_file_name ?? "file"}</Button>}
          <Button size="sm" variant="outline" onClick={() => void view(u.new_path)}>Replacement: {u.new_file_name}</Button>
        </div>
        {u.review_note && <p className="text-muted-foreground">Note: {u.review_note}</p>}
        {u.status === "PENDING" && <div className="flex flex-wrap gap-2">
          <Input aria-label="Review note" placeholder="Note (required to request another replacement)" value={notes[u.id] ?? ""} maxLength={1000} onChange={e => setNotes(s => ({ ...s, [u.id]: e.target.value }))} className="max-w-sm" />
          <Button size="sm" disabled={busy !== null} onClick={() => void review(u.id, "ACCEPTED")}>{busy === u.id && <Loader2 className="animate-spin" />}Accept</Button>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void review(u.id, "NEEDS_REPLACEMENT")}>Request another replacement</Button>
        </div>}
      </li>)}</ul>}
  </section>;
}
