CREATE TABLE public.razorpay_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  provider_subscription_id text,
  processed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.razorpay_webhook_events FROM anon, authenticated;
GRANT ALL ON public.razorpay_webhook_events TO service_role;
ALTER TABLE public.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX platform_payments_txn_ref_uniq ON public.platform_payments (transaction_reference) WHERE transaction_reference IS NOT NULL;