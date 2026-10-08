import { describe, expect, it } from "vitest";
import { decideAreaAccess, safeRedirect, type UserAccess } from "@/lib/access";

const m = (id: string, role: "OWNER" | "DOCTOR" | "STAFF" | "PATIENT", status: "ACTIVE" | "INVITED" = "ACTIVE") => ({ id, clinic_id: `c-${id}`, role, status, clinic: { id: `c-${id}`, name: id, status: "ACTIVE" as const } });
const access = (memberships: ReturnType<typeof m>[], admin = false): UserAccess => ({ userId: "u", email: null, profile: { id: "u", display_name: null, platform_role: admin ? "PLATFORM_ADMIN" : "USER", status: "ACTIVE" }, memberships });

describe("area access", () => {
  it("denies admin area to non-admins", () => expect(decideAreaAccess(access([m("a", "OWNER")]), "PLATFORM_ADMIN", null).kind).toBe("denied"));
  it("allows admin area to platform admins", () => expect(decideAreaAccess(access([], true), "PLATFORM_ADMIN", null).kind).toBe("allow"));
  it("does not treat platform admin as clinic owner", () => expect(decideAreaAccess(access([], true), "OWNER", null).kind).toBe("denied"));
  it("ignores inactive memberships", () => expect(decideAreaAccess(access([m("a", "DOCTOR", "INVITED")]), "DOCTOR", null).kind).toBe("denied"));
  it("allows a single matching membership", () => expect(decideAreaAccess(access([m("a", "STAFF")]), "STAFF", null).kind).toBe("allow"));
  it("asks to choose with several clinics", () => expect(decideAreaAccess(access([m("a", "OWNER"), m("b", "OWNER")]), "OWNER", null).kind).toBe("select"));
  it("ignores a stored clinic the user isn't a member of", () => expect(decideAreaAccess(access([m("a", "OWNER"), m("b", "OWNER")]), "OWNER", "c-zzz").kind).toBe("select"));
  it("honours a verified stored clinic", () => expect(decideAreaAccess(access([m("a", "OWNER"), m("b", "OWNER")]), "OWNER", "c-b")).toMatchObject({ kind: "allow", membership: { id: "b" } }));
});

describe("safeRedirect", () => {
  it("accepts relative paths", () => expect(safeRedirect("/clinic/queue")).toBe("/clinic/queue"));
  it("rejects external and auth paths", () => { for (const v of ["https://x.com", "//x.com", "/login", "/signup?x=1", 5]) expect(safeRedirect(v)).toBeUndefined(); });
});
