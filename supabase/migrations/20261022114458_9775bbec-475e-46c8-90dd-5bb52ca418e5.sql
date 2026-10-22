CREATE UNIQUE INDEX clinic_invitations_one_pending_per_email ON public.clinic_invitations (clinic_id, lower(email)) WHERE status = 'PENDING';

CREATE OR REPLACE FUNCTION private.assert_team_owner(p_clinic uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not signed in.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_members WHERE clinic_id = p_clinic AND user_id = v_user AND role = 'OWNER' AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'Team management is unavailable for this clinic.';
  END IF;
  IF NOT public.clinic_is_operational(p_clinic) THEN
    RAISE EXCEPTION 'Team management is unavailable for this clinic.';
  END IF;
END; $fn$;
REVOKE ALL ON FUNCTION private.assert_team_owner(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.clinic_member_names(p_clinic uuid)
RETURNS TABLE(user_id uuid, display_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT m.user_id, p.display_name
  FROM public.clinic_members m JOIN public.profiles p ON p.id = m.user_id
  WHERE m.clinic_id = p_clinic AND m.status IN ('ACTIVE','INVITED','SUSPENDED')
    AND private.assert_team_owner(p_clinic) IS NULL;
$fn$;
REVOKE ALL ON FUNCTION public.clinic_member_names(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_member_names(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.invite_clinic_member(p_clinic uuid, p_email text, p_role public.member_role)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_email text := lower(btrim(p_email)); v_target uuid; v_id uuid;
BEGIN
  PERFORM private.assert_team_owner(p_clinic);
  IF p_role NOT IN ('DOCTOR','STAFF') THEN RAISE EXCEPTION 'Only doctor or staff invitations are allowed.'; END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 255 THEN RAISE EXCEPTION 'Enter a valid email address.'; END IF;
  SELECT id INTO v_target FROM auth.users WHERE lower(email) = v_email;
  IF v_target IS NOT NULL AND EXISTS (SELECT 1 FROM public.clinic_members WHERE clinic_id = p_clinic AND user_id = v_target AND status IN ('ACTIVE','INVITED','SUSPENDED')) THEN
    RAISE EXCEPTION 'This person is already a member of the clinic.';
  END IF;
  INSERT INTO public.clinic_invitations(clinic_id, email, role, invited_by, status, expires_at)
  VALUES (p_clinic, v_email, p_role, auth.uid(), 'PENDING', now() + interval '7 days') RETURNING id INTO v_id;
  INSERT INTO public.audit_logs(clinic_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (p_clinic, auth.uid(), 'MEMBER_INVITED', 'CLINIC_INVITATION', v_id, jsonb_build_object('role', p_role));
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'A pending invitation already exists for this email.';
END; $fn$;
REVOKE ALL ON FUNCTION public.invite_clinic_member(uuid, text, public.member_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_clinic_member(uuid, text, public.member_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_clinic_invitation(p_invitation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_inv public.clinic_invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv FROM public.clinic_invitations WHERE id = p_invitation;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found.'; END IF;
  PERFORM private.assert_team_owner(v_inv.clinic_id);
  IF v_inv.status <> 'PENDING' THEN RAISE EXCEPTION 'Only pending invitations can be cancelled.'; END IF;
  UPDATE public.clinic_invitations SET status = 'CANCELLED' WHERE id = p_invitation AND status = 'PENDING';
  INSERT INTO public.audit_logs(clinic_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (v_inv.clinic_id, auth.uid(), 'MEMBER_INVITATION_CANCELLED', 'CLINIC_INVITATION', p_invitation, jsonb_build_object('role', v_inv.role));
END; $fn$;
REVOKE ALL ON FUNCTION public.cancel_clinic_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_clinic_invitation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_clinic_member_status(p_member uuid, p_status public.member_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_member public.clinic_members%ROWTYPE;
BEGIN
  SELECT * INTO v_member FROM public.clinic_members WHERE id = p_member;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found.'; END IF;
  PERFORM private.assert_team_owner(v_member.clinic_id);
  IF v_member.role NOT IN ('DOCTOR','STAFF') THEN RAISE EXCEPTION 'This membership cannot be changed here.'; END IF;
  IF v_member.user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot change your own membership.'; END IF;
  IF p_status NOT IN ('ACTIVE','SUSPENDED','REMOVED') THEN RAISE EXCEPTION 'Unsupported member status.'; END IF;
  UPDATE public.clinic_members SET status = p_status, updated_at = now() WHERE id = p_member AND status IS DISTINCT FROM p_status;
  INSERT INTO public.audit_logs(clinic_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (v_member.clinic_id, auth.uid(), 'MEMBER_STATUS_CHANGED', 'CLINIC_MEMBER', p_member, jsonb_build_object('from', v_member.status, 'to', p_status));
END; $fn$;
REVOKE ALL ON FUNCTION public.set_clinic_member_status(uuid, public.member_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_clinic_member_status(uuid, public.member_status) TO authenticated;