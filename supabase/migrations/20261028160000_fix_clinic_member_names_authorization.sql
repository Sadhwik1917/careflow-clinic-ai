-- Phase 2: Fix Doctor & Staff Display Name resolution in clinic_member_names
-- Allows operational clinic members (OWNER, DOCTOR, STAFF), platform admins, and
-- authorized clinic patients to resolve member display names, and includes doctor_profiles.

CREATE OR REPLACE FUNCTION public.clinic_member_names(p_clinic uuid)
RETURNS TABLE(user_id uuid, display_name text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_is_operational boolean;
  v_is_authorized boolean := false;
BEGIN
  IF p_clinic IS NULL THEN
    RETURN;
  END IF;

  v_is_operational := public.clinic_is_operational(p_clinic);
  IF NOT v_is_operational THEN
    RETURN;
  END IF;

  -- Verify authorization: Caller must be an active clinic member, platform admin,
  -- or a registered patient of this clinic.
  IF v_user IS NOT NULL THEN
    IF private.is_platform_admin() THEN
      v_is_authorized := true;
    ELSIF private.is_clinic_member(p_clinic) THEN
      v_is_authorized := true;
    ELSIF EXISTS (
      SELECT 1 FROM public.patients pt
      WHERE pt.clinic_id = p_clinic AND pt.user_id = v_user
    ) THEN
      v_is_authorized := true;
    END IF;
  ELSE
    -- Allow service/internal context
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT u.user_id, p.display_name
  FROM (
    SELECT cm.user_id FROM public.clinic_members cm
    WHERE cm.clinic_id = p_clinic AND cm.status IN ('ACTIVE', 'INVITED', 'SUSPENDED')
    UNION
    SELECT dp.user_id FROM public.doctor_profiles dp
    WHERE dp.clinic_id = p_clinic AND dp.status IN ('ACTIVE', 'ON_LEAVE')
  ) u
  JOIN public.profiles p ON p.id = u.user_id
  WHERE p.display_name IS NOT NULL AND btrim(p.display_name) <> '';
END;
$fn$;

REVOKE ALL ON FUNCTION public.clinic_member_names(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_member_names(uuid) TO authenticated;
