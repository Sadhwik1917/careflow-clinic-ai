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
    if (fn === "ai_reserve_credit_as") return reserve instanceof Error ? { data: null, error: reserve } : { data: reserve, error: null };
    return { data: "ok", error: null };
  }) };
}
const id = "00000000-0000-0000-0000-000000000001";
const m2 = <T,>(db: ReturnType<typeof fakeDb>, ...a: [string, string, string, string, () => Promise<T>, ((ms: number) => Promise<void>)?]) => meteredAi(db, db, ...a);


describe("metered AI requests", () => {
  it("never calls the browser-callable RPCs", async () => {
    const db = fakeDb({ allowed: true }); await meteredAi(db, db, id, id, "x", id, async () => 1);
    expect(db.calls.map(c => c[0])).toEqual(["clinic_ai_enabled", "ai_reserve_credit_as", "ai_finish_credit_as"]);
  });
  it("settlement failure after success does not re-run or charge as failed", async () => {
    const db = fakeDb({ allowed: true }); const run = vi.fn(async () => 1);
    await meteredAi(db, db, id, id, "x", id, run);
    expect(run).toHaveBeenCalledOnce(); expect(db.calls.filter(c => c[0] === "ai_finish_credit_as")).toHaveLength(1);
  });
  it("No AI plan / expired trial is refused before reserving", async () => {
    const db = fakeDb({ allowed: true }, false); const run = vi.fn();
    await expect(meteredAi(db, db, id, id, "x", id, run)).rejects.toThrow("AI_NOT_INCLUDED");
    expect(run).not.toHaveBeenCalled(); expect(db.calls.map(c => c[0])).toEqual(["clinic_ai_enabled"]);
  });
  it("unauthorised clinic (database refuses) is denied", async () => {
    await expect(m2((fakeDb(new Error("Not authorised"))), id, id, "x", id, vi.fn())).rejects.toThrow("AI_NOT_INCLUDED");
  });
  it("limit reached blocks the work", async () => {
    const run = vi.fn();
    await expect(m2((fakeDb({ allowed: false, reason: "LIMIT_REACHED" })), id, id, "x", id, run)).rejects.toThrow("AI_LIMIT_REACHED");
    expect(run).not.toHaveBeenCalled();
  });
  it("success settles as charged", async () => {
    const db = fakeDb({ allowed: true });
    expect(await meteredAi(db, db, id, id, "x", id, async () => 42)).toBe(42);
    expect(db.calls.at(-1)).toEqual(["ai_finish_credit_as", { p_user: id, p_request: id, p_success: true }]);
  });
  it("failed request is not charged", async () => {
    const db = fakeDb({ allowed: true });
    await expect(meteredAi(db, db, id, id, "x", id, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(db.calls.at(-1)).toEqual(["ai_finish_credit_as", { p_user: id, p_request: id, p_success: false }]);
  });
  it("retried request id is never charged twice", async () => {
    const db = fakeDb({ allowed: true, duplicate: true }); const run = vi.fn();
    await expect(meteredAi(db, db, id, id, "x", id, run)).rejects.toThrow("DUPLICATE_REQUEST");
    expect(run).not.toHaveBeenCalled(); expect(db.calls.some(c => c[0] === "ai_finish_credit_as")).toBe(false);
  });
  it("Max AI over threshold waits, then runs", async () => {
    const sleep = vi.fn(async () => {});
    expect(await m2((fakeDb({ allowed: true, throttled: true })), id, id, "x", id, async () => 1, sleep)).toBe(1);
    expect(sleep).toHaveBeenCalledOnce();
  });
});

import { describe as d2, it as i2, expect as e2 } from "vitest";
import { parseAiUsage as p2, usageState as s2 } from "@/lib/ai-credits";
d2("hidden Max AI threshold", () => {
  i2("clinic members get no limit but still see throttling from the server flag", () => {
    const u = p2({ included: true, credit_type: "UNLIMITED", limit: null, throttled: true, used: 2100, period_end: "2026-11-01" });
    if (!u.included) throw new Error();
    e2(u.limit).toBeNull();
    e2(s2(u)).toBe("THROTTLED");
    e2(s2({ ...u, throttled: false })).toBe("OK");
  });
});
