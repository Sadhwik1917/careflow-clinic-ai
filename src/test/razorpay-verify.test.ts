import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canTransition, parseCheckoutResult, statusForEvent, verifyCheckoutSignature, verifyWebhookSignature } from "@/lib/razorpay-verify";

const hmac = (k: string, m: string) => createHmac("sha256", k).update(m).digest("hex");

describe("razorpay signatures", () => {
  it("accepts a valid checkout signature", async () => {
    expect(await verifyCheckoutSignature("sec", "pay_1", "sub_1", hmac("sec", "pay_1|sub_1"))).toBe(true);
  });
  it("rejects invalid or swapped checkout signatures", async () => {
    expect(await verifyCheckoutSignature("sec", "pay_1", "sub_1", hmac("other", "pay_1|sub_1"))).toBe(false);
    expect(await verifyCheckoutSignature("sec", "pay_1", "sub_2", hmac("sec", "pay_1|sub_1"))).toBe(false);
    expect(await verifyCheckoutSignature("", "pay_1", "sub_1", hmac("", "pay_1|sub_1"))).toBe(false);
  });
  it("verifies webhook body signatures and rejects tampering", async () => {
    const body = '{"event":"subscription.activated"}';
    expect(await verifyWebhookSignature("wh", body, hmac("wh", body))).toBe(true);
    expect(await verifyWebhookSignature("wh", body + " ", hmac("wh", body))).toBe(false);
    expect(await verifyWebhookSignature("wh", body, null)).toBe(false);
  });
  it("validates checkout result shape", () => {
    expect(() => parseCheckoutResult({ paymentId: "x", subscriptionId: "sub_1", signature: "a".repeat(64) })).toThrow();
    expect(parseCheckoutResult({ paymentId: "pay_A", subscriptionId: "sub_B", signature: "a".repeat(64) }).paymentId).toBe("pay_A");
  });
});

describe("webhook status mapping", () => {
  it("activates only on activated/charged", () => {
    expect(statusForEvent("subscription.activated")).toBe("ACTIVE");
    expect(statusForEvent("subscription.charged")).toBe("ACTIVE");
    expect(statusForEvent("subscription.authenticated")).toBeNull();
    expect(statusForEvent("payment.failed")).toBeNull();
  });
  it("never revives ended subscriptions and allows idempotent repeats", () => {
    expect(canTransition("CANCELLED", "ACTIVE")).toBe(false);
    expect(canTransition("EXPIRED", "ACTIVE")).toBe(false);
    expect(canTransition("ACTIVE", "ACTIVE")).toBe(true);
    expect(canTransition("PENDING_PAYMENT", "ACTIVE")).toBe(true);
  });
});
