CREATE TABLE public.clinic_document_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id),
  requirement_id uuid NOT NULL REFERENCES public.document_requirements(id),
  document_id uuid REFERENCES public.clinic_documents(id) ON DELETE SET NULL,
  previous_path text,
  previous_file_name text,
  new_path text NOT NULL,
  new_file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','NEEDS_REPLACEMENT')),
  submitted_by uuid NOT NULL REFERENCES public.profiles(id),
  reviewed_by uuid REFERENCES public.profiles(id),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX clinic_document_updates_one_pending ON public.clinic_document_updates (clinic_id, requirement_id) WHERE status = 'PENDING';
CREATE INDEX clinic_document_updates_clinic ON public.clinic_document_updates (clinic_id, created_at DESC);
GRANT SELECT ON public.clinic_document_updates TO authenticated;
GRANT ALL ON public.clinic_document_updates TO service_role;
ALTER TABLE public.clinic_document_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY cdu_read ON public.clinic_document_updates FOR SELECT TO authenticated
  USING (private.is_platform_admin() OR private.has_clinic_role(clinic_id, ARRAY['OWNER'::public.member_role]));
CREATE TRIGGER set_clinic_document_updates_updated_at BEFORE UPDATE ON public.clinic_document_updates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Ordinary post-approval updates: approved, active clinic, no open six-month reverification.
CREATE OR REPLACE FUNCTION private.document_update_allowed(p_clinic uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.clinic_verifications v JOIN public.clinics c ON c.id = v.clinic_id
                 WHERE v.clinic_id = p_clinic AND v.status = 'APPROVED' AND c.status = 'ACTIVE')
     AND NOT EXISTS (SELECT 1 FROM public.clinic_reverifications r WHERE r.clinic_id = p_clinic AND r.status = 'OPEN');
$$;
REVOKE ALL ON FUNCTION private.document_update_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.document_update_allowed(uuid) TO authenticated;

CREATE POLICY cv_owner_update_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'clinic-verification'
  AND array_length(storage.foldername(name), 1) = 2
  AND private.has_clinic_role(private.safe_uuid((storage.foldername(name))[1]), ARRAY['OWNER'::public.member_role])
  AND private.document_update_allowed(private.safe_uuid((storage.foldername(name))[1]))
  AND EXISTS (SELECT 1 FROM public.document_requirements r JOIN public.clinics c ON c.clinic_type = r.clinic_type
    WHERE c.id = private.safe_uuid((storage.foldername(objects.name))[1])
      AND r.id = private.safe_uuid((storage.foldername(objects.name))[2]) AND r.is_active)
);
-- Files referenced by update history can never be deleted by owners.
DROP POLICY cv_owner_delete ON storage.objects;
CREATE POLICY cv_owner_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'clinic-verification'
  AND private.has_clinic_role(private.safe_uuid((storage.foldername(name))[1]), ARRAY['OWNER'::public.member_role])
  AND private.verification_editable(private.safe_uuid((storage.foldername(name))[1]))
  AND NOT EXISTS (SELECT 1 FROM public.clinic_documents d WHERE d.storage_path = objects.name)
  AND NOT EXISTS (SELECT 1 FROM public.clinic_document_updates u WHERE u.new_path = objects.name OR u.previous_path = objects.name));

CREATE OR REPLACE FUNCTION public.submit_document_update(p_clinic uuid, p_requirement uuid, p_path text, p_file_name text, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE uid uuid := (SELECT auth.uid()); v_req public.document_requirements; v_size bigint; v_mime text; v_doc public.clinic_documents; v_id uuid; r text := btrim(coalesce(p_reason, ''));
BEGIN
  IF uid IS NULL OR NOT private.has_clinic_role(p_clinic, ARRAY['OWNER'::public.member_role]) THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.clinic_verifications WHERE clinic_id = p_clinic FOR UPDATE;
  IF NOT private.document_update_allowed(p_clinic) THEN RAISE EXCEPTION 'Document updates are only available for approved, active clinics without an open reverification' USING ERRCODE='42501'; END IF;
  IF char_length(r) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'A reason of 10 to 1000 characters is required' USING ERRCODE='22023'; END IF;
  SELECT rq.* INTO v_req FROM public.document_requirements rq JOIN public.clinics c ON c.id = p_clinic
   WHERE rq.id = p_requirement AND rq.is_active AND rq.clinic_type = c.clinic_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown document type for this clinic' USING ERRCODE='22023'; END IF;
  IF split_part(p_path, '/', 1) <> p_clinic::text OR split_part(p_path, '/', 2) <> p_requirement::text OR split_part(p_path, '/', 3) = '' OR split_part(p_path, '/', 4) <> '' THEN
    RAISE EXCEPTION 'Invalid document path' USING ERRCODE='22023'; END IF;
  SELECT (o.metadata->>'size')::bigint, o.metadata->>'mimetype' INTO v_size, v_mime
    FROM storage.objects o WHERE o.bucket_id = 'clinic-verification' AND o.name = p_path AND o.owner_id = uid::text;
  IF NOT FOUND OR v_size IS NULL THEN RAISE EXCEPTION 'Uploaded file not found' USING ERRCODE='22023'; END IF;
  IF v_size > v_req.max_size_bytes THEN RAISE EXCEPTION 'File too large' USING ERRCODE='22023'; END IF;
  IF NOT (v_mime = ANY (v_req.allowed_mime_types)) THEN RAISE EXCEPTION 'File type not allowed' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.clinic_documents WHERE storage_path = p_path) OR EXISTS (SELECT 1 FROM public.clinic_document_updates WHERE new_path = p_path) THEN
    RAISE EXCEPTION 'Invalid document path' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_doc FROM public.clinic_documents WHERE clinic_id = p_clinic AND requirement_id = p_requirement;
  BEGIN
    INSERT INTO public.clinic_document_updates (clinic_id, requirement_id, document_id, previous_path, previous_file_name, new_path, new_file_name, mime_type, size_bytes, reason, submitted_by)
    VALUES (p_clinic, p_requirement, v_doc.id, v_doc.storage_path, v_doc.file_name, p_path, left(btrim(coalesce(p_file_name, 'document')), 200), v_mime, v_size, r, uid)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'An update for this document is already awaiting review' USING ERRCODE='22023';
  END;
  INSERT INTO public.audit_logs (clinic_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (p_clinic, uid, 'DOCUMENT_UPDATE_SUBMITTED', 'clinic_document_update', v_id, jsonb_build_object('reason', r, 'document', v_req.label));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.review_document_update(p_update uuid, p_status text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE uid uuid := (SELECT auth.uid()); u public.clinic_document_updates; n text := nullif(btrim(coalesce(p_note, '')), ''); lbl text; owner uuid;
BEGIN
  IF uid IS NULL OR NOT private.is_platform_admin() THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('ACCEPTED','NEEDS_REPLACEMENT') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
  IF p_status = 'NEEDS_REPLACEMENT' AND n IS NULL THEN RAISE EXCEPTION 'A note is required' USING ERRCODE='22023'; END IF;
  IF n IS NOT NULL AND char_length(n) > 1000 THEN RAISE EXCEPTION 'Note is too long' USING ERRCODE='22023'; END IF;
  SELECT * INTO u FROM public.clinic_document_updates WHERE id = p_update FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Update not found' USING ERRCODE='22023'; END IF;
  IF u.status <> 'PENDING' THEN RAISE EXCEPTION 'Only pending updates can be reviewed' USING ERRCODE='42501'; END IF;
  UPDATE public.clinic_document_updates SET status = p_status, review_note = n, reviewed_by = uid, reviewed_at = now() WHERE id = p_update;
  IF p_status = 'ACCEPTED' THEN
    INSERT INTO public.clinic_documents (clinic_id, requirement_id, storage_path, file_name, mime_type, size_bytes, uploaded_by, review_status)
    VALUES (u.clinic_id, u.requirement_id, u.new_path, u.new_file_name, u.mime_type, u.size_bytes, u.submitted_by, 'ACCEPTED')
    ON CONFLICT (clinic_id, requirement_id) DO UPDATE SET storage_path = EXCLUDED.storage_path, file_name = EXCLUDED.file_name,
      mime_type = EXCLUDED.mime_type, size_bytes = EXCLUDED.size_bytes, uploaded_by = EXCLUDED.uploaded_by, review_status = 'ACCEPTED', review_note = NULL;
  END IF;
  SELECT label INTO lbl FROM public.document_requirements WHERE id = u.requirement_id;
  INSERT INTO public.audit_logs (clinic_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (u.clinic_id, uid, 'DOCUMENT_UPDATE_' || p_status, 'clinic_document_update', u.id, jsonb_build_object('reason', n, 'document', lbl));
  SELECT owner_user_id INTO owner FROM public.clinics WHERE id = u.clinic_id;
  IF owner IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_user_id, clinic_id, type, title, message, related_entity_type, related_entity_id)
    VALUES (owner, u.clinic_id, 'DOCUMENT_UPDATE_' || p_status,
      CASE WHEN p_status = 'ACCEPTED' THEN 'Document update accepted' ELSE 'Another replacement requested' END,
      left(CASE WHEN p_status = 'ACCEPTED' THEN coalesce(lbl, 'Your document') || ' has been accepted.' ELSE coalesce(lbl, 'Document') || ': ' || n END, 1000),
      'clinic_document_update', u.id);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.submit_document_update(uuid, uuid, text, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.review_document_update(uuid, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.submit_document_update(uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_document_update(uuid, text, text) TO authenticated;