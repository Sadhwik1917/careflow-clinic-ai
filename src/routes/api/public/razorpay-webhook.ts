import { createFileRoute } from "@tanstack/react-router";
import { canTransition, statusForEvent, verifyWebhookSignature } from "@/lib/razorpay-verify";

type RzEntity = { id?: string; status?: string; current_start?: number; current_end?: number; amount?: number; currency?: string; method?: string };
type RzEvent = { event?: string; payload?: { subscription?: { entity?: RzEntity }; payment?: { entity?: RzEntity } } };

const ts = (s?: number) => (typeof s === "number" ? new Date(s * 1000).toISOString() : undefined);

// Public route: the only trust is the HMAC signature made with RAZORPAY_WEBHOOK_SECRET.
// Status changes here are the only path that can make a subscription ACTIVE.
export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["RAZORPAY_WEBHOOK_SECRET"];
        if (!secret) { console.error("[razorpay-webhook] secret missing"); return new Response("Not configured", { status: 503 }); }
        const raw = await request.text();
        if (!(await verifyWebhookSignature(secret, raw, request.headers.get("x-razorpay-signature"))))
          return new Response("Invalid signature", { status: 401 });

        let evt: RzEvent;
        try { evt = JSON.parse(raw) as RzEvent; } catch { return new Response("Bad payload", { status: 400 }); }
        const eventId = request.headers.get("x-razorpay-event-id");
        const type = evt.event ?? "";
        const sub = evt.payload?.subscription?.entity;
        if (!eventId || !type) return new Response("Missing event id", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Idempotency: the event id is a primary key, so a replay is acknowledged and skipped.
        const claim = await supabaseAdmin.from("razorpay_webhook_events").insert({ event_id: eventId, event_type: type, provider_subscription_id: sub?.id ?? null });
        if (claim.error) {
          if (claim.error.code === "23505") return new Response("Duplicate", { status: 200 });
          console.error("[razorpay-webhook] claim failed", claim.error.message);
          return new Response("Retry", { status: 500 });
        }
        const release = async () => { await supabaseAdmin.from("razorpay_webhook_events").delete().eq("event_id", eventId); };

        try {
          const to = statusForEvent(type);
          if (!sub?.id || !to) return new Response("Ignored", { status: 200 });
          const row = await supabaseAdmin.from("clinic_subscriptions").select("id, status, owner_user_id")
            .eq("payment_provider", "razorpay").eq("provider_subscription_id", sub.id).maybeSingle();
          if (row.error) throw new Error(row.error.message);
          if (!row.data) return new Response("Unknown subscription", { status: 200 });
          if (!canTransition(row.data.status, to)) return new Response("Ignored", { status: 200 });

          const update: Record<string, unknown> = { status: to };
          if (to === "ACTIVE") {
            if (sub.current_start) update["renewal_date"] = ts(sub.current_end);
            if (sub.current_end) update["next_billing_date"] = ts(sub.current_end);
          }
          if (to === "CANCELLED") update["cancelled_at"] = new Date().toISOString();
          const up = await supabaseAdmin.from("clinic_subscriptions").update(update).eq("id", row.data.id);
          if (up.error) throw new Error(up.error.message);

          const pay = evt.payload?.payment?.entity;
          if (type === "subscription.charged" && pay?.id && typeof pay.amount === "number") {
            const ins = await supabaseAdmin.from("platform_payments").insert({
              subscription_id: row.data.id, owner_user_id: row.data.owner_user_id, amount: pay.amount / 100,
              currency: pay.currency ?? "INR", payment_method: pay.method ?? null, transaction_reference: pay.id,
              status: "SUCCESS", paid_at: new Date().toISOString(),
            });
            if (ins.error && ins.error.code !== "23505") throw new Error(ins.error.message);
          }
          return new Response("OK", { status: 200 });
        } catch (e) {
          console.error("[razorpay-webhook] processing failed", type, e instanceof Error ? e.message : e);
          await release();
          return new Response("Retry", { status: 500 });
        }
      },
    },
  },
});
