import { describe, expect, it } from "vitest";
import { beforeCancelCutoff, decideEnrollment, trialTiming, type OpenSub } from "@/lib/subscription-rules";
import { canTransition, statusForEvent, verifyWebhookSignature } from "@/lib/razorpay-verify";

const hmac = async (secret: string, msg: string) => {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg))), b => b.toString(16).padStart(2, "0")).join("");
};

describe("mandated trial timing", () => {
  it("schedules the first Razorpay charge exactly 21 days after enrollment", () => {
    const now = new Date("2026-10-12T10:00:00Z");
    const { startAt, expireBy } = trialTiming(now);
    expect(startAt * 1000 - now.getTime()).toBe(21 * 86_400_000);
    expect(expireBy * 1000 - now.getTime()).toBe(30 * 60_000);
  });
  it("accepts cancellation until 1 hour before the first charge", () => {
    const end = "2026-11-02T10:00:00Z";
    expect(beforeCancelCutoff(end, new Date("2026-11-02T08:59:00Z"))).toBe(true);
    expect(beforeCancelCutoff(end, new Date("2026-11-02T09:30:00Z"))).toBe(false);
  });
});

describe("mandate authorization and conversion", () => {
  it("authorization (subscription.authenticated) doesn't itself change paid status", () => expect(statusForEvent("subscription.authenticated")).toBeNull());
  it("trial-end charge converts the trial to ACTIVE automatically", () => {
    expect(statusForEvent("subscription.charged")).toBe("ACTIVE");
    expect(canTransition("TRIAL_ACTIVE", "ACTIVE")).toBe(true);
  });
  it("failed charges go PAST_DUE and a later retry success reactivates", () => {
    expect(statusForEvent("subscription.pending")).toBe("PAST_DUE");
    expect(statusForEvent("subscription.halted")).toBe("PAST_DUE");
    expect(canTransition("PAST_DUE", "ACTIVE")).toBe(true);
  });
  it("cancelled trials are never revived by late or duplicate events", () => {
    for (const to of ["ACTIVE", "PAST_DUE", "CANCELLED"] as const) expect(canTransition("TRIAL_CANCELLED", to)).toBe(false);
  });
  it("no manual 'continue' checkout for an authorized trial", () => {
    const t: OpenSub = { id: "t", plan_id: "p1", clinic_scope: "SINGLE", status: "TRIAL_ACTIVE", provider_subscription_id: "sub_1", mandate_status: "AUTHORIZED" };
    expect(decideEnrollment([t], "p1", "SINGLE").kind).toBe("error");
  });
});

describe("webhook verification", () => {
  it("accepts only correctly signed bodies", async () => {
    const body = '{"event":"subscription.authenticated"}';
    const sig = await hmac("whsec", body);
    expect(await verifyWebhookSignature("whsec", body, sig)).toBe(true);
    expect(await verifyWebhookSignature("whsec", body + " ", sig)).toBe(false);
    expect(await verifyWebhookSignature("whsec", body, null)).toBe(false);
  });
});

import { isTrialUsed, trialErrorMessage } from "@/lib/subscription-rules";
describe("trial enrollment regression", () => {
  it("abandoned/pending enrollments don't use up the trial", () => {
    expect(isTrialUsed({ startedEvents: 0, lookupFailed: false, ownerRows: [{ subscription_type: "TRIAL", status: "PENDING_PAYMENT", mandate_status: "PENDING" }, { subscription_type: "TRIAL", status: "CANCELLED", mandate_status: "ABANDONED" }] })).toBe(false);
  });
  it("authorized or started trials count as used", () => {
    expect(isTrialUsed({ startedEvents: 0, lookupFailed: false, ownerRows: [{ subscription_type: "TRIAL", status: "TRIAL_CANCELLED", mandate_status: "AUTHORIZED" }] })).toBe(true);
    expect(isTrialUsed({ startedEvents: 1, lookupFailed: false, ownerRows: [] })).toBe(true);
    expect(isTrialUsed({ startedEvents: 0, lookupFailed: true, ownerRows: [] })).toBe(true);
  });
  it("an enrollment save failure gives a clear, safe message", () =>
    expect(trialErrorMessage('new row violates check constraint "clinic_subscriptions_check"', "enroll")).toMatch(/save your trial enrollment.*Nothing was charged/));
});
