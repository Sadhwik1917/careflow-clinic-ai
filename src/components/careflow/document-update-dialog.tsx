import { useState } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormAlert } from "@/components/careflow/auth-ui";
import { StatusBadge } from "@/components/careflow/feedback";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET, documentPath, fileProblem, uploadErrorMessage, type ClinicDocument, type Requirement } from "@/lib/verification";
import { documentUpdateErrorMessage, reasonProblem, REASON_MAX, updateStatusLabel, updateStatusTone, type DocumentUpdate } from "@/lib/document-updates";

export function DocumentUpdateDialog({ open, onOpenChange, clinicId, req, doc, latest, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; clinicId: string; req: Requirement;
  doc: ClinicDocument | undefined; latest: DocumentUpdate | undefined; onDone: (text: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = latest?.status === "PENDING";

  async function submit() {
    setError(null);
    if (!file) { setError("Choose the replacement file."); return; }
    const p = fileProblem(file, req) ?? reasonProblem(reason);
    if (p) { setError(p); return; }
    setBusy(true);
    const path = documentPath(clinicId, req.id, file.name);
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) { const e = up.error as { message?: string; statusCode?: string }; console.error("[document-update] upload failed", { status: e.statusCode, message: e.message }); setBusy(false); setError(uploadErrorMessage(e)); return; }
    const { error: rpcErr } = await supabase.rpc("submit_document_update", { p_clinic: clinicId, p_requirement: req.id, p_path: path, p_file_name: file.name, p_reason: reason.trim() });
    setBusy(false);
    if (rpcErr) { console.error("[document-update] submit failed", { code: rpcErr.code, message: rpcErr.message }); setError(documentUpdateErrorMessage(rpcErr.message)); return; }
    setFile(null); setReason("");
    onDone(`${req.label}: update sent. It's awaiting review; your clinic keeps working meanwhile.`);
    onOpenChange(false);
  }

  return <Dialog open={open} onOpenChange={o => { if (!busy) onOpenChange(o); }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Update {req.label}</DialogTitle>
        <DialogDescription>The administrator reviews the new file. Your current document stays in use until it's accepted.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 text-sm">
        <div><p className="text-muted-foreground">Current document</p>
          <p className="mt-1 flex items-center gap-1">{doc ? <><FileText className="size-4" />{doc.file_name}</> : "None on file"}</p></div>
        {latest && <div className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground">Latest update:</span>
          <StatusBadge tone={updateStatusTone[latest.status]}>{updateStatusLabel[latest.status]}</StatusBadge>
          <span className="text-xs text-muted-foreground">{new Date(latest.created_at).toLocaleString()}</span>
          {latest.review_note && <p className="w-full text-destructive">Reviewer: {latest.review_note}</p>}</div>}
        {pending ? <FormAlert tone="success">An update for this document is awaiting review. You can send another once it's reviewed.</FormAlert> : <>
          <div className="space-y-1">
            <Label htmlFor="update-file">Replacement file (PDF, JPG or PNG, up to {Math.round(req.max_size_bytes / 1048576)} MB)</Label>
            <Button asChild variant="outline" size="sm" disabled={busy}>
              <label htmlFor="update-file" className="cursor-pointer"><Upload />{file ? file.name : "Choose file"}</label>
            </Button>
            <input id="update-file" type="file" className="sr-only" accept={req.allowed_mime_types.join(",")} disabled={busy} onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="update-reason">Reason for the update</Label>
            <Textarea id="update-reason" value={reason} maxLength={REASON_MAX} disabled={busy} onChange={e => setReason(e.target.value)} placeholder="e.g. Licence renewed; the new certificate has a later expiry date." />
          </div>
          {error && <FormAlert tone="error">{error}</FormAlert>}
          <div className="flex justify-end"><Button onClick={() => void submit()} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Send for review</Button></div>
        </>}
      </div>
    </DialogContent>
  </Dialog>;
}
