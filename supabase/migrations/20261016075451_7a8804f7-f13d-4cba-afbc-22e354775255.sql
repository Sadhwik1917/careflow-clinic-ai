CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS rag;
REVOKE ALL ON SCHEMA rag FROM PUBLIC, anon, authenticated;

CREATE TABLE rag.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL CHECK (domain IN ('SHAREABLE','CONFIDENTIAL','CLINIC')),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  source_key text NOT NULL CHECK (char_length(source_key) BETWEEN 1 AND 200),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  chunk_count int NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((domain = 'CLINIC') = (clinic_id IS NOT NULL))
);
CREATE UNIQUE INDEX rag_documents_platform_key ON rag.documents (domain, source_key) WHERE clinic_id IS NULL;
CREATE UNIQUE INDEX rag_documents_clinic_key ON rag.documents (clinic_id, source_key) WHERE clinic_id IS NOT NULL;

-- Physically separate chunk tables: one per security domain.
CREATE TABLE rag.shared_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES rag.documents(id) ON DELETE CASCADE,
  chunk_index int NOT NULL, content text NOT NULL, embedding extensions.vector(3072) NOT NULL);
CREATE TABLE rag.confidential_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES rag.documents(id) ON DELETE CASCADE,
  chunk_index int NOT NULL, content text NOT NULL, embedding extensions.vector(3072) NOT NULL);
CREATE TABLE rag.clinic_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES rag.documents(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  chunk_index int NOT NULL, content text NOT NULL, embedding extensions.vector(3072) NOT NULL);
CREATE INDEX rag_clinic_chunks_clinic ON rag.clinic_chunks (clinic_id);
CREATE INDEX rag_shared_hnsw ON rag.shared_chunks USING hnsw ((embedding::extensions.halfvec(3072)) extensions.halfvec_cosine_ops);
CREATE INDEX rag_conf_hnsw ON rag.confidential_chunks USING hnsw ((embedding::extensions.halfvec(3072)) extensions.halfvec_cosine_ops);
CREATE INDEX rag_clinic_hnsw ON rag.clinic_chunks USING hnsw ((embedding::extensions.halfvec(3072)) extensions.halfvec_cosine_ops);

ALTER TABLE rag.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag.shared_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag.confidential_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag.clinic_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA rag FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA rag TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA rag TO service_role;

-- Authorisation per domain. Default deny; admins never reach clinic data, clinic users never reach confidential data.
CREATE OR REPLACE FUNCTION private.rag_can_write(p_domain text, p_clinic uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND CASE
    WHEN p_domain IN ('SHAREABLE','CONFIDENTIAL') THEN p_clinic IS NULL AND private.is_platform_admin()
    WHEN p_domain = 'CLINIC' THEN p_clinic IS NOT NULL AND NOT private.is_platform_admin()
      AND private.has_clinic_role(p_clinic, ARRAY['OWNER']::public.member_role[]) AND private.clinic_is_operational(p_clinic)
    ELSE false END;
$$;

CREATE OR REPLACE FUNCTION private.rag_vec(p text) RETURNS extensions.vector
LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $$
DECLARE v extensions.vector;
BEGIN
  IF p IS NULL OR length(p) > 200000 THEN RAISE EXCEPTION 'Invalid embedding' USING ERRCODE='22023'; END IF;
  v := p::extensions.vector;
  IF extensions.vector_dims(v) <> 3072 THEN RAISE EXCEPTION 'Invalid embedding' USING ERRCODE='22023'; END IF;
  RETURN v;
END $$;

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
    -- A source key can't silently move between shareable and confidential.
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
  UPDATE rag.documents SET chunk_count = n WHERE id = d;
  INSERT INTO public.audit_logs (clinic_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (p_clinic, uid, 'KNOWLEDGE_UPSERTED', 'knowledge_document', d, jsonb_build_object('domain', p_domain, 'chunks', n));
  RETURN d;
END $$;

CREATE OR REPLACE FUNCTION public.rag_delete_document(p_domain text, p_clinic uuid, p_source_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE d uuid;
BEGIN
  IF NOT private.rag_can_write(p_domain, p_clinic) THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  DELETE FROM rag.documents WHERE domain = p_domain AND clinic_id IS NOT DISTINCT FROM p_clinic AND source_key = btrim(coalesce(p_source_key,'')) RETURNING id INTO d;
  IF d IS NOT NULL THEN
    INSERT INTO public.audit_logs (clinic_id, user_id, action, entity_type, entity_id, metadata)
      VALUES (p_clinic, (SELECT auth.uid()), 'KNOWLEDGE_DELETED', 'knowledge_document', d, jsonb_build_object('domain', p_domain));
  END IF;
  RETURN d IS NOT NULL;
END $$;

-- Search paths: each reads exactly one domain table and checks the caller first.
CREATE OR REPLACE FUNCTION public.rag_search_shared(p_embedding text, p_count int DEFAULT 5)
RETURNS TABLE(chunk_id uuid, source_key text, title text, content text, similarity float8)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE q extensions.vector;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  q := private.rag_vec(p_embedding);
  RETURN QUERY SELECT s.id, d.source_key, d.title, s.content,
      (1 - (s.embedding::extensions.halfvec(3072) OPERATOR(extensions.<=>) q::extensions.halfvec(3072)))::float8
    FROM rag.shared_chunks s JOIN rag.documents d ON d.id = s.document_id AND d.domain = 'SHAREABLE'
    ORDER BY s.embedding::extensions.halfvec(3072) OPERATOR(extensions.<=>) q::extensions.halfvec(3072)
    LIMIT least(greatest(coalesce(p_count, 5), 1), 10);
END $$;

CREATE OR REPLACE FUNCTION public.rag_search_confidential(p_embedding text, p_count int DEFAULT 5)
RETURNS TABLE(chunk_id uuid, source_key text, title text, content text, similarity float8)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE q extensions.vector;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT private.is_platform_admin() THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  q := private.rag_vec(p_embedding);
  RETURN QUERY SELECT s.id, d.source_key, d.title, s.content,
      (1 - (s.embedding::extensions.halfvec(3072) OPERATOR(extensions.<=>) q::extensions.halfvec(3072)))::float8
    FROM rag.confidential_chunks s JOIN rag.documents d ON d.id = s.document_id AND d.domain = 'CONFIDENTIAL'
    ORDER BY s.embedding::extensions.halfvec(3072) OPERATOR(extensions.<=>) q::extensions.halfvec(3072)
    LIMIT least(greatest(coalesce(p_count, 5), 1), 10);
END $$;

CREATE OR REPLACE FUNCTION public.rag_search_clinic(p_clinic uuid, p_embedding text, p_count int DEFAULT 5)
RETURNS TABLE(chunk_id uuid, source_key text, title text, content text, similarity float8)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE q extensions.vector;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_clinic IS NULL OR private.is_platform_admin()
     OR NOT private.has_clinic_role(p_clinic, ARRAY['OWNER','DOCTOR','STAFF']::public.member_role[])
     OR NOT private.clinic_is_operational(p_clinic) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  q := private.rag_vec(p_embedding);
  RETURN QUERY SELECT s.id, d.source_key, d.title, s.content,
      (1 - (s.embedding::extensions.halfvec(3072) OPERATOR(extensions.<=>) q::extensions.halfvec(3072)))::float8
    FROM rag.clinic_chunks s JOIN rag.documents d ON d.id = s.document_id AND d.domain = 'CLINIC' AND d.clinic_id = p_clinic
    WHERE s.clinic_id = p_clinic
    ORDER BY s.embedding::extensions.halfvec(3072) OPERATOR(extensions.<=>) q::extensions.halfvec(3072)
    LIMIT least(greatest(coalesce(p_count, 5), 1), 10);
END $$;

REVOKE ALL ON FUNCTION private.rag_can_write(text, uuid), private.rag_vec(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rag_upsert_document(text, uuid, text, text, jsonb), public.rag_delete_document(text, uuid, text),
  public.rag_search_shared(text, int), public.rag_search_confidential(text, int), public.rag_search_clinic(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rag_upsert_document(text, uuid, text, text, jsonb), public.rag_delete_document(text, uuid, text),
  public.rag_search_shared(text, int), public.rag_search_confidential(text, int), public.rag_search_clinic(uuid, text, int) TO authenticated;