import { describe, expect, it, vi } from "vitest";
import { parseAiUsage, remaining, usageState } from "@/lib/ai-credits";
import { meteredAi } from "@/lib/ai.functions";

const base = { included: true, credit_type: "LIMITED", limit: 500, used: 0, period_start: "2026-10-01", period_end: "2026-11-01" };

describe("usage interpretation", () => {
  it("No AI plan is a restriction, not zero usage", () => expect(parseAiUsage({ included: false })).toEqual({ included: false }));
  it("below, at and above the limit", () => {
    const at = (used: number, t = "LIMITED") => usageState(parseAiUsage({ ...base, used, credit_type: t }) as never);
    expect(at(499)).toBe("OK"); expect(at(500)).toBe("LIMIT_REACHED"); expect(at(501)).toBe("LIMIT_REACHED");
  });
  it("Max AI past 2000 is throttled, not blocked", () => expect(usageState(parseAiUsage({ ...base, credit_type: "UNLIMITED", limit: 2000, used: 2000 }) as never)).toBe("THROTTLED"));
  it("remaining never negative", () => expect(remaining(parseAiUsage({ ...base, used: 600 }) as never)).toBe(0));
});

function fakeDb(reserve: unknown, aiEnabled = true) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  return { calls, rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push([fn, args]);
    if (fn === "clinic_ai_enabled") return { data: aiEnabled, error: null };
    if (fn === "reserve_ai_credit") return reserve instanceof Error ? { data: null, error: reserve } : { data: reserve, error: null };
    return { data: "ok", error: null };
  }) };
}
const id = "00000000-0000-0000-0000-000000000001";

describe("metered AI requests", () => {
  it("No AI plan / expired trial is refused before reserving", async () => {
    const db = fakeDb({ allowed: true }, false); const run = vi.fn();
    await expect(meteredAi(db, id, "x", id, run)).rejects.toThrow("AI_NOT_INCLUDED");
    expect(run).not.toHaveBeenCalled(); expect(db.calls.map(c => c[0])).toEqual(["clinic_ai_enabled"]);
  });
  it("unauthorised clinic (database refuses) is denied", async () => {
    await expect(meteredAi(fakeDb(new Error("Not authorised")), id, "x", id, vi.fn())).rejects.toThrow("AI_NOT_INCLUDED");
  });
  it("limit reached blocks the work", async () => {
    const run = vi.fn();
    await expect(meteredAi(fakeDb({ allowed: false, reason: "LIMIT_REACHED" }), id, "x", id, run)).rejects.toThrow("AI_LIMIT_REACHED");
    expect(run).not.toHaveBeenCalled();
  });
  it("success settles as charged", async () => {
    const db = fakeDb({ allowed: true });
    expect(await meteredAi(db, id, "x", id, async () => 42)).toBe(42);
    expect(db.calls.at(-1)).toEqual(["finish_ai_credit", { p_request: id, p_success: true }]);
  });
  it("failed request is not charged", async () => {
    const db = fakeDb({ allowed: true });
    await expect(meteredAi(db, id, "x", id, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(db.calls.at(-1)).toEqual(["finish_ai_credit", { p_request: id, p_success: false }]);
  });
  it("retried request id is never charged twice", async () => {
    const db = fakeDb({ allowed: true, duplicate: true }); const run = vi.fn();
    await expect(meteredAi(db, id, "x", id, run)).rejects.toThrow("DUPLICATE_REQUEST");
    expect(run).not.toHaveBeenCalled(); expect(db.calls.some(c => c[0] === "finish_ai_credit")).toBe(false);
  });
  it("Max AI over threshold waits, then runs", async () => {
    const sleep = vi.fn(async () => {});
    expect(await meteredAi(fakeDb({ allowed: true, throttled: true }), id, "x", id, async () => 1, sleep)).toBe(1);
    expect(sleep).toHaveBeenCalledOnce();
  });
});
