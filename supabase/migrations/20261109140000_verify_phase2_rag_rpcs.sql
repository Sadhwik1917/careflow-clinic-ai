-- ==============================================================================
-- Migration: 20261109140000_verify_phase2_rag_rpcs.sql
-- Description: Sub-Stage 1.1 Phase-2 RAG RPC Verification & Hardening
--
-- Fixes & Enhancements:
-- 1. Creates public compatibility views rag_knowledge_documents and rag_knowledge_chunks
--    over private schema rag.* hidden stores.
-- 2. Hardens rag_search_clinic to strictly filter out unapproved documents (d.approval_status = 'APPROVED')
--    and enforce multi-tenant isolation, operational clinic status, and authorized clinic roles.
-- 3. Hardens rag_search_confidential to strictly enforce PLATFORM_ADMIN role.
-- 4. Hardens rag_search_shared to restrict non-admin access to APPROVED shareable documents.
-- 5. Adds support for query_embedding, match_count, match_threshold, and p_clinic_id
--    while retaining 100% backward-compatibility for p_embedding, p_count, p_clinic.
-- 6. Enforces 3072-dimension vector validation and halfvec(3072) HNSW cosine indexing.
-- ==============================================================================

-- 1. Compatibility Views for Vector Knowledge Documents and Chunks
CREATE OR REPLACE VIEW public.rag_knowledge_documents AS
  SELECT
    id,
    domain,
    clinic_id,
    source_key,
    title,
    chunk_count,
    approval_status,
    created_by,
    created_at,
    updated_at
  FROM rag.documents;

CREATE OR REPLACE VIEW public.rag_knowledge_chunks AS
  SELECT
    id,
    document_id,
    NULL::uuid AS clinic_id,
    chunk_index,
    content,
    embedding,
    'SHAREABLE'::text AS domain
  FROM rag.shared_chunks
  UNION ALL
  SELECT
    id,
    document_id,
    NULL::uuid AS clinic_id,
    chunk_index,
    content,
    embedding,
    'CONFIDENTIAL'::text AS domain
  FROM rag.confidential_chunks
  UNION ALL
  SELECT
    id,
    document_id,
    clinic_id,
    chunk_index,
    content,
    embedding,
    'CLINIC'::text AS domain
  FROM rag.clinic_chunks;

REVOKE ALL ON public.rag_knowledge_documents FROM PUBLIC, anon;
REVOKE ALL ON public.rag_knowledge_chunks FROM PUBLIC, anon;
GRANT SELECT ON public.rag_knowledge_documents TO service_role;
GRANT SELECT ON public.rag_knowledge_chunks TO service_role;

-- 2. Drop existing search functions to allow updated signatures with default parameters
DROP FUNCTION IF EXISTS public.rag_search_shared(text, int);
DROP FUNCTION IF EXISTS public.rag_search_confidential(text, int);
DROP FUNCTION IF EXISTS public.rag_search_clinic(uuid, text, int);

-- 3. Hardened rag_search_shared
CREATE OR REPLACE FUNCTION public.rag_search_shared(
  p_embedding text DEFAULT NULL,
  p_count int DEFAULT 5,
  p_threshold float8 DEFAULT 0.0,
  query_embedding text DEFAULT NULL,
  match_count int DEFAULT NULL,
  match_threshold float8 DEFAULT NULL
)
RETURNS TABLE(chunk_id uuid, source_key text, title text, content text, similarity float8)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  _emb_text text := coalesce(p_embedding, query_embedding);
  _count int := least(greatest(coalesce(match_count, p_count, 5), 1), 10);
  _threshold float8 := coalesce(match_threshold, p_threshold, 0.0);
  q extensions.vector;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501';
  END IF;

  IF _emb_text IS NULL THEN
    RAISE EXCEPTION 'Invalid embedding' USING ERRCODE='22023';
  END IF;

  q := private.rag_vec(_emb_text);

  RETURN QUERY
  SELECT
    s.id AS chunk_id,
    d.source_key,
    d.title,
    s.content,
    (1 - (s.embedding::extensions.halfvec(3072) OPERATOR(extensions.<=>) q::extensions.halfvec(3072)))::float8 AS similarity
  FROM rag.shared_chunks s
  JOIN rag.documents d ON d.id = s.document_id AND d.domain = 'SHAREABLE'
  WHERE (private.is_platform_admin() OR d.approval_status = 'APPROVED')
    AND (1 - (s.embedding::extensions.halfvec(3072) OPERATOR(extensions.<=>) q::extensions.halfvec(3072)))::float8 >= _threshold
  ORDER BY s.embedding::extensions.halfvec(3072) OPERATOR(extensions.<=>) q::extensions.halfvec(3072)
  LIMIT _count;
END;
$$;

-- 4. Hardened rag_search_confidential
CREATE OR REPLACE FUNCTION public.rag_search_confidential(
  p_embedding text DEFAULT NULL,
  p_count int DEFAULT 5,
  p_threshold float8 DEFAULT 0.0,
  query_embedding text DEFAULT NULL,
  match_count int DEFAULT NULL,
  match_threshold float8 DEFAULT NULL
)
RETURNS TABLE(chunk_id uuid, source_key text, title text, content text, similarity float8)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  _emb_text text := coalesce(p_embedding, query_embedding);
  _count int := least(greatest(coalesce(match_count, p_count, 5), 1), 10);
  _threshold float8 := coalesce(match_threshold, p_threshold, 0.0);
  q extensions.vector;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501';
  END IF;

  IF _emb_text IS NULL THEN
    RAISE EXCEPTION 'Invalid embedding' USING ERRCODE='22023';
  END IF;

  q := private.rag_vec(_emb_text);

  RETURN QUERY
  SELECT
    s.id AS chunk_id,
    d.source_key,
    d.title,
    s.content,
    (1 - (s.embedding::extensions.halfvec(3072) OPERATOR(extensions.<=>) q::extensions.halfvec(3072)))::float8 AS similarity
  FROM rag.confidential_chunks s
  JOIN rag.documents d ON d.id = s.document_id AND d.domain = 'CONFIDENTIAL'
  WHERE (1 - (s.embedding::extensions.halfvec(3072) OPERATOR(extensions.<=>) q::extensions.halfvec(3072)))::float8 >= _threshold
  ORDER BY s.embedding::extensions.halfvec(3072) OPERATOR(extensions.<=>) q::extensions.halfvec(3072)
  LIMIT _count;
END;
$$;

-- 5. Hardened rag_search_clinic
CREATE OR REPLACE FUNCTION public.rag_search_clinic(
  p_clinic uuid DEFAULT NULL,
  p_embedding text DEFAULT NULL,
  p_count int DEFAULT 5,
  p_threshold float8 DEFAULT 0.0,
  query_embedding text DEFAULT NULL,
  match_count int DEFAULT NULL,
  match_threshold float8 DEFAULT NULL,
  p_clinic_id uuid DEFAULT NULL
)
RETURNS TABLE(chunk_id uuid, source_key text, title text, content text, similarity float8)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  _clinic uuid := coalesce(p_clinic, p_clinic_id);
  _emb_text text := coalesce(p_embedding, query_embedding);
  _count int := least(greatest(coalesce(match_count, p_count, 5), 1), 10);
  _threshold float8 := coalesce(match_threshold, p_threshold, 0.0);
  q extensions.vector;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR _clinic IS NULL
     OR private.is_platform_admin()
     OR NOT private.has_clinic_role(_clinic, ARRAY['OWNER','DOCTOR','STAFF']::public.member_role[])
     OR NOT private.clinic_is_operational(_clinic) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501';
  END IF;

  IF _emb_text IS NULL THEN
    RAISE EXCEPTION 'Invalid embedding' USING ERRCODE='22023';
  END IF;

  q := private.rag_vec(_emb_text);

  RETURN QUERY
  SELECT
    s.id AS chunk_id,
    d.source_key,
    d.title,
    s.content,
    (1 - (s.embedding::extensions.halfvec(3072) OPERATOR(extensions.<=>) q::extensions.halfvec(3072)))::float8 AS similarity
  FROM rag.clinic_chunks s
  JOIN rag.documents d ON d.id = s.document_id AND d.domain = 'CLINIC' AND d.clinic_id = _clinic
  WHERE s.clinic_id = _clinic
    AND d.approval_status = 'APPROVED'
    AND (1 - (s.embedding::extensions.halfvec(3072) OPERATOR(extensions.<=>) q::extensions.halfvec(3072)))::float8 >= _threshold
  ORDER BY s.embedding::extensions.halfvec(3072) OPERATOR(extensions.<=>) q::extensions.halfvec(3072)
  LIMIT _count;
END;
$$;

-- 6. Permissions & Grants
REVOKE ALL ON FUNCTION public.rag_search_shared(text, int, float8, text, int, float8) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rag_search_shared(text, int, float8, text, int, float8) TO authenticated;

REVOKE ALL ON FUNCTION public.rag_search_confidential(text, int, float8, text, int, float8) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rag_search_confidential(text, int, float8, text, int, float8) TO authenticated;

REVOKE ALL ON FUNCTION public.rag_search_clinic(uuid, text, int, float8, text, int, float8, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rag_search_clinic(uuid, text, int, float8, text, int, float8, uuid) TO authenticated;

