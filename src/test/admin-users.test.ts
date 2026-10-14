import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { readAdminUsers, type EmailDirectory } from "@/lib/admin-users.server";
import { userCategory, userFiltersSchema, userSearchTerm } from "@/lib/admin-user-rules";

function fakeClient(results: unknown[]) {
  const calls: [string, unknown[]][] = [];
  const make = (result: unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "or", "ilike", "in", "order", "range"]) b[m] = vi.fn((...a: unknown[]) => { calls.push([m, a]); return b; });
    b["then"] = (r: (v: unknown) => unknown) => Promise.resolve(result).then(r);
    return b;
  };
  let i = 0;
  return { client: { from: vi.fn(() => make(results[i++])) } as unknown as SupabaseClient<Database>, calls };
}
const directory = (ids: string[] = []): EmailDirectory => ({ idsMatching: vi.fn(async () => ids), emailsFor: vi.fn(async (list: string[]) => new Map(list.map(id => [id, `${id}@x.com`]))) });
const profile = { id: "u1", display_name: "Asha", created_at: "2026-01-01", platform_role: "USER", status: "ACTIVE", memberships: [] };

describe("admin users", () => {
  it("validates filters", () => {
    expect(userFiltersSchema.parse({})).toEqual({ search: "", role: "ALL", status: "ALL", page: 0 });
    expect(() => userFiltersSchema.parse({ role: "ROOT" })).toThrow();
    expect(() => userFiltersSchema.parse({ page: -1 })).toThrow();
  });
  it("strips filter grammar from search", () => expect(userSearchTerm("a,b)(%_c")).toBe("a b c"));
  it("returns no rows when search matches nothing", async () => {
    const { client } = fakeClient([{ data: [], error: null }]);
    expect(await readAdminUsers(client, directory(), { search: "zz", role: "ALL", status: "ALL", page: 0 })).toEqual({ rows: [], count: 0 });
  });
  it("merges name and email matches and attaches emails", async () => {
    const { client, calls } = fakeClient([{ data: [{ id: "u1" }], error: null }, { data: [profile], error: null, count: 1 }]);
    const res = await readAdminUsers(client, directory(["u2"]), { search: "as", role: "ALL", status: "ACTIVE", page: 0 });
    expect(calls.find(([m]) => m === "in")?.[1]).toEqual(["id", ["u1", "u2"]]);
    expect(calls.some(([m, a]) => m === "eq" && a[0] === "status")).toBe(true);
    expect(res.rows[0]?.email).toBe("u1@x.com");
  });
  it("filters by active clinic role", async () => {
    const { client, calls } = fakeClient([{ data: [{ user_id: "u1" }], error: null }, { data: [profile], error: null, count: 1 }]);
    await readAdminUsers(client, directory(), { search: "", role: "DOCTOR", status: "ALL", page: 0 });
    expect(calls.some(([m, a]) => m === "eq" && a[0] === "role" && a[1] === "DOCTOR")).toBe(true);
  });
  it("throws a generic error on query failure", async () => {
    const { client } = fakeClient([{ data: null, error: new Error("x") }]);
    await expect(readAdminUsers(client, directory(), { search: "", role: "ALL", status: "ALL", page: 0 })).rejects.toThrow("Users couldn't load");
  });
  it("derives categories from stored roles only", () => {
    expect(userCategory({ platform_role: "PLATFORM_ADMIN", memberships: [] })).toBe("Platform admin");
    expect(userCategory({ platform_role: "USER", memberships: [{ id: "m", role: "OWNER", status: "REMOVED", joined_at: null, clinic: null }] })).toBe("No clinic role");
  });
});
