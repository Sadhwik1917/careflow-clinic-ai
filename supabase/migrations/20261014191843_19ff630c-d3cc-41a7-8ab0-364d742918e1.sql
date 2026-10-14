-- Phase 2E.3: AI credit metering. 1 credit per successful request; shared pool per subscription; monthly period anchored on the subscription's billing date.
UPDATE public.plans SET ai_credit_limit = 2000, updated_at = now() WHERE name = 'Max AI' AND ai_credit_type = 'UNLIMITED';

CREATE INDEX IF NOT EXISTS ai_interactions_sub_period_idx ON public.ai_interactions ((request_metadata->>'subscription_id'), created_at);

-- Effective AI subscription + current billing period for a clinic.
CREATE OR REPLACE FUNCTION private.ai_period(p_clinic uuid)
RETURNS TABLE(subscription_id uuid, credit_type public.ai_credit_type, credit_limit integer, period_start timestamptz, period_end timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE s record; anchor timestamptz; n int;
BEGIN
  SELECT cs.id, cs.status, cs.start_date, cs.trial_start_date, p.ai_credit_type, p.ai_credit_limit INTO s
    FROM public.subscription_clinics sc JOIN public.clinic_subscriptions cs ON cs.id = sc.subscription_id JOIN public.plans p ON p.id = cs.plan_id
   WHERE sc.clinic_id = p_clinic AND p.ai_enabled
     AND (cs.status = 'ACTIVE' OR (cs.status = 'TRIAL_ACTIVE' AND cs.trial_end_date > now()))
   ORDER BY (cs.status = 'ACTIVE') DESC, cs.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  anchor := CASE WHEN s.status = 'TRIAL_ACTIVE' THEN coalesce(s.trial_start_date, s.start_date) ELSE s.start_date END;
  n := greatest(0, (extract(year FROM age(now(), anchor)) * 12 + extract(month FROM age(now(), anchor)))::int);
  subscription_id := s.id; credit_type := s.ai_credit_type; credit_limit := s.ai_credit_limit;
  period_start := anchor + make_interval(months => n); period_end := anchor + make_interval(months => n + 1);
  RETURN NEXT;
END $$;

-- Used = completed requests + in-flight reservations (< 10 min old) in the period, across the whole subscription.
CREATE OR REPLACE FUNCTION private.ai_used(p_sub uuid, p_from timestamptz, p_to timestamptz)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT count(*)::int FROM public.ai_interactions i
   WHERE i.request_metadata->>'subscription_id' = p_sub::text AND i.created_at >= p_from AND i.created_at < p_to
     AND (i.status = 'COMPLETED' OR (i.status = 'REQUESTED' AND i.created_at > now() - interval '10 minutes'));
$$;

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
  PERFORM 1 FROM public.clinic_subscriptions WHERE id = per.subscription_id FOR UPDATE; -- serialises concurrent reservations
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
  RETURN jsonb_build_object('allowed', true, 'throttled', over, 'used', used + 1, 'limit', per.credit_limit, 'period_end', per.period_end);
END $$;

CREATE OR REPLACE FUNCTION public.finish_ai_credit(p_request uuid, p_success boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE i record;
BEGIN
  SELECT * INTO i FROM public.ai_interactions WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR i.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF i.status <> 'REQUESTED' THEN RETURN i.status::text; END IF; -- already settled: never charge twice
  IF p_success THEN
    UPDATE public.ai_interactions SET status = 'COMPLETED', response_metadata = jsonb_build_object('finished_at', now()) WHERE id = p_request;
    INSERT INTO public.ai_usage(clinic_id, user_id, feature, credits_used, period_start, period_end)
    VALUES (i.clinic_id, i.user_id, i.feature, 1, (i.request_metadata->>'period_start')::timestamptz, (i.request_metadata->>'period_end')::timestamptz);
    RETURN 'COMPLETED';
  END IF;
  UPDATE public.ai_interactions SET status = 'FAILED', response_metadata = jsonb_build_object('finished_at', now()) WHERE id = p_request;
  RETURN 'FAILED';
END $$;

CREATE OR REPLACE FUNCTION public.clinic_ai_usage(p_clinic uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE per record;
BEGIN
  IF NOT (private.has_clinic_role(p_clinic, ARRAY['OWNER','DOCTOR','STAFF']::public.member_role[]) OR private.is_platform_admin()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT * INTO per FROM private.ai_period(p_clinic);
  IF per.subscription_id IS NULL OR per.credit_type = 'NONE' OR NOT private.clinic_is_operational(p_clinic) THEN RETURN jsonb_build_object('included', false); END IF;
  RETURN jsonb_build_object('included', true, 'credit_type', per.credit_type, 'limit', per.credit_limit,
    'used', private.ai_used(per.subscription_id, per.period_start, per.period_end),
    'shared', (SELECT count(*) > 1 FROM public.subscription_clinics WHERE subscription_id = per.subscription_id),
    'period_start', per.period_start, 'period_end', per.period_end);
END $$;

REVOKE ALL ON FUNCTION private.ai_period(uuid), private.ai_used(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_ai_credit(uuid, text, uuid), public.finish_ai_credit(uuid, boolean), public.clinic_ai_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_ai_credit(uuid, text, uuid), public.finish_ai_credit(uuid, boolean), public.clinic_ai_usage(uuid) TO authenticated;