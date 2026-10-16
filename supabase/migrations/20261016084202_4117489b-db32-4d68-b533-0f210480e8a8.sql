ALTER TABLE rag.documents ADD COLUMN approval_status text NOT NULL DEFAULT 'PENDING'
  CHECK (approval_status IN ('PENDING','APPROVED','REJECTED'));

-- New and updated documents must not become clinic-visible automatically: every upsert resets to PENDING.
CREATE OR REPLACE FUNCTION public.rag_upsert_document(p_domain text, p_clinic uuid, p_source_key text, p_title text, p_chunks jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE uid uuid := (SELECT auth.uid()); d uuid; c jsonb; i int := 0; n int;
BEGIN
  IF NOT private.rag_can_write(p_domain, p_clinic) THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_chunks) <> 'array' THEN RAISE EXCEPTION 'Invalid chunks' USING ERRCODE='22023'; END IF;
  n := jsonb_array_length(p_chunks);
  IF n NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid chunks' USING ERRCODE='22023'; END IF;
  p_source_key := btrim(coalesce(p_source_key,'')); p_title := btrim(coalesce(p_title,''));
  IF p_domain = 'CLINIC' THEN
    SELECT id INTO d FROM rag.documents WHERE clinic_id = p_clinic AND source_key = p_source_key FOR UPDATE;
  ELSE
    SELECT id INTO d FROM rag.documents WHERE domain = p_domain AND clinic_id IS NULL AND source_key = p_source_key FOR UPDATE;
    IF EXISTS (SELECT 1 FROM rag.documents WHERE clinic_id IS NULL AND source_key = p_source_key AND domain <> p_domain) THEN
      RAISE EXCEPTION 'Source already classified differently; delete it first' USING ERRCODE='22023'; END IF;
  END IF;
  IF d IS NULL THEN
    INSERT INTO rag.documents (domain, clinic_id, source_key, title, created_by) VALUES (p_domain, p_clinic, p_source_key, p_title, uid) RETURNING id INTO d;
  ELSE
    UPDATE rag.documents SET title = p_title, updated_at = now() WHERE id = d;
    DELETE FROM rag.shared_chunks WHERE document_id = d;
    DELETE FROM rag.confidential_chunks WHERE document_id = d;
    DELETE FROM rag.clinic_chunks WHERE document_id = d;
  END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(p_chunks) LOOP
    IF char_length(coalesce(c->>'content','')) NOT BETWEEN 1 AND 8000 THEN RAISE EXCEPTION 'Invalid chunk' USING ERRCODE='22023'; END IF;
    IF p_domain = 'SHAREABLE' THEN
      INSERT INTO rag.shared_chunks (document_id, chunk_index, content, embedding) VALUES (d, i, c->>'content', private.rag_vec(c->>'embedding'));
    ELSIF p_domain = 'CONFIDENTIAL' THEN
      INSERT INTO rag.confidential_chunks (document_id, chunk_index, content, embedding) VALUES (d, i, c->>'content', private.rag_vec(c->>'embedding'));
    ELSE
      INSERT INTO rag.clinic_chunks (document_id, clinic_id, chunk_index, content, embedding) VALUES (d, p_clinic, i, c->>'content', private.rag_vec(c->>'embedding'));
    END IF;
    i := i + 1;
  END LOOP;
  UPDATE rag.documents SET chunk_count = n, approval_status = 'PENDING' WHERE id = d;
  INSERT INTO public.audit_logs (clinic_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (p_clinic, uid, 'KNOWLEDGE_UPSERTED', 'knowledge_document', d, jsonb_build_object('domain', p_domain, 'chunks', n));
  RETURN d;
END $$;

-- Clinic-facing shared search returns only explicitly APPROVED documents; platform admins may search all.
CREATE OR REPLACE FUNCTION public.rag_search_shared(p_embedding text, p_count int DEFAULT 5)
RETURNS TABLE(chunk_id uuid, source_key text, title text, content text, similarity float8)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE q extensions.vector;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  q := private.rag_vec(p_embedding);
  RETURN QUERY SELECT s.id, d.source_key, d.title, s.content,
      (1 - (s.embedding::extensions.halfvec(3072)) OPERATOR(extensions.<=>) q::extensions.halfvec(3072))::float8
    FROM rag.shared_chunks s JOIN rag.documents d ON d.id = s.document_id AND d.domain = 'SHAREABLE'
    WHERE private.is_platform_admin() OR d.approval_status = 'APPROVED'
    ORDER BY s.embedding::extensions.halfvec(3072) OPERATOR(extensions.<=>) q::extensions.halfvec(3072)
    LIMIT least(greatest(coalesce(p_count, 5), 1), 10);
END $$;

-- Admin-only approval decision; audited. Confidential documents stay admin-only regardless of status.
CREATE OR REPLACE FUNCTION public.rag_review_document(p_document uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE d rag.documents;
BEGIN
  IF NOT private.is_platform_admin() THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('APPROVED','REJECTED') THEN RAISE EXCEPTION 'Invalid status' USING ERRCODE='22023'; END IF;
  SELECT * INTO d FROM rag.documents WHERE id = p_document FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
  UPDATE rag.documents SET approval_status = p_status, updated_at = now() WHERE id = p_document;
  INSERT INTO public.audit_logs (clinic_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (d.clinic_id, (SELECT auth.uid()), 'KNOWLEDGE_REVIEWED', 'knowledge_document', p_document,
      jsonb_build_object('domain', d.domain, 'status', p_status));
END $$;

REVOKE ALL ON FUNCTION public.rag_review_document(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rag_review_document(uuid, text) TO authenticated;