ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS razorpay_plan_id text UNIQUE;
ALTER TABLE public.clinic_subscriptions ADD COLUMN IF NOT EXISTS clinic_scope text CHECK (clinic_scope IN ('SINGLE','MULTI'));
ALTER TABLE public.clinic_subscriptions ADD COLUMN IF NOT EXISTS provider_subscription_id text UNIQUE;
UPDATE public.plans SET razorpay_plan_id = 'plan_TmF728bOa4bS1B' WHERE id = '325c512c-8fa0-44a7-a715-50721f4f600a';
UPDATE public.plans SET razorpay_plan_id = 'plan_TmF7ks8neo1irA' WHERE id = '1e3f9c20-e4e9-4428-a052-55b0104f702d';
UPDATE public.plans SET razorpay_plan_id = 'plan_TmF8ANd9FuK2mo' WHERE id = 'a65ca363-6487-442d-bda0-f66025a751f5';
UPDATE public.plans SET razorpay_plan_id = 'plan_TmF8SPfcZ4yhbE' WHERE id = '933f7a77-9322-47e0-9f54-1be0a72529ee';
UPDATE public.plans SET razorpay_plan_id = 'plan_TmF8pp5HDah9WT' WHERE id = '7ad45bad-0890-49de-9aee-e24edababbc0';