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
    WHERE private.is_platform_admin() OR d.approval_status = 'APPROVED'
    ORDER BY s.embedding::extensions.halfvec(3072) OPERATOR(extensions.<=>) q::extensions.halfvec(3072)
    LIMIT least(greatest(coalesce(p_count, 5), 1), 10);
END $$;