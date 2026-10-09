import type { Database } from "@/integrations/supabase/types";

export type VerificationStatus = Database["public"]["Enums"]["verification_status"];
export type DocReviewStatus = Database["public"]["Enums"]["document_review_status"];
export type Requirement = { id: string; clinic_type: string; doc_key: string; label: string; description: string | null; is_required: boolean; allowed_mime_types: string[]; max_size_bytes: number; provisional: boolean; sort_order: number };
export type ClinicDocument = { id: string; requirement_id: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number; review_status: DocReviewStatus; review_note: string | null; created_at: string };

export const BUCKET = "clinic-verification";

// Provisional clinic types; the database only accepts types that have active requirements.
export const clinicTypes: { value: string; label: string }[] = [
  { value: "GENERAL", label: "General clinic" }, { value: "SPECIALTY", label: "Specialty clinic" },
  { value: "DENTAL", label: "Dental clinic" }, { value: "DIAGNOSTIC", label: "Diagnostic centre" }, { value: "OTHER", label: "Other" },
];

export const statusLabel: Record<VerificationStatus, string> = { DRAFT: "Draft", PENDING_REVIEW: "Pending review", CHANGES_REQUESTED: "Changes requested", APPROVED: "Approved", REJECTED: "Rejected" };
export const statusTone: Record<VerificationStatus, "neutral" | "info" | "warning" | "success" | "danger"> = { DRAFT: "neutral", PENDING_REVIEW: "info", CHANGES_REQUESTED: "warning", APPROVED: "success", REJECTED: "danger" };

/** Owner may edit details and documents only in these states (mirrors the database rule). */
export function isEditable(status: VerificationStatus | null | undefined) {
  return status === "DRAFT" || status === "CHANGES_REQUESTED" || status === "REJECTED";
}

/** Pages an owner may open before the clinic is operational. A missing status is never treated as approved. */
export const preOperationalPaths = ["/clinic/verification", "/clinic/plans", "/clinic/settings"];
export function ownerGateRedirect(pathname: string, status: VerificationStatus | null | undefined, operational: boolean): string | null {
  if (operational) return null;
  if (preOperationalPaths.some(p => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return status === "APPROVED" ? "/clinic/plans" : "/clinic/verification";
}

export function canViewPlans(status: VerificationStatus | null | undefined) {
  return status === "APPROVED";
}

export type ClinicDetails = { clinic_type: string | null; address: string | null; city: string | null; state: string | null; representative_name: string | null };
/** Client-side mirror of the submit checks; the database re-checks everything, including stored files. */
export function submissionProblems(details: ClinicDetails, reqs: Requirement[], docs: ClinicDocument[]): string[] {
  const p: string[] = [];
  if (!details.clinic_type) p.push("Choose a clinic type.");
  if (!details.address?.trim()) p.push("Enter the clinic address.");
  if (!details.city?.trim()) p.push("Enter the city.");
  if (!details.state?.trim()) p.push("Enter the state.");
  if (!details.representative_name?.trim()) p.push("Enter the owner or authorised representative's name.");
  for (const r of reqs.filter(r => r.is_required && r.clinic_type === details.clinic_type)) {
    if (!docs.some(d => d.requirement_id === r.id)) p.push(`Upload: ${r.label}.`);
  }
  if (docs.some(d => d.review_status === "NEEDS_REPLACEMENT")) p.push("Replace the documents the reviewer flagged.");
  return p;
}

export function fileProblem(file: { size: number; type: string }, req: Pick<Requirement, "allowed_mime_types" | "max_size_bytes">): string | null {
  if (!req.allowed_mime_types.includes(file.type)) return "Use a PDF, JPG or PNG file.";
  if (file.size > req.max_size_bytes) return `Keep the file under ${Math.round(req.max_size_bytes / 1048576)} MB.`;
  if (file.size === 0) return "This file is empty.";
  return null;
}

export function documentPath(clinicId: string, requirementId: string, fileName: string) {
  const ext = (fileName.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  return `${clinicId}/${requirementId}/${crypto.randomUUID()}.${ext}`;
}

/** Maps a Storage upload error to a safe, actionable message. */
export function uploadErrorMessage(error: { message?: string; statusCode?: string | number; status?: number } | null | undefined): string {
  const m = error?.message ?? "";
  const code = String(error?.statusCode ?? error?.status ?? "");
  if (/row-level security|unauthori[sz]ed|permission/i.test(m) || code === "403") return "You can't upload documents for this clinic right now. The application may be locked for review, or you may not be its owner.";
  if (/too large|exceeded the maximum|payload/i.test(m) || code === "413") return "This file is too large. Keep it under 10 MB.";
  if (/mime|content type|invalid_mime/i.test(m) || code === "415") return "Use a PDF, JPG or PNG file.";
  if (/already exists|duplicate/i.test(m) || code === "409") return "A file with this name is already being uploaded. Please try again.";
  if (/fetch|network|timeout/i.test(m)) return "Network problem while uploading. Check your connection and try again.";
  return "Upload failed. Please try again.";
}

export function verificationErrorMessage(message: string | undefined) {
  const m = message ?? "";
  if (/Required documents|Missing required|still need to be replaced|reason is required|note is required|File too large|File type|flagged|Only pending|locked|cannot be submitted/i.test(m)) return m;
  if (/Not authorised|row-level security|permission/i.test(m)) return "You don't have permission to do that.";
  return "Something went wrong. Nothing was changed — please try again.";
}
