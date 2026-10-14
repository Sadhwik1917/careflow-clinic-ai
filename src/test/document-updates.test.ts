import { describe, expect, it } from "vitest";
import { canRequestDocumentUpdate, documentUpdateErrorMessage, latestByRequirement, reasonProblem, reviewNoteProblem, type DocumentUpdate } from "@/lib/document-updates";
import { mergeClinicActivity } from "@/lib/clinic-activity";

const u = (id: string, requirement_id: string, status: DocumentUpdate["status"], created_at: string): DocumentUpdate => ({ id, clinic_id: "c", requirement_id, previous_path: null, previous_file_name: null, new_path: "p", new_file_name: "f.pdf", size_bytes: 1, reason: "Licence renewed", status, review_note: null, reviewed_at: null, created_at });

describe("document update eligibility", () => {
  it("approved active clinics only", () => {
    expect(canRequestDocumentUpdate("APPROVED", "ACTIVE", false)).toBe(true);
    expect(canRequestDocumentUpdate("PENDING_REVIEW", "ACTIVE", false)).toBe(false);
    expect(canRequestDocumentUpdate("REJECTED", "ACTIVE", false)).toBe(false);
    expect(canRequestDocumentUpdate("APPROVED", "SUSPENDED", false)).toBe(false);
  });
  it("open reverification uses the normal resubmission instead", () => expect(canRequestDocumentUpdate("APPROVED", "ACTIVE", true)).toBe(false));
});

describe("reasons and notes", () => {
  it("requires a meaningful reason", () => { expect(reasonProblem("   ")).not.toBeNull(); expect(reasonProblem("short")).not.toBeNull(); expect(reasonProblem("x".repeat(1001))).not.toBeNull(); expect(reasonProblem("Licence renewed this month")).toBeNull(); });
  it("replacement request needs a note, approval does not", () => { expect(reviewNoteProblem("NEEDS_REPLACEMENT", " ")).not.toBeNull(); expect(reviewNoteProblem("ACCEPTED", "")).toBeNull(); });
});

describe("per-document status", () => {
  it("keeps only the newest update per document, leaving others untouched", () => {
    const m = latestByRequirement([u("2", "REG", "PENDING", "2026-10-02"), u("1", "REG", "ACCEPTED", "2026-10-01"), u("3", "GST", "NEEDS_REPLACEMENT", "2026-09-01")]);
    expect(m.get("REG")?.id).toBe("2"); expect(m.get("GST")?.status).toBe("NEEDS_REPLACEMENT"); expect(m.has("OTHER")).toBe(false);
  });
});

describe("errors", () => {
  it("passes through safe database messages", () => expect(documentUpdateErrorMessage("An update for this document is already awaiting review")).toMatch(/awaiting review/));
  it("hides authorization details", () => expect(documentUpdateErrorMessage("Not authorised")).toBe("You don't have permission to do that."));
});

describe("activity history", () => {
  it("shows document update reviews with the document name and reason", () => {
    const a = mergeClinicActivity([], [{ id: "1", action: "DOCUMENT_UPDATE_NEEDS_REPLACEMENT", created_at: "2026-10-14", metadata: { reason: "Blurry scan", document: "Registration certificate" }, actor: { display_name: "Admin" } }]);
    expect(a[0]).toMatchObject({ label: "Another document replacement requested", reason: "Blurry scan", result: "Registration certificate", actor: "Admin" });
  });
});
