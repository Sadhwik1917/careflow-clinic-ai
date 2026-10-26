-- Phase 2A: Secure Doctor & Staff Invitation Acceptance and Preview RPCs

-- 1. Preview clinic invitation (Safe preview without exposing private clinic data)
CREATE OR REPLACE FUNCTION public.preview_clinic_invitation(p_invitation uuid)
RETURNS TABLE (
  invitation_id uuid,
  clinic_name text,
  role public.member_role,
  email text,
  masked_email text,
  status text,
  expires_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_inv public.clinic_invitations%ROWTYPE;
  v_clinic_name text;
  v_is_operational boolean;
  v_masked text;
BEGIN
  SELECT * INTO v_inv FROM public.clinic_invitations WHERE id = p_invitation;
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_invitation, NULL::text, NULL::public.member_role, NULL::text, NULL::text, 'NOT_FOUND'::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT COALESCE(NULLIF(c.display_name, ''), c.name) INTO v_clinic_name FROM public.clinics c WHERE c.id = v_inv.clinic_id;
  v_is_operational := public.clinic_is_operational(v_inv.clinic_id);

  -- Compute masked email: e.g. "d***r@example.com"
  IF v_inv.email IS NOT NULL AND position('@' in v_inv.email) > 1 THEN
    v_masked := substr(v_inv.email, 1, 1) || '***' || substr(split_part(v_inv.email, '@', 1), length(split_part(v_inv.email, '@', 1)), 1) || '@' || split_part(v_inv.email, '@', 2);
  ELSE
    v_masked := v_inv.email;
  END IF;

  IF NOT v_is_operational THEN
    RETURN QUERY SELECT v_inv.id, v_clinic_name, v_inv.role, NULL::text, v_masked, 'NON_OPERATIONAL'::text, v_inv.expires_at;
  ELSIF v_inv.status = 'CANCELLED' THEN
    RETURN QUERY SELECT v_inv.id, v_clinic_name, v_inv.role, NULL::text, v_masked, 'CANCELLED'::text, v_inv.expires_at;
  ELSIF v_inv.status = 'ACCEPTED' THEN
    RETURN QUERY SELECT v_inv.id, v_clinic_name, v_inv.role, NULL::text, v_masked, 'ACCEPTED'::text, v_inv.expires_at;
  ELSIF v_inv.expires_at <= now() THEN
    RETURN QUERY SELECT v_inv.id, v_clinic_name, v_inv.role, NULL::text, v_masked, 'EXPIRED'::text, v_inv.expires_at;
  ELSE
    RETURN QUERY SELECT v_inv.id, v_clinic_name, v_inv.role, NULL::text, v_masked, 'VALID'::text, v_inv.expires_at;
  END IF;
END; $fn$;

REVOKE ALL ON FUNCTION public.preview_clinic_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_clinic_invitation(uuid) TO anon, authenticated;


-- 2. Accept clinic invitation (Atomic redemption with caller authentication, email verification, and audit logging)
CREATE OR REPLACE FUNCTION public.accept_clinic_invitation(p_invitation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_user_email text;
  v_user_status text;
  v_inv public.clinic_invitations%ROWTYPE;
  v_existing_member public.clinic_members%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not signed in.';
  END IF;

  -- Verify active profile & email
  SELECT p.status INTO v_user_status
  FROM public.profiles p WHERE p.id = v_user;

  IF NOT FOUND OR v_user_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Active user profile required.';
  END IF;

  SELECT u.email INTO v_user_email FROM auth.users u WHERE u.id = v_user;
  IF v_user_email IS NULL OR v_user_email = '' THEN
    RAISE EXCEPTION 'User email not found.';
  END IF;

  -- Lock invitation row to prevent concurrent race condition redemptions
  SELECT * INTO v_inv FROM public.clinic_invitations WHERE id = p_invitation FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found.';
  END IF;

  -- Disallow OWNER or PLATFORM_ADMIN invitation redemption
  IF v_inv.role NOT IN ('DOCTOR', 'STAFF') THEN
    RAISE EXCEPTION 'Only doctor or staff invitations may be accepted.';
  END IF;

  -- Verify pending status
  IF v_inv.status = 'ACCEPTED' THEN
    RAISE EXCEPTION 'Invitation has already been accepted.';
  ELSIF v_inv.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Invitation has been cancelled.';
  ELSIF v_inv.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Invitation is no longer valid.';
  END IF;

  -- Verify expiration: persist EXPIRED status safely without transaction rollback
  IF v_inv.expires_at <= now() THEN
    UPDATE public.clinic_invitations SET status = 'EXPIRED' WHERE id = p_invitation;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invitation has expired.',
      'status', 'EXPIRED'
    );
  END IF;

  -- Verify clinic operational status
  IF NOT public.clinic_is_operational(v_inv.clinic_id) THEN
    RAISE EXCEPTION 'Clinic is not operational.';
  END IF;

  -- Verify email matches authenticated caller
  IF lower(btrim(v_inv.email)) <> lower(btrim(v_user_email)) THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address.';
  END IF;

  -- Check existing membership
  SELECT * INTO v_existing_member
  FROM public.clinic_members
  WHERE clinic_id = v_inv.clinic_id AND user_id = v_user;

  IF FOUND THEN
    IF v_existing_member.status = 'ACTIVE' THEN
      RAISE EXCEPTION 'You are already an active member of this clinic.';
    ELSE
      -- Reactivate previously suspended or removed membership
      UPDATE public.clinic_members
      SET role = v_inv.role, status = 'ACTIVE', updated_at = now()
      WHERE id = v_existing_member.id;
    END IF;
  ELSE
    -- Insert new membership
    INSERT INTO public.clinic_members (clinic_id, user_id, role, status, joined_at)
    VALUES (v_inv.clinic_id, v_user, v_inv.role, 'ACTIVE', now());
  END IF;

  -- Provision doctor profile if role is DOCTOR
  IF v_inv.role = 'DOCTOR' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.doctor_profiles
      WHERE clinic_id = v_inv.clinic_id AND user_id = v_user
    ) THEN
      INSERT INTO public.doctor_profiles (clinic_id, user_id, specialization, status)
      VALUES (v_inv.clinic_id, v_user, 'General Practice', 'ACTIVE');
    ELSE
      UPDATE public.doctor_profiles
      SET status = 'ACTIVE', updated_at = now()
      WHERE clinic_id = v_inv.clinic_id AND user_id = v_user;
    END IF;
  END IF;

  -- Update invitation status to ACCEPTED
  UPDATE public.clinic_invitations
  SET status = 'ACCEPTED'
  WHERE id = p_invitation;

  -- Insert audit log entry
  INSERT INTO public.audit_logs (clinic_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_inv.clinic_id,
    v_user,
    'MEMBER_INVITATION_ACCEPTED',
    'CLINIC_INVITATION',
    p_invitation,
    jsonb_build_object('role', v_inv.role, 'email', v_inv.email)
  );

  RETURN jsonb_build_object(
    'success', true,
    'clinic_id', v_inv.clinic_id,
    'role', v_inv.role
  );
END; $fn$;

REVOKE ALL ON FUNCTION public.accept_clinic_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_clinic_invitation(uuid) TO authenticated;
