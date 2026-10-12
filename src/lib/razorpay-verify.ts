// Pure Razorpay signature checks and webhook event mapping; shared by server code and tests.
// Uses Web Crypto so it runs on the Worker runtime.

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Checkout handler signature for subscriptions: HMAC_SHA256(payment_id + "|" + subscription_id, key_secret). */
export async function verifyCheckoutSignature(secret: string, paymentId: string, subscriptionId: string, signature: string): Promise<boolean> {
  if (!secret || !paymentId || !subscriptionId || !signature) return false;
  return safeEqual(await hmacHex(secret, `${paymentId}|${subscriptionId}`), signature.toLowerCase());
}

/** Webhook signature: HMAC_SHA256(raw body, webhook secret) in the X-Razorpay-Signature header. */
export async function verifyWebhookSignature(secret: string, rawBody: string, signature: string | null): Promise<boolean> {
  if (!secret || !signature) return false;
  return safeEqual(await hmacHex(secret, rawBody), signature.toLowerCase());
}

export type SubStatus = "PENDING_PAYMENT" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";

/** Status a verified webhook event moves the subscription to, or null if the event doesn't change status. */
export function statusForEvent(event: string): SubStatus | null {
  switch (event) {
    case "subscription.activated":
    case "subscription.charged": return "ACTIVE";
    case "subscription.pending":
    case "subscription.halted": return "PAST_DUE";
    case "subscription.cancelled": return "CANCELLED";
    case "subscription.completed": return "EXPIRED";
    default: return null;
  }
}

/** Ended subscriptions never come back to life from a later or replayed event. */
export function canTransition(from: string, to: SubStatus): boolean {
  if (from === to) return true;
  if (from === "CANCELLED" || from === "EXPIRED") return false;
  return ["PENDING_PAYMENT", "ACTIVE", "PAST_DUE"].includes(from);
}

export function parseCheckoutResult(body: unknown): { paymentId: string; subscriptionId: string; signature: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const ok = (v: unknown, re: RegExp) => typeof v === "string" && re.test(v);
  if (!ok(b["paymentId"], /^pay_[A-Za-z0-9]+$/) || !ok(b["subscriptionId"], /^sub_[A-Za-z0-9]+$/) || !ok(b["signature"], /^[a-f0-9]{64}$/i))
    throw new Error("Invalid payment result");
  return { paymentId: b["paymentId"] as string, subscriptionId: b["subscriptionId"] as string, signature: b["signature"] as string };
}
