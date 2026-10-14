CREATE OR REPLACE FUNCTION private.verification_editable(p_clinic uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.clinic_verifications v WHERE v.clinic_id = p_clinic
    AND (v.status IN ('DRAFT','CHANGES_REQUESTED','REJECTED')
         OR (v.status = 'APPROVED' AND EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = p_clinic AND c.status = 'SUSPENDED'))));
$$;

CREATE OR REPLACE FUNCTION private.lock_clinic_during_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT private.is_platform_admin()
     AND NOT private.verification_editable(NEW.id)
     AND EXISTS (SELECT 1 FROM public.clinic_verifications v WHERE v.clinic_id = NEW.id AND v.status IN ('PENDING_REVIEW','APPROVED'))
     AND (NEW.name, NEW.clinic_type, NEW.address, NEW.city, NEW.state, NEW.postal_code, NEW.registration_number,
          NEW.representative_name, NEW.representative_phone, NEW.latitude, NEW.longitude)
         IS DISTINCT FROM
         (OLD.name, OLD.clinic_type, OLD.address, OLD.city, OLD.state, OLD.postal_code, OLD.registration_number,
          OLD.representative_name, OLD.representative_phone, OLD.latitude, OLD.longitude)
  THEN RAISE EXCEPTION 'Verified clinic details are locked while under review or after approval' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.submit_clinic_verification(p_clinic uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v public.clinic_verifications; c public.clinics;
BEGIN
  IF NOT private.has_clinic_role(p_clinic, ARRAY['OWNER'::public.member_role]) THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM public.clinic_verifications WHERE clinic_id = p_clinic FOR UPDATE;
  IF NOT FOUND OR NOT private.verification_editable(p_clinic) THEN
    RAISE EXCEPTION 'Application cannot be submitted in its current state' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.clinics WHERE id = p_clinic;
  IF c.clinic_type IS NULL OR btrim(coalesce(c.address,'')) = '' OR btrim(coalesce(c.city,'')) = ''
     OR btrim(coalesce(c.state,'')) = '' OR btrim(coalesce(c.representative_name,'')) = '' THEN
    RAISE EXCEPTION 'Missing required clinic details' USING ERRCODE='22023'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.document_requirements r
    WHERE r.clinic_type = c.clinic_type AND r.is_active AND r.is_required
      AND NOT EXISTS (
        SELECT 1 FROM public.clinic_documents d
        JOIN storage.objects o ON o.bucket_id = 'clinic-verification' AND o.name = d.storage_path
        WHERE d.clinic_id = p_clinic AND d.requirement_id = r.id
          AND (o.metadata->>'size')::bigint <= r.max_size_bytes
          AND (o.metadata->>'mimetype') = ANY (r.allowed_mime_types)))
  THEN RAISE EXCEPTION 'Required documents are missing or invalid' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.clinic_documents d WHERE d.clinic_id = p_clinic AND d.review_status = 'NEEDS_REPLACEMENT') THEN
    RAISE EXCEPTION 'Some documents still need to be replaced' USING ERRCODE='22023'; END IF;
  UPDATE public.clinic_verifications
     SET status = 'PENDING_REVIEW', cycle = v.cycle + 1, submitted_at = now(), decided_at = NULL, decided_by = NULL, decision_reason = NULL
   WHERE clinic_id = p_clinic;
  INSERT INTO public.verification_events (clinic_id, cycle, event_type, from_status, to_status, actor_user_id)
  VALUES (p_clinic, v.cycle + 1, 'SUBMITTED', v.status, 'PENDING_REVIEW', (SELECT auth.uid()));
END $function$;