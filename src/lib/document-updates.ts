import type { VerificationStatus } from "@/lib/verification";

export type DocumentUpdateStatus = "PENDING" | "ACCEPTED" | "NEEDS_REPLACEMENT";
export type DocumentUpdate = {
  id: string; clinic_id: string; requirement_id: string; previous_path: string | null; previous_file_name: string | null;
  new_path: string; new_file_name: string; size_bytes: number; reason: string; status: DocumentUpdateStatus;
  review_note: string | null; reviewed_at: string | null; created_at: string;
};

export const REASON_MIN = 10;
export const REASON_MAX = 1000;
export const updateStatusLabel: Record<DocumentUpdateStatus, string> = { PENDING: "Awaiting review", ACCEPTED: "Accepted", NEEDS_REPLACEMENT: "Another replacement requested" };
export const updateStatusTone: Record<DocumentUpdateStatus, "info" | "success" | "danger"> = { PENDING: "info", ACCEPTED: "success", NEEDS_REPLACEMENT: "danger" };

/** Mirrors private.document_update_allowed; the database decides. Reverification uses the normal resubmission instead. */
export function canRequestDocumentUpdate(status: VerificationStatus | null | undefined, clinicStatus: string | null | undefined, openReverification: boolean) {
  return status === "APPROVED" && clinicStatus === "ACTIVE" && !openReverification;
}

export function reasonProblem(reason: string): string | null {
  const r = reason.trim();
  if (r.length < REASON_MIN) return `Explain why in at least ${REASON_MIN} characters.`;
  if (r.length > REASON_MAX) return `Keep the reason under ${REASON_MAX} characters.`;
  return null;
}

export function reviewNoteProblem(status: Exclude<DocumentUpdateStatus, "PENDING">, note: string): string | null {
  if (status === "NEEDS_REPLACEMENT" && !note.trim()) return "Add a note explaining what the owner should replace.";
  if (note.trim().length > REASON_MAX) return `Keep the note under ${REASON_MAX} characters.`;
  return null;
}

/** Latest update per document type (rows are expected newest first). */
export function latestByRequirement(updates: DocumentUpdate[]): Map<string, DocumentUpdate> {
  const m = new Map<string, DocumentUpdate>();
  for (const u of updates) if (!m.has(u.requirement_id)) m.set(u.requirement_id, u);
  return m;
}

export function documentUpdateErrorMessage(message: string | undefined) {
  const m = message ?? "";
  if (/already awaiting review|reason of|note is required|File too large|File type|only available for approved|Only pending|Uploaded file not found|Unknown document type/i.test(m)) return m;
  if (/Not authorised|row-level security|permission/i.test(m)) return "You don't have permission to do that.";
  return "Something went wrong. Nothing was changed — please try again.";
}
