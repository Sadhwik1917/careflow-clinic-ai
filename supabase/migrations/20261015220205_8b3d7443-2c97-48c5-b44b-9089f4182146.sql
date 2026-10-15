CREATE OR REPLACE FUNCTION public.ai_reserve_credit_as(p_user uuid, p_clinic uuid, p_feature text, p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE prev text := current_setting('request.jwt.claims', true); prev_sub text := current_setting('request.jwt.claim.sub', true); r jsonb;
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  r := public.reserve_ai_credit(p_clinic, p_feature, p_request);
  PERFORM set_config('request.jwt.claims', coalesce(prev, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(prev_sub, ''), true);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.ai_finish_credit_as(p_user uuid, p_request uuid, p_success boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE prev text := current_setting('request.jwt.claims', true); prev_sub text := current_setting('request.jwt.claim.sub', true); r text;
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  r := public.finish_ai_credit(p_request, p_success);
  PERFORM set_config('request.jwt.claims', coalesce(prev, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(prev_sub, ''), true);
  RETURN r;
END $$;

REVOKE EXECUTE ON FUNCTION public.ai_reserve_credit_as(uuid,uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_finish_credit_as(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_reserve_credit_as(uuid,uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_finish_credit_as(uuid,uuid,boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.reserve_ai_credit(uuid,text,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.finish_ai_credit(uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;