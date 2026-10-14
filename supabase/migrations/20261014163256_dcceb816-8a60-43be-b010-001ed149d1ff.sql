CREATE OR REPLACE FUNCTION public.admin_clinic_action(p_clinic uuid, p_action text, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
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
    -- Plan is NOT required: operational access is still gated separately by clinic_is_operational (needs an active plan).
    IF c.status <> 'SUSPENDED' THEN RAISE EXCEPTION 'Only suspended clinics can be reinstated' USING ERRCODE='22023'; END IF;
    PERFORM set_config('careflow.trusted_status_change', p_clinic::text, true);
    UPDATE public.clinics SET status = 'ACTIVE' WHERE id = p_clinic;
    INSERT INTO public.verification_events (clinic_id, cycle, event_type, from_status, to_status, actor_user_id, reason)
      VALUES (p_clinic, v.cycle, 'REINSTATED', 'APPROVED', 'APPROVED', uid, r);
  ELSE
    UPDATE public.clinic_verifications SET status = 'REJECTED', decided_at = now(), decided_by = uid, decision_reason = r WHERE clinic_id = p_clinic;
    INSERT INTO public.verification_events (clinic_id, cycle, event_type, from_status, to_status, actor_user_id, reason)
      VALUES (p_clinic, v.cycle, 'REVOKED_AFTER_APPROVAL', 'APPROVED', 'REJECTED', uid, r);
  END IF;
  PERFORM set_config('careflow.trusted_status_change', '', true);
  INSERT INTO public.audit_logs (clinic_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (p_clinic, uid, 'CLINIC_' || p_action, 'clinic', p_clinic, jsonb_build_object('reason', r, 'previous_clinic_status', c.status));
END $function$;