ALTER TABLE public.plans ADD COLUMN multi_price numeric, ADD COLUMN razorpay_multi_plan_id text;

CREATE OR REPLACE FUNCTION public.start_clinic_trial(p_user uuid, p_clinic uuid, p_plan uuid, p_scope text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_plan public.plans%ROWTYPE; v_scope text; v_amount numeric; v_id uuid;
BEGIN
  PERFORM 1 FROM public.profiles WHERE id = p_user FOR UPDATE;
  PERFORM 1 FROM public.clinics WHERE id = p_clinic FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_members WHERE clinic_id = p_clinic AND user_id = p_user AND role = 'OWNER' AND status = 'ACTIVE') THEN RAISE EXCEPTION 'TRIAL_NOT_OWNER'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_verifications WHERE clinic_id = p_clinic AND status = 'APPROVED') THEN RAISE EXCEPTION 'TRIAL_NOT_APPROVED'; END IF;
  SELECT * INTO v_plan FROM public.plans WHERE id = p_plan;
  IF NOT FOUND OR NOT v_plan.is_active OR NOT v_plan.trial_enabled THEN RAISE EXCEPTION 'TRIAL_PLAN_UNAVAILABLE'; END IF;
  IF v_plan.clinic_mode = 'SINGLE_OR_MULTI' THEN
    IF p_scope NOT IN ('SINGLE','MULTI') OR p_scope IS NULL THEN RAISE EXCEPTION 'TRIAL_SCOPE_REQUIRED'; END IF;
    v_scope := p_scope;
  ELSE
    IF p_scope IS NOT NULL AND p_scope <> v_plan.clinic_mode::text THEN RAISE EXCEPTION 'TRIAL_SCOPE_MISMATCH'; END IF;
    v_scope := v_plan.clinic_mode::text;
  END IF;
  IF EXISTS (SELECT 1 FROM public.subscription_clinics sc JOIN public.clinic_subscriptions s ON s.id = sc.subscription_id
             WHERE sc.clinic_id = p_clinic AND s.status IN ('PENDING_PAYMENT','ACTIVE','TRIAL_ACTIVE','PAST_DUE')) THEN RAISE EXCEPTION 'TRIAL_CLINIC_HAS_SUBSCRIPTION'; END IF;
  IF EXISTS (SELECT 1 FROM public.trial_events te JOIN public.clinic_subscriptions s ON s.id = te.subscription_id
             WHERE te.event_type = 'TRIAL_STARTED' AND (s.owner_user_id = p_user OR te.clinic_id = p_clinic)) THEN RAISE EXCEPTION 'TRIAL_ALREADY_USED'; END IF;
  v_amount := CASE WHEN v_scope = 'MULTI' AND v_plan.multi_price IS NOT NULL THEN v_plan.multi_price ELSE v_plan.price END;
  INSERT INTO public.clinic_subscriptions (owner_user_id, plan_id, status, subscription_type, trial_start_date, trial_end_date, auto_renew,
      billing_cycle, amount, currency, start_date, clinic_scope)
    VALUES (p_user, p_plan, 'TRIAL_ACTIVE', 'TRIAL', now(), now() + interval '21 days', false, v_plan.billing_cycle, v_amount, v_plan.currency, now(), v_scope)
    RETURNING id INTO v_id;
  INSERT INTO public.subscription_clinics (subscription_id, clinic_id) VALUES (v_id, p_clinic);
  INSERT INTO public.trial_events (subscription_id, clinic_id, event_type, event_date, metadata)
    VALUES (v_id, p_clinic, 'TRIAL_STARTED', now(), jsonb_build_object('plan_id', p_plan, 'scope', v_scope));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_clinic_trial(p_user uuid, p_subscription uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.clinic_subscriptions%ROWTYPE; v_clinic uuid;
BEGIN
  SELECT * INTO v_row FROM public.clinic_subscriptions WHERE id = p_subscription FOR UPDATE;
  IF NOT FOUND OR v_row.owner_user_id <> p_user THEN RAISE EXCEPTION 'TRIAL_NOT_FOUND'; END IF;
  IF v_row.status <> 'TRIAL_ACTIVE' THEN RAISE EXCEPTION 'TRIAL_NOT_ACTIVE'; END IF;
  SELECT clinic_id INTO v_clinic FROM public.subscription_clinics WHERE subscription_id = p_subscription LIMIT 1;
  UPDATE public.clinic_subscriptions SET status = 'TRIAL_CANCELLED', trial_cancelled_at = now(), cancelled_at = now() WHERE id = p_subscription;
  INSERT INTO public.trial_events (subscription_id, clinic_id, event_type, event_date, metadata)
    VALUES (p_subscription, v_clinic, 'TRIAL_CANCELLED', now(), '{}'::jsonb);
  RETURN v_row.provider_subscription_id;
END $$;

CREATE OR REPLACE FUNCTION private.run_trial_maintenance()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  WITH due AS (
    SELECT s.id, s.owner_user_id, s.trial_end_date, sc.clinic_id FROM public.clinic_subscriptions s
    JOIN public.subscription_clinics sc ON sc.subscription_id = s.id
    WHERE s.status = 'TRIAL_ACTIVE' AND s.trial_end_date > now() AND s.trial_end_date <= now() + interval '3 days'
      AND NOT EXISTS (SELECT 1 FROM public.trial_events te WHERE te.subscription_id = s.id AND te.event_type = 'TRIAL_EXPIRY_REMINDER_SENT')
  ), n AS (
    INSERT INTO public.notifications (recipient_user_id, clinic_id, type, title, message, related_entity_type, related_entity_id)
    SELECT owner_user_id, clinic_id, 'TRIAL_EXPIRY_REMINDER', 'Your free trial ends soon',
           'Your CAREFLOW AI free trial ends on ' || to_char(trial_end_date AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY') || '. Continue to the full plan to keep your clinic running.',
           'clinic_subscription', id FROM due
  )
  INSERT INTO public.trial_events (subscription_id, clinic_id, event_type, event_date, metadata)
  SELECT id, clinic_id, 'TRIAL_EXPIRY_REMINDER_SENT', now(), '{}'::jsonb FROM due;

  WITH ex AS (
    UPDATE public.clinic_subscriptions SET status = 'TRIAL_EXPIRED' WHERE status = 'TRIAL_ACTIVE' AND trial_end_date <= now() RETURNING id
  )
  INSERT INTO public.trial_events (subscription_id, clinic_id, event_type, event_date, metadata)
  SELECT ex.id, sc.clinic_id, 'TRIAL_EXPIRED', now(), '{}'::jsonb FROM ex LEFT JOIN public.subscription_clinics sc ON sc.subscription_id = ex.id;
END $$;

REVOKE ALL ON FUNCTION public.start_clinic_trial(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_clinic_trial(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.run_trial_maintenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_clinic_trial(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_clinic_trial(uuid, uuid) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('careflow-trial-maintenance', '30 3 * * *', $$SELECT private.run_trial_maintenance();$$);