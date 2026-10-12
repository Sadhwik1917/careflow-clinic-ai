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
  -- trial_start_date is the enrollment time (required for TRIAL rows); confirm_trial_mandate resets it when authorization is verified.
  INSERT INTO public.clinic_subscriptions (owner_user_id, plan_id, status, subscription_type, trial_start_date, trial_end_date, auto_renew,
      billing_cycle, amount, currency, clinic_scope, payment_provider, provider_subscription_id, mandate_status, next_billing_date)
    VALUES (p_user, p_plan, 'PENDING_PAYMENT', 'TRIAL', now(), p_trial_end, true, v_plan.billing_cycle, v_amount, v_plan.currency, v_scope,
      'razorpay', p_provider_id, 'PENDING', p_trial_end)
    RETURNING id INTO v_id;
  INSERT INTO public.subscription_clinics (subscription_id, clinic_id) VALUES (v_id, p_clinic);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.begin_mandated_trial(uuid, uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_mandated_trial(uuid, uuid, uuid, text, text, timestamptz) TO service_role;