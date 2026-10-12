import { createFileRoute } from "@tanstack/react-router";
import { supersede } from "@/lib/subscriptions.server";
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
          // Mandate authorized for a trial enrollment: the trusted DB function starts the 21-day trial.
          if (type === "subscription.authenticated" && sub?.id) {
            const pay = evt.payload?.payment?.entity;
            const r = await supabaseAdmin.rpc("confirm_trial_mandate", { p_provider_id: sub.id, p_mandate_ref: pay?.id ?? sub.id });
            if (r.error) throw new Error(r.error.message);
            if (r.data === "TRIAL_ALREADY_USED" || r.data === "TOO_LATE") {
              const { cancelAtRazorpay } = await import("@/lib/subscriptions.server");
              await cancelAtRazorpay(sub.id);
              await supabaseAdmin.from("clinic_subscriptions").update({ status: "CANCELLED", cancelled_at: new Date().toISOString(), mandate_status: "REJECTED" }).eq("provider_subscription_id", sub.id).eq("status", "PENDING_PAYMENT");
            }
            return new Response("OK", { status: 200 });
          }
          const to = statusForEvent(type);
          if (!sub?.id || !to) return new Response("Ignored", { status: 200 });
          const row = await supabaseAdmin.from("clinic_subscriptions").select("id, status, owner_user_id, subscription_type")
            .eq("payment_provider", "razorpay").eq("provider_subscription_id", sub.id).maybeSingle();
          if (row.error) throw new Error(row.error.message);
          if (!row.data) return new Response("Unknown subscription", { status: 200 });
          if (!canTransition(row.data.status, to)) return new Response("Ignored", { status: 200 });

          if (row.data.status === to && to !== "ACTIVE") return new Response("OK", { status: 200 });
          const trialEnding = row.data.status === "TRIAL_ACTIVE" && to === "CANCELLED";
          const update: { status: typeof to | "TRIAL_CANCELLED"; trial_cancelled_at?: string; mandate_status?: string; subscription_type?: "PAID"; next_billing_date?: string; renewal_date?: string; cancelled_at?: string } = { status: to };
          const activating = to === "ACTIVE" && row.data.status !== "ACTIVE";
          if (activating) update.subscription_type = "PAID";
          if (to === "ACTIVE") {
            if (sub.current_end) { update.next_billing_date = ts(sub.current_end)!; update.renewal_date = ts(sub.current_end)!; }
          }
          if (to === "CANCELLED") update.cancelled_at = new Date().toISOString();
          if (trialEnding) { update.status = "TRIAL_CANCELLED"; update.trial_cancelled_at = update.cancelled_at; update.mandate_status = "CANCELLED"; }
          // Conditional on the status we read, so a concurrent event can't be overwritten out of order.
          const up = await supabaseAdmin.from("clinic_subscriptions").update(update).eq("id", row.data.id).eq("status", row.data.status as never).select("id");
          if (up.error) throw new Error(up.error.message);
          if (!up.data?.length) throw new Error("status changed concurrently");
          if (trialEnding) {
            const link = await supabaseAdmin.from("subscription_clinics").select("clinic_id").eq("subscription_id", row.data.id).maybeSingle();
            await supabaseAdmin.from("trial_events").insert({ subscription_id: row.data.id, clinic_id: link.data?.clinic_id ?? null, event_type: "TRIAL_CANCELLED", event_date: new Date().toISOString(), metadata: { source: "razorpay" } });
          }
          if (to === "PAST_DUE" && row.data.status.startsWith("TRIAL_")) {
            const link = await supabaseAdmin.from("subscription_clinics").select("clinic_id").eq("subscription_id", row.data.id).maybeSingle();
            await supabaseAdmin.from("trial_events").insert({ subscription_id: row.data.id, clinic_id: link.data?.clinic_id ?? null, event_type: "PAYMENT_FAILED", event_date: new Date().toISOString(), metadata: { event: type } });
          }

          if (activating) {
            const link = await supabaseAdmin.from("subscription_clinics").select("clinic_id").eq("subscription_id", row.data.id).maybeSingle();
            const clinicId = link.data?.clinic_id;
            if (row.data.status.startsWith("TRIAL_"))
              await supabaseAdmin.from("trial_events").insert({ subscription_id: row.data.id, clinic_id: clinicId ?? null, event_type: "TRIAL_CONVERTED", event_date: new Date().toISOString(), metadata: {} });
            if (clinicId) {
              // Upgrade/conversion: the verified plan replaces any other open plan or checkout for this clinic.
              const others = await supabaseAdmin.from("subscription_clinics").select("subscription:clinic_subscriptions(id, status, provider_subscription_id)").eq("clinic_id", clinicId);
              const stale = (others.data ?? []).map(o => o.subscription).filter((o): o is NonNullable<typeof o> => !!o && o.id !== row.data!.id && ["PENDING_PAYMENT", "ACTIVE", "PAST_DUE", "TRIAL_ACTIVE"].includes(o.status));
              await supersede(supabaseAdmin, stale);
            }
          }

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
