ALTER TABLE public.clinics ADD COLUMN display_name text NOT NULL
  CONSTRAINT clinics_display_name_length CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 60 AND display_name = btrim(display_name));

DROP FUNCTION IF EXISTS public.create_clinic_with_owner(text,text,text,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS private.create_clinic_with_owner(text,text,text,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION private.create_first_clinic(
  p_display_name text, p_name text, p_phone text DEFAULT NULL, p_email text DEFAULT NULL,
  p_address text DEFAULT NULL, p_city text DEFAULT NULL, p_state text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_clinic uuid;
  v_code text;
  v_attempt int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  -- Serialise concurrent submissions from the same user.
  PERFORM pg_advisory_xact_lock(hashtextextended('careflow.first_clinic:' || v_user::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'Active profile required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clinic_members WHERE user_id = v_user AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'Not eligible: account already has active clinic access' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clinics WHERE owner_user_id = v_user) THEN
    RAISE EXCEPTION 'Not eligible: account already owns a clinic' USING ERRCODE = '42501';
  END IF;
  p_display_name := btrim(coalesce(p_display_name, ''));
  p_name := btrim(coalesce(p_name, ''));
  IF char_length(p_display_name) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Clinic display name must be 1-60 characters' USING ERRCODE = '22023'; END IF;
  IF char_length(p_name) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Clinic name must be 2-120 characters' USING ERRCODE = '22023'; END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_code := 'CF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    BEGIN
      INSERT INTO public.clinics (owner_user_id, name, display_name, clinic_code, phone, email, address, city, state)
      VALUES (v_user, p_name, p_display_name, v_code, nullif(btrim(p_phone), ''), nullif(btrim(p_email), ''),
              nullif(btrim(p_address), ''), nullif(btrim(p_city), ''), nullif(btrim(p_state), ''))
      RETURNING id INTO v_clinic;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN RAISE EXCEPTION 'Could not generate a unique clinic code'; END IF;
    END;
  END LOOP;

  PERFORM set_config('careflow.trusted_owner_insert', v_clinic::text, true);
  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, joined_at)
  VALUES (v_clinic, v_user, 'OWNER', 'ACTIVE', now());
  PERFORM set_config('careflow.trusted_owner_insert', '', true);
  RETURN v_clinic;
END $$;
REVOKE ALL ON FUNCTION private.create_first_clinic(text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_first_clinic(text,text,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_first_clinic(
  p_display_name text, p_name text, p_phone text DEFAULT NULL, p_email text DEFAULT NULL,
  p_address text DEFAULT NULL, p_city text DEFAULT NULL, p_state text DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
  SELECT private.create_first_clinic(p_display_name, p_name, p_phone, p_email, p_address, p_city, p_state);
$$;
REVOKE ALL ON FUNCTION public.create_first_clinic(text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_first_clinic(text,text,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION private.protect_clinic_owner_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR private.is_platform_admin() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'OWNER'::public.member_role THEN
      -- Only the first-clinic workflow, for the caller's own just-created clinic with no other members.
      IF current_setting('careflow.trusted_owner_insert', true) = NEW.clinic_id::text
         AND NEW.user_id = auth.uid()
         AND NEW.status = 'ACTIVE'::public.member_status
         AND EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = NEW.clinic_id AND c.owner_user_id = NEW.user_id AND c.created_at = now())
         AND NOT EXISTS (SELECT 1 FROM public.clinic_members m WHERE m.clinic_id = NEW.clinic_id) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Only a trusted backend or platform administrator can add an OWNER';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'OWNER'::public.member_role OR NEW.role = 'OWNER'::public.member_role THEN
      RAISE EXCEPTION 'Only a trusted backend or platform administrator can modify OWNER membership';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.role = 'OWNER'::public.member_role THEN
      RAISE EXCEPTION 'Only a trusted backend or platform administrator can remove an OWNER';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;