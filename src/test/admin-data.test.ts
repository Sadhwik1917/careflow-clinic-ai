import { describe, expect, it } from "vitest";
import { pickSubscription } from "@/lib/admin-data";

describe("pickSubscription", () => {
  it("returns null with no subscriptions", () => expect(pickSubscription([])).toBeNull());
  it("prefers active over pending or cancelled", () => expect(pickSubscription([
    { status: "CANCELLED", plan: "A" }, { status: "PENDING_PAYMENT", plan: "B" }, { status: "ACTIVE", plan: "C" },
  ])?.plan).toBe("C"));
});
