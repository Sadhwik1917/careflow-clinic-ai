-- Max AI's internal monthly threshold is admin-only. Clinic members see only whether responses are slowed.
REVOKE SELECT ON public.plans FROM anon, authenticated;
GRANT SELECT (id, name, description, price, currency, billing_cycle, trial_enabled, trial_duration_days, multi_price, clinic_mode,
  ai_enabled, ai_credit_type, max_clinics, max_doctors, max_staff, features, is_active, requires_payment_mandate,
  razorpay_plan_id, razorpay_multi_plan_id, created_at, updated_at) ON public.plans TO anon, authenticated;

-- Visible limit per plan: LIMITED plans publish their allowance; UNLIMITED thresholds only for platform admins.
CREATE OR REPLACE FUNCTION public.plan_ai_credit_limits()
RETURNS TABLE(plan_id uuid, ai_credit_limit integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT p.id, CASE WHEN p.ai_credit_type = 'LIMITED' OR private.is_platform_admin() THEN p.ai_credit_limit END
  FROM public.plans p WHERE p.is_active OR private.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION public.clinic_ai_usage(p_clinic uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE per record; used int; admin boolean := private.is_platform_admin();
BEGIN
  IF NOT (private.has_clinic_role(p_clinic, ARRAY['OWNER','DOCTOR','STAFF']::public.member_role[]) OR admin) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT * INTO per FROM private.ai_period(p_clinic);
  IF per.subscription_id IS NULL OR per.credit_type = 'NONE' OR NOT private.clinic_is_operational(p_clinic) THEN RETURN jsonb_build_object('included', false); END IF;
  used := private.ai_used(per.subscription_id, per.period_start, per.period_end);
  RETURN jsonb_build_object('included', true, 'credit_type', per.credit_type,
    'limit', CASE WHEN per.credit_type = 'LIMITED' OR admin THEN per.credit_limit END,
    'throttled', per.credit_type = 'UNLIMITED' AND per.credit_limit IS NOT NULL AND used >= per.credit_limit,
    'used', used,
    'shared', (SELECT count(*) > 1 FROM public.subscription_clinics WHERE subscription_id = per.subscription_id),
    'period_start', per.period_start, 'period_end', per.period_end);
END $$;

CREATE OR REPLACE FUNCTION public.reserve_ai_credit(p_clinic uuid, p_feature text, p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE uid uuid := auth.uid(); per record; used int; existing record; over boolean;
BEGIN
  IF uid IS NULL OR NOT private.has_clinic_role(p_clinic, ARRAY['OWNER','DOCTOR','STAFF']::public.member_role[]) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF p_feature IS NULL OR length(p_feature) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'Invalid feature'; END IF;
  SELECT * INTO existing FROM public.ai_interactions WHERE id = p_request;
  IF FOUND THEN
    IF existing.user_id <> uid THEN RAISE EXCEPTION 'Not authorised'; END IF;
    RETURN jsonb_build_object('allowed', existing.status IN ('REQUESTED','COMPLETED'), 'duplicate', true, 'status', existing.status,
      'throttled', coalesce((existing.request_metadata->>'throttled')::boolean, false));
  END IF;
  IF NOT private.clinic_is_operational(p_clinic) THEN RAISE EXCEPTION 'AI_NOT_INCLUDED'; END IF;
  SELECT * INTO per FROM private.ai_period(p_clinic);
  IF per.subscription_id IS NULL OR per.credit_type = 'NONE' THEN RAISE EXCEPTION 'AI_NOT_INCLUDED'; END IF;
  PERFORM 1 FROM public.clinic_subscriptions WHERE id = per.subscription_id FOR UPDATE;
  used := private.ai_used(per.subscription_id, per.period_start, per.period_end);
  over := per.credit_limit IS NOT NULL AND used >= per.credit_limit;
  IF over AND per.credit_type = 'LIMITED' THEN
    INSERT INTO public.ai_interactions(id, clinic_id, user_id, feature, status, request_metadata, response_metadata)
    VALUES (p_request, p_clinic, uid, p_feature, 'BLOCKED', jsonb_build_object('subscription_id', per.subscription_id, 'reason', 'LIMIT_REACHED'), '{}');
    RETURN jsonb_build_object('allowed', false, 'reason', 'LIMIT_REACHED', 'used', used, 'limit', per.credit_limit, 'period_end', per.period_end);
  END IF;
  INSERT INTO public.ai_interactions(id, clinic_id, user_id, feature, status, request_metadata, response_metadata)
  VALUES (p_request, p_clinic, uid, p_feature, 'REQUESTED', jsonb_build_object('subscription_id', per.subscription_id, 'throttled', over,
          'period_start', per.period_start, 'period_end', per.period_end), '{}');
  RETURN jsonb_build_object('allowed', true, 'throttled', over, 'used', used + 1,
    'limit', CASE WHEN per.credit_type = 'LIMITED' THEN per.credit_limit END, 'period_end', per.period_end);
END $$;

REVOKE ALL ON FUNCTION public.plan_ai_credit_limits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_ai_credit_limits() TO authenticated;
REVOKE ALL ON FUNCTION public.clinic_ai_usage(uuid), public.reserve_ai_credit(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_ai_usage(uuid), public.reserve_ai_credit(uuid, text, uuid) TO authenticated;