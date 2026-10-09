import { describe, expect, it } from "vitest";
import { canViewPlans, fileProblem, isEditable, ownerGateRedirect, submissionProblems, type ClinicDocument, type Requirement } from "@/lib/verification";

const req = (id: string, is_required: boolean, doc_key = id): Requirement => ({ id, clinic_type: "GENERAL", doc_key, label: id, description: null, is_required, allowed_mime_types: ["application/pdf", "image/png", "image/jpeg"], max_size_bytes: 10485760, provisional: true, sort_order: 0 });
const doc = (requirement_id: string, review_status: ClinicDocument["review_status"] = "PENDING"): ClinicDocument => ({ id: requirement_id + "d", requirement_id, storage_path: "p", file_name: "f.pdf", mime_type: "application/pdf", size_bytes: 1, review_status, review_note: null, created_at: "" });
const details = { clinic_type: "GENERAL", address: "1 Road", city: "Chennai", state: "TN", representative_name: "Dr A" };
const reqs = [req("REG", true), req("GST", false)];

describe("submission checklist", () => {
  it("flags missing details", () => expect(submissionProblems({ ...details, city: " ", clinic_type: null }, reqs, [doc("REG")]).length).toBe(2));
  it("requires required documents", () => expect(submissionProblems(details, reqs, [])).toContain("Upload: REG."));
  it("never requires optional GST", () => expect(submissionProblems(details, reqs, [doc("REG")])).toEqual([]));
  it("blocks flagged documents, including optional ones", () => expect(submissionProblems(details, reqs, [doc("REG"), doc("GST", "NEEDS_REPLACEMENT")]).length).toBe(1));
});

describe("file checks", () => {
  it("rejects wrong type", () => expect(fileProblem({ size: 10, type: "text/plain" }, reqs[0]!)).not.toBeNull());
  it("rejects oversize", () => expect(fileProblem({ size: 11 * 1048576, type: "application/pdf" }, reqs[0]!)).not.toBeNull());
  it("accepts a valid pdf", () => expect(fileProblem({ size: 1000, type: "application/pdf" }, reqs[0]!)).toBeNull());
});

describe("owner gate", () => {
  it("missing status is not approved", () => { expect(ownerGateRedirect("/clinic/dashboard", null, false)).toBe("/clinic/verification"); expect(canViewPlans(null)).toBe(false); });
  it("pending and rejected go to verification", () => { expect(ownerGateRedirect("/clinic/patients", "PENDING_REVIEW", false)).toBe("/clinic/verification"); expect(ownerGateRedirect("/clinic/patients", "REJECTED", false)).toBe("/clinic/verification"); });
  it("approved without enrollment goes to plans", () => expect(ownerGateRedirect("/clinic/dashboard", "APPROVED", false)).toBe("/clinic/plans"));
  it("allowed pages stay open", () => { expect(ownerGateRedirect("/clinic/verification", "DRAFT", false)).toBeNull(); expect(ownerGateRedirect("/clinic/settings", "DRAFT", false)).toBeNull(); });
  it("operational clinic is not redirected", () => expect(ownerGateRedirect("/clinic/dashboard", "APPROVED", true)).toBeNull());
  it("plans visible only when approved", () => { expect(canViewPlans("PENDING_REVIEW")).toBe(false); expect(canViewPlans("APPROVED")).toBe(true); });
  it("editable states", () => { expect(isEditable("CHANGES_REQUESTED")).toBe(true); expect(isEditable("PENDING_REVIEW")).toBe(false); expect(isEditable("APPROVED")).toBe(false); });
});

import { uploadErrorMessage } from "@/lib/verification";
describe("uploadErrorMessage", () => {
  it("maps policy refusals", () => expect(uploadErrorMessage({ message: "new row violates row-level security policy", statusCode: "403" })).toMatch(/can't upload/));
  it("maps size", () => expect(uploadErrorMessage({ statusCode: "413" })).toMatch(/too large/));
  it("maps type", () => expect(uploadErrorMessage({ message: "invalid_mime_type" })).toMatch(/PDF/));
  it("falls back", () => expect(uploadErrorMessage(null)).toBe("Upload failed. Please try again."));
});
