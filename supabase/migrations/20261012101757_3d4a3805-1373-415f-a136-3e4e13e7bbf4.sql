ALTER TABLE public.clinic_subscriptions
  ADD COLUMN IF NOT EXISTS mandate_status text,
  ADD COLUMN IF NOT EXISTS mandate_authorized_at timestamptz;

-- Step 1: create the unpaid trial enrollment once the Razorpay subscription (start_at = trial end) exists.
CREATE OR REPLACE FUNCTION public.begin_mandated_trial(p_user uuid, p_clinic uuid, p_plan uuid, p_scope text, p_provider_id text, p_trial_end timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_plan public.plans%ROWTYPE; v_scope text; v_amount numeric; v_id uuid;
BEGIN
  PERFORM 1 FROM public.profiles WHERE id = p_user FOR UPDATE;
  PERFORM 1 FROM public.clinics WHERE id = p_clinic FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_members WHERE clinic_id = p_clinic AND user_id = p_user AND role = 'OWNER' AND status = 'ACTIVE') THEN RAISE EXCEPTION 'TRIAL_NOT_OWNER'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_verifications WHERE clinic_id = p_clinic AND status = 'APPROVED') THEN RAISE EXCEPTION 'TRIAL_NOT_APPROVED'; END IF;
  SELECT * INTO v_plan FROM public.plans WHERE id = p_plan;
  IF NOT FOUND OR NOT v_plan.is_active OR NOT v_plan.trial_enabled THEN RAISE EXCEPTION 'TRIAL_PLAN_UNAVAILABLE'; END IF;
  IF v_plan.clinic_mode = 'SINGLE_OR_MULTI' THEN
    IF p_scope IS NULL OR p_scope NOT IN ('SINGLE','MULTI') THEN RAISE EXCEPTION 'TRIAL_SCOPE_REQUIRED'; END IF;
    v_scope := p_scope;
  ELSE
    IF p_scope IS NOT NULL AND p_scope <> v_plan.clinic_mode::text THEN RAISE EXCEPTION 'TRIAL_SCOPE_MISMATCH'; END IF;
    v_scope := v_plan.clinic_mode::text;
  END IF;
  IF p_trial_end < now() + interval '20 days 23 hours' OR p_trial_end > now() + interval '21 days 1 hour' THEN RAISE EXCEPTION 'TRIAL_BAD_TIMING'; END IF;
  IF EXISTS (SELECT 1 FROM public.subscription_clinics sc JOIN public.clinic_subscriptions s ON s.id = sc.subscription_id
             WHERE sc.clinic_id = p_clinic AND s.status IN ('PENDING_PAYMENT','ACTIVE','TRIAL_ACTIVE','PAST_DUE')) THEN RAISE EXCEPTION 'TRIAL_CLINIC_HAS_SUBSCRIPTION'; END IF;
  IF EXISTS (SELECT 1 FROM public.trial_events te JOIN public.clinic_subscriptions s ON s.id = te.subscription_id
             WHERE te.event_type = 'TRIAL_STARTED' AND (s.owner_user_id = p_user OR te.clinic_id = p_clinic)) THEN RAISE EXCEPTION 'TRIAL_ALREADY_USED'; END IF;
  v_amount := CASE WHEN v_scope = 'MULTI' AND v_plan.multi_price IS NOT NULL THEN v_plan.multi_price ELSE v_plan.price END;
  INSERT INTO public.clinic_subscriptions (owner_user_id, plan_id, status, subscription_type, trial_end_date, auto_renew,
      billing_cycle, amount, currency, clinic_scope, payment_provider, provider_subscription_id, mandate_status, next_billing_date)
    VALUES (p_user, p_plan, 'PENDING_PAYMENT', 'TRIAL', p_trial_end, true, v_plan.billing_cycle, v_amount, v_plan.currency, v_scope,
      'razorpay', p_provider_id, 'PENDING', p_trial_end)
    RETURNING id INTO v_id;
  INSERT INTO public.subscription_clinics (subscription_id, clinic_id) VALUES (v_id, p_clinic);
  RETURN v_id;
END $$;

-- Step 2: only the verified subscription.authenticated webhook starts the trial.
CREATE OR REPLACE FUNCTION public.confirm_trial_mandate(p_provider_id text, p_mandate_ref text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_row public.clinic_subscriptions%ROWTYPE; v_clinic uuid;
BEGIN
  SELECT * INTO v_row FROM public.clinic_subscriptions WHERE provider_subscription_id = p_provider_id AND payment_provider = 'razorpay' FOR UPDATE;
  IF NOT FOUND THEN RETURN 'UNKNOWN'; END IF;
  IF v_row.subscription_type <> 'TRIAL' OR v_row.status <> 'PENDING_PAYMENT' OR v_row.mandate_status <> 'PENDING' THEN RETURN 'IGNORED'; END IF;
  SELECT clinic_id INTO v_clinic FROM public.subscription_clinics WHERE subscription_id = v_row.id LIMIT 1;
  IF EXISTS (SELECT 1 FROM public.trial_events te JOIN public.clinic_subscriptions s ON s.id = te.subscription_id
             WHERE te.event_type = 'TRIAL_STARTED' AND (s.owner_user_id = v_row.owner_user_id OR te.clinic_id = v_clinic)) THEN RETURN 'TRIAL_ALREADY_USED'; END IF;
  IF v_row.trial_end_date <= now() THEN RETURN 'TOO_LATE'; END IF;
  UPDATE public.clinic_subscriptions SET status = 'TRIAL_ACTIVE', trial_start_date = now(), start_date = now(),
    mandate_status = 'AUTHORIZED', mandate_authorized_at = now(), payment_mandate_id = p_mandate_ref WHERE id = v_row.id;
  INSERT INTO public.trial_events (subscription_id, clinic_id, event_type, event_date, metadata)
    VALUES (v_row.id, v_clinic, 'TRIAL_STARTED', now(), jsonb_build_object('plan_id', v_row.plan_id, 'scope', v_row.clinic_scope, 'mandate', 'AUTHORIZED', 'first_charge_at', v_row.trial_end_date));
  RETURN 'STARTED';
END $$;

REVOKE ALL ON FUNCTION public.begin_mandated_trial(uuid, uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_trial_mandate(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_mandated_trial(uuid, uuid, uuid, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_trial_mandate(text, text) TO service_role;
-- The no-mandate trial path is retired.
REVOKE ALL ON FUNCTION public.start_clinic_trial(uuid, uuid, uuid, text) FROM service_role;

-- Reminder text reflects automatic conversion; mandated trials get a 2-day grace for Razorpay's first charge before expiring.
CREATE OR REPLACE FUNCTION private.run_trial_maintenance()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  WITH due AS (
    SELECT s.id, s.owner_user_id, s.trial_end_date, s.amount, s.mandate_status, sc.clinic_id FROM public.clinic_subscriptions s
    JOIN public.subscription_clinics sc ON sc.subscription_id = s.id
    WHERE s.status = 'TRIAL_ACTIVE' AND s.trial_end_date > now() AND s.trial_end_date <= now() + interval '3 days'
      AND NOT EXISTS (SELECT 1 FROM public.trial_events te WHERE te.subscription_id = s.id AND te.event_type = 'TRIAL_EXPIRY_REMINDER_SENT')
  ), n AS (
    INSERT INTO public.notifications (recipient_user_id, clinic_id, type, title, message, related_entity_type, related_entity_id)
    SELECT owner_user_id, clinic_id, 'TRIAL_EXPIRY_REMINDER', 'Your free trial ends soon',
           CASE WHEN mandate_status = 'AUTHORIZED' THEN
             'Your CAREFLOW AI free trial ends on ' || to_char(trial_end_date AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') || ' IST. Your plan then renews automatically at ₹' || to_char(amount, 'FM999,999,990') || '/month using your authorized payment method. Cancel the free trial before then to avoid being charged.'
           ELSE 'Your CAREFLOW AI free trial ends on ' || to_char(trial_end_date AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY') || '. Continue to the full plan to keep your clinic running.' END,
           'clinic_subscription', id FROM due
  )
  INSERT INTO public.trial_events (subscription_id, clinic_id, event_type, event_date, metadata)
  SELECT id, clinic_id, 'TRIAL_EXPIRY_REMINDER_SENT', now(), '{}'::jsonb FROM due;

  WITH ex AS (
    UPDATE public.clinic_subscriptions SET status = 'TRIAL_EXPIRED'
    WHERE status = 'TRIAL_ACTIVE' AND (
      (coalesce(mandate_status, '') <> 'AUTHORIZED' AND trial_end_date <= now()) OR
      (mandate_status = 'AUTHORIZED' AND trial_end_date <= now() - interval '2 days'))
    RETURNING id
  )
  INSERT INTO public.trial_events (subscription_id, clinic_id, event_type, event_date, metadata)
  SELECT ex.id, sc.clinic_id, 'TRIAL_EXPIRED', now(), '{}'::jsonb FROM ex LEFT JOIN public.subscription_clinics sc ON sc.subscription_id = ex.id;

  -- Unauthorized trial enrollments that were never completed are closed after a day.
  UPDATE public.clinic_subscriptions SET status = 'CANCELLED', cancelled_at = now(), mandate_status = 'ABANDONED'
  WHERE status = 'PENDING_PAYMENT' AND subscription_type = 'TRIAL' AND mandate_status = 'PENDING' AND created_at < now() - interval '1 day';
END $$;