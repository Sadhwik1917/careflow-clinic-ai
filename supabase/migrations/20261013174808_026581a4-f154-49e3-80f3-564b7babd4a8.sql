-- 1. Clinic status changes only through trusted functions
CREATE OR REPLACE FUNCTION private.protect_clinic_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND (SELECT auth.uid()) IS NOT NULL
     AND coalesce(current_setting('careflow.trusted_status_change', true), '') <> NEW.id::text THEN
    RAISE EXCEPTION 'Clinic status can only be changed through an administrator action' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_clinic_status BEFORE UPDATE ON public.clinics FOR EACH ROW EXECUTE FUNCTION private.protect_clinic_status();

-- 2. Suspension is enforced by the existing operational gate (used by every restrictive policy)
CREATE OR REPLACE FUNCTION private.clinic_is_operational(p_clinic uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = p_clinic AND c.status = 'ACTIVE')
     AND EXISTS (SELECT 1 FROM public.clinic_verifications v WHERE v.clinic_id = p_clinic AND v.status = 'APPROVED')
     AND EXISTS (SELECT 1 FROM public.subscription_clinics sc JOIN public.clinic_subscriptions s ON s.id = sc.subscription_id
                 WHERE sc.clinic_id = p_clinic AND (s.status = 'ACTIVE' OR (s.status = 'TRIAL_ACTIVE' AND s.trial_end_date > now())));
$$;

-- 3. Admin action against an already-approved clinic
CREATE OR REPLACE FUNCTION public.admin_clinic_action(p_clinic uuid, p_action text, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v public.clinic_verifications; c public.clinics; r text := nullif(btrim(p_reason), ''); uid uuid := (SELECT auth.uid());
BEGIN
  IF uid IS NULL OR NOT private.is_platform_admin() THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF p_action NOT IN ('SUSPEND','REVOKE','REINSTATE') THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
  IF r IS NULL THEN RAISE EXCEPTION 'A reason is required' USING ERRCODE='22023'; END IF;
  IF char_length(r) > 1000 THEN RAISE EXCEPTION 'Reason is too long' USING ERRCODE='22023'; END IF;
  SELECT * INTO c FROM public.clinics WHERE id = p_clinic FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clinic not found' USING ERRCODE='22023'; END IF;
  SELECT * INTO v FROM public.clinic_verifications WHERE clinic_id = p_clinic FOR UPDATE;
  IF NOT FOUND OR v.status <> 'APPROVED' THEN RAISE EXCEPTION 'Only approved clinics can be acted on here; use the verification review instead' USING ERRCODE='42501'; END IF;

  IF p_action = 'SUSPEND' THEN
    IF c.status = 'SUSPENDED' THEN RAISE EXCEPTION 'Clinic is already suspended' USING ERRCODE='22023'; END IF;
    PERFORM set_config('careflow.trusted_status_change', p_clinic::text, true);
    UPDATE public.clinics SET status = 'SUSPENDED' WHERE id = p_clinic;
    INSERT INTO public.verification_events (clinic_id, cycle, event_type, from_status, to_status, actor_user_id, reason)
      VALUES (p_clinic, v.cycle, 'SUSPENDED', 'APPROVED', 'APPROVED', uid, r);
  ELSIF p_action = 'REINSTATE' THEN
    IF c.status <> 'SUSPENDED' THEN RAISE EXCEPTION 'Only suspended clinics can be reinstated' USING ERRCODE='22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.subscription_clinics sc JOIN public.clinic_subscriptions s ON s.id = sc.subscription_id
                   WHERE sc.clinic_id = p_clinic AND (s.status = 'ACTIVE' OR (s.status = 'TRIAL_ACTIVE' AND s.trial_end_date > now()))) THEN
      RAISE EXCEPTION 'Clinic has no active plan, so it cannot be reinstated' USING ERRCODE='22023'; END IF;
    PERFORM set_config('careflow.trusted_status_change', p_clinic::text, true);
    UPDATE public.clinics SET status = 'ACTIVE' WHERE id = p_clinic;
    INSERT INTO public.verification_events (clinic_id, cycle, event_type, from_status, to_status, actor_user_id, reason)
      VALUES (p_clinic, v.cycle, 'REINSTATED', 'APPROVED', 'APPROVED', uid, r);
  ELSE -- REVOKE: super rejection; owner must re-verify (REJECTED is resubmittable)
    UPDATE public.clinic_verifications SET status = 'REJECTED', decided_at = now(), decided_by = uid, decision_reason = r WHERE clinic_id = p_clinic;
    INSERT INTO public.verification_events (clinic_id, cycle, event_type, from_status, to_status, actor_user_id, reason)
      VALUES (p_clinic, v.cycle, 'REVOKED_AFTER_APPROVAL', 'APPROVED', 'REJECTED', uid, r);
  END IF;
  PERFORM set_config('careflow.trusted_status_change', '', true);
  INSERT INTO public.audit_logs (clinic_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (p_clinic, uid, 'CLINIC_' || p_action, 'clinic', p_clinic, jsonb_build_object('reason', r, 'previous_clinic_status', c.status));
END $$;
REVOKE ALL ON FUNCTION public.admin_clinic_action(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clinic_action(uuid, text, text) TO authenticated;

-- 4. AI entitlement from plans.ai_enabled
CREATE OR REPLACE FUNCTION public.clinic_ai_enabled(p_clinic uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT (private.is_clinic_member(p_clinic) OR private.is_platform_admin())
     AND private.clinic_is_operational(p_clinic)
     AND EXISTS (SELECT 1 FROM public.subscription_clinics sc JOIN public.clinic_subscriptions s ON s.id = sc.subscription_id
                 JOIN public.plans p ON p.id = s.plan_id
                 WHERE sc.clinic_id = p_clinic AND p.ai_enabled
                   AND (s.status = 'ACTIVE' OR (s.status = 'TRIAL_ACTIVE' AND s.trial_end_date > now())));
$$;
REVOKE ALL ON FUNCTION public.clinic_ai_enabled(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_ai_enabled(uuid) TO authenticated;

-- 5. Multi-clinic entitlement (read-only helper for the UI)
CREATE OR REPLACE FUNCTION private.owner_multi_subscription(p_user uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT s.id FROM public.clinic_subscriptions s JOIN public.plans p ON p.id = s.plan_id
   WHERE s.owner_user_id = p_user AND (s.status = 'ACTIVE' OR (s.status = 'TRIAL_ACTIVE' AND s.trial_end_date > now()))
     AND (p.clinic_mode = 'MULTI' OR (p.clinic_mode = 'SINGLE_OR_MULTI' AND s.clinic_scope = 'MULTI'))
     AND EXISTS (SELECT 1 FROM public.subscription_clinics sc JOIN public.clinics c ON c.id = sc.clinic_id
                 WHERE sc.subscription_id = s.id AND c.owner_user_id = p_user AND private.clinic_is_operational(c.id))
   ORDER BY s.created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION private.owner_multi_subscription(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.owner_clinic_allowance() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE uid uuid := (SELECT auth.uid()); sid uuid; lim int; used int;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('eligible', false, 'used', 0, 'limit', 0); END IF;
  sid := private.owner_multi_subscription(uid);
  IF sid IS NULL THEN RETURN jsonb_build_object('eligible', false, 'used', 0, 'limit', 1); END IF;
  SELECT p.max_clinics INTO lim FROM public.clinic_subscriptions s JOIN public.plans p ON p.id = s.plan_id WHERE s.id = sid;
  SELECT count(*) INTO used FROM public.subscription_clinics WHERE subscription_id = sid;
  RETURN jsonb_build_object('eligible', used < lim, 'used', used, 'limit', lim);
END $$;
REVOKE ALL ON FUNCTION public.owner_clinic_allowance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_clinic_allowance() TO authenticated;

-- 6. Additional clinic under the owner's existing multi-clinic subscription (no new subscription)
CREATE OR REPLACE FUNCTION public.create_additional_clinic(p_display_name text, p_name text, p_phone text DEFAULT NULL, p_email text DEFAULT NULL,
  p_address text DEFAULT NULL, p_city text DEFAULT NULL, p_state text DEFAULT NULL, p_clinic_type text DEFAULT NULL, p_postal_code text DEFAULT NULL,
  p_registration_number text DEFAULT NULL, p_representative_name text DEFAULT NULL, p_representative_phone text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE uid uuid := (SELECT auth.uid()); sid uuid; lim int; used int; v_clinic uuid; v_code text; v_attempt int := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND status = 'ACTIVE') THEN RAISE EXCEPTION 'Active profile required' USING ERRCODE='42501'; END IF;
  sid := private.owner_multi_subscription(uid);
  IF sid IS NULL THEN RAISE EXCEPTION 'Your current plan does not allow additional clinics' USING ERRCODE='42501'; END IF;
  -- Serialize concurrent requests on the subscription row, then re-check the limit.
  PERFORM 1 FROM public.clinic_subscriptions WHERE id = sid FOR UPDATE;
  SELECT p.max_clinics INTO lim FROM public.clinic_subscriptions s JOIN public.plans p ON p.id = s.plan_id WHERE s.id = sid;
  SELECT count(*) INTO used FROM public.subscription_clinics WHERE subscription_id = sid;
  IF used >= lim THEN RAISE EXCEPTION 'Clinic limit reached for your plan' USING ERRCODE='42501'; END IF;
  p_display_name := btrim(coalesce(p_display_name, '')); p_name := btrim(coalesce(p_name, ''));
  IF char_length(p_display_name) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Clinic display name must be 1-60 characters' USING ERRCODE='22023'; END IF;
  IF char_length(p_name) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Clinic name must be 2-120 characters' USING ERRCODE='22023'; END IF;
  IF p_clinic_type IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.document_requirements WHERE clinic_type = p_clinic_type AND is_active) THEN
    RAISE EXCEPTION 'Unknown clinic type' USING ERRCODE='22023'; END IF;
  LOOP
    v_attempt := v_attempt + 1;
    v_code := 'CF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    BEGIN
      INSERT INTO public.clinics (owner_user_id, name, display_name, clinic_code, phone, email, address, city, state, clinic_type, postal_code,
        registration_number, representative_name, representative_phone)
      VALUES (uid, p_name, p_display_name, v_code, nullif(btrim(p_phone),''), nullif(btrim(p_email),''), nullif(btrim(p_address),''),
        nullif(btrim(p_city),''), nullif(btrim(p_state),''), p_clinic_type, nullif(btrim(p_postal_code),''),
        nullif(btrim(p_registration_number),''), nullif(btrim(p_representative_name),''), nullif(btrim(p_representative_phone),''))
      RETURNING id INTO v_clinic;
      EXIT;
    EXCEPTION WHEN unique_violation THEN IF v_attempt >= 5 THEN RAISE EXCEPTION 'Could not generate a unique clinic code'; END IF;
    END;
  END LOOP;
  PERFORM set_config('careflow.trusted_owner_insert', v_clinic::text, true);
  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, joined_at) VALUES (v_clinic, uid, 'OWNER', 'ACTIVE', now());
  PERFORM set_config('careflow.trusted_owner_insert', '', true);
  INSERT INTO public.clinic_verifications (clinic_id) VALUES (v_clinic);
  INSERT INTO public.subscription_clinics (subscription_id, clinic_id) VALUES (sid, v_clinic);
  INSERT INTO public.audit_logs (clinic_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (v_clinic, uid, 'CLINIC_ADDED', 'clinic', v_clinic, jsonb_build_object('subscription_id', sid));
  RETURN v_clinic;
END $$;
REVOKE ALL ON FUNCTION public.create_additional_clinic(text,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_additional_clinic(text,text,text,text,text,text,text,text,text,text,text,text) TO authenticated;