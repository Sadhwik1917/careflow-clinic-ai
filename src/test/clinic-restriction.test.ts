import { describe, expect, it } from "vitest";
import { restrictionBlocks, restrictionFrom } from "@/lib/clinic-restriction";

const ev = (event_type: string, created_at: string, reason: string | null = null) => ({ event_type, created_at, reason });

describe("clinic restriction", () => {
  it("A: suspended uses the admin's suspension note", () => expect(restrictionFrom("SUSPENDED", "APPROVED", [ev("APPROVED", "2026-01-01"), ev("SUSPENDED", "2026-02-01", "Expired licence")])).toEqual({ kind: "SUSPENDED", reason: "Expired licence" }));
  it("B: revoked uses the revocation note", () => expect(restrictionFrom("ACTIVE", "REJECTED", [ev("APPROVED", "2026-01-01"), ev("REVOKED_AFTER_APPROVAL", "2026-02-01", "Fraudulent documents")])).toEqual({ kind: "REVOKED", reason: "Fraudulent documents" }));
  it("C: active approved clinic is not restricted", () => expect(restrictionFrom("ACTIVE", "APPROVED", [ev("APPROVED", "2026-01-01")])).toBeNull());
  it("ordinary initial rejection is not a revocation", () => expect(restrictionFrom("ACTIVE", "REJECTED", [ev("REJECTED", "2026-01-01", "x")])).toBeNull());
  it("reinstated clinic is not restricted", () => expect(restrictionFrom("ACTIVE", "APPROVED", [ev("SUSPENDED", "2026-01-01", "a"), ev("REINSTATED", "2026-02-01", "b")])).toBeNull());
  it("missing note is not invented", () => expect(restrictionFrom("SUSPENDED", "APPROVED", [])?.reason).toBeNull());
  it("D: every operational URL is blocked; verification stays open", () => {
    const r = { kind: "SUSPENDED" as const, reason: null };
    for (const p of ["/clinic/dashboard", "/clinic/ai", "/clinic/settings", "/clinic/plans", "/clinic/patients/new"]) expect(restrictionBlocks(p, r)).toBe(true);
    expect(restrictionBlocks("/clinic/verification", r)).toBe(false);
    expect(restrictionBlocks("/clinic/dashboard", null)).toBe(false);
  });
});
