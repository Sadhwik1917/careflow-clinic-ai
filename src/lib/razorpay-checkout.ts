// Browser-only Razorpay Checkout wrapper. Only the public key id reaches the browser.
type RzResponse = { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string };
type RzInstance = { open: () => void; on: (e: string, cb: (r: { error?: { description?: string } }) => void) => void };
declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => RzInstance } }

export type CheckoutOutcome =
  | { kind: "paid"; result: { paymentId: string; subscriptionId: string; signature: string } }
  | { kind: "dismissed" } | { kind: "failed"; reason?: string } | { kind: "load_error" };

let loading: Promise<boolean> | null = null;
function loadScript(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  loading ??= new Promise(resolve => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(!!window.Razorpay);
    s.onerror = () => { loading = null; resolve(false); };
    document.body.appendChild(s);
  });
  return loading;
}

export async function openSubscriptionCheckout(o: { keyId: string; subscriptionId: string; name: string; description: string }): Promise<CheckoutOutcome> {
  if (!(await loadScript()) || !window.Razorpay) return { kind: "load_error" };
  return new Promise(resolve => {
    let failure: string | undefined;
    const rz = new window.Razorpay!({
      key: o.keyId, subscription_id: o.subscriptionId, name: o.name, description: o.description,
      handler: (r: RzResponse) => resolve({ kind: "paid", result: { paymentId: r.razorpay_payment_id, subscriptionId: r.razorpay_subscription_id, signature: r.razorpay_signature } }),
      modal: { ondismiss: () => resolve(failure ? { kind: "failed", reason: failure } : { kind: "dismissed" }) },
    });
    rz.on("payment.failed", r => { failure = r.error?.description ?? "Payment failed"; });
    rz.open();
  });
}
