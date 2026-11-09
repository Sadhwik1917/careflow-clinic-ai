/**
 * Server-only retrieval service (future AI Assistant + Patient History Summary).
 * `db` MUST be the caller's RLS client (context.supabase from requireSupabaseAuth): every search/ingest database function
 * re-checks auth.uid(), role and clinic membership itself, so a wrong scope here fails closed, never open.
 * Never pass the service-role client — it has no auth.uid() and every call is refused.
 */
import {
  EMBEDDING_DIMS,
  EMBEDDING_MODEL,
  KNOWLEDGE_DOMAINS,
  MAX_RESULTS,
  allowedDomains,
  chunkText,
  type KnowledgeDomain,
  type RagPassage,
  type RetrievedChunk,
  type SearchKnowledgeBaseOptions,
} from "@/lib/rag";

export type Rpc = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};
export type Embed = (inputs: string[]) => Promise<number[][]>;

export async function embedTexts(inputs: string[]): Promise<number[][]> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("AI_UNAVAILABLE");
  const modelName = EMBEDDING_MODEL.replace(/^google\//, "");
  const out: number[][] = [];
  for (let i = 0; i < inputs.length; i += 100) {
    const batch = inputs.slice(i, i + 100);
    let res: Response | undefined;
    for (let attempt = 1; attempt <= 3; attempt++) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:batchEmbedContents`,
        {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: batch.map((text) => ({
              model: `models/${modelName}`,
              content: { parts: [{ text }] },
              outputDimensionality: EMBEDDING_DIMS,
            })),
          }),
        },
      );
      if (res.ok || !(res.status === 429 || res.status >= 500) || attempt === 3) break;
      await res.body?.cancel();
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt + Math.random() * 500));
    }
    if (!res?.ok) {
      console.error("embedding error", res?.status);
      throw new Error(res?.status === 429 ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE");
    }
    const json = (await res.json()) as { embeddings?: { values: number[] }[] };
    const embeddings = json.embeddings ?? [];
    if (embeddings.length !== batch.length) throw new Error("AI_UNAVAILABLE");
    for (let j = 0; j < batch.length; j++) {
      const vec = embeddings[j]?.values;
      if (
        !vec ||
        vec.length !== EMBEDDING_DIMS ||
        !vec.every((n) => typeof n === "number" && Number.isFinite(n))
      ) {
        throw new Error("AI_UNAVAILABLE");
      }
      out.push(vec);
    }
  }
  return out;
}

/** Embeds a single query string using gemini-embedding-001 (enforces 3072-dimension vector). */
export async function embedQuery(query: string, embed: Embed = embedTexts): Promise<number[]> {
  const q = typeof query === "string" ? query.trim() : "";
  if (!q || q.length > 8000) throw new Error("INVALID_INPUT");
  const [vector] = await embed([q]);
  if (!vector || vector.length !== EMBEDDING_DIMS || !vector.every((n) => typeof n === "number" && Number.isFinite(n))) {
    throw new Error("AI_UNAVAILABLE");
  }
  return vector;
}

/** Embeds a collection of document passages using gemini-embedding-001 (enforces 3072-dimension vectors). */
export async function embedPassages(passages: string[], embed: Embed = embedTexts): Promise<number[][]> {
  if (!Array.isArray(passages) || passages.length === 0) throw new Error("INVALID_INPUT");
  for (const p of passages) {
    if (typeof p !== "string" || !p.trim() || p.length > 8000) throw new Error("INVALID_INPUT");
  }
  const vectors = await embed(passages);
  if (!vectors || vectors.length !== passages.length) throw new Error("AI_UNAVAILABLE");
  for (const v of vectors) {
    if (!v || v.length !== EMBEDDING_DIMS || !v.every((n) => typeof n === "number" && Number.isFinite(n))) {
      throw new Error("AI_UNAVAILABLE");
    }
  }
  return vectors;
}

export const toVec = (v: number[]) => `[${v.join(",")}]`;
export const SEARCH_FN: Record<KnowledgeDomain, string> = {
  SHAREABLE: "rag_search_shared",
  CONFIDENTIAL: "rag_search_confidential",
  CLINIC: "rag_search_clinic",
};

/**
 * Unified server-side knowledge search entry point.
 * Dispatches to hardened Supabase RPC functions:
 *  - CONFIDENTIAL -> rag_search_confidential (strictly checks PLATFORM_ADMIN)
 *  - CLINIC       -> rag_search_clinic (strictly checks clinicId multi-tenancy & APPROVED status)
 *  - SHAREABLE    -> rag_search_shared (strictly checks active caller & APPROVED status)
 */
export async function searchKnowledgeBase(
  db: Rpc,
  options: SearchKnowledgeBaseOptions,
  embed: Embed = embedTexts,
): Promise<RagPassage[]> {
  const { domain, queryText, clinicId, matchCount = 5, similarityThreshold = 0.0 } = options ?? {};

  if (!KNOWLEDGE_DOMAINS.includes(domain)) {
    throw new Error("INVALID_CLASSIFICATION");
  }

  const q = typeof queryText === "string" ? queryText.trim() : "";
  if (!q || q.length > 8000) {
    throw new Error("INVALID_INPUT");
  }

  if (domain === "CLINIC") {
    if (!clinicId || !/^[0-9a-f-]{36}$/i.test(clinicId)) {
      throw new Error("NOT_AUTHORISED");
    }
  }

  const n = Math.min(Math.max(1, Math.floor(matchCount)), MAX_RESULTS);
  const threshold =
    typeof similarityThreshold === "number" && Number.isFinite(similarityThreshold)
      ? Math.max(0.0, Math.min(1.0, similarityThreshold))
      : 0.0;

  let vectors: number[][];
  try {
    vectors = await embed([q]);
  } catch (e) {
    throw e;
  }

  const [vector] = vectors;
  if (
    !vector ||
    vector.length !== EMBEDDING_DIMS ||
    !vector.every((n) => typeof n === "number" && Number.isFinite(n))
  ) {
    throw new Error("AI_UNAVAILABLE");
  }

  const vecStr = toVec(vector);
  const args: Record<string, unknown> = {
    p_embedding: vecStr,
    p_count: n,
    p_threshold: threshold,
    query_embedding: vecStr,
    match_count: n,
    match_threshold: threshold,
  };

  if (domain === "CLINIC") {
    args["p_clinic"] = clinicId;
    args["p_clinic_id"] = clinicId;
  }

  const fnName = SEARCH_FN[domain];
  const { data, error } = await db.rpc(fnName, args);

  if (error) {
    throw new Error("NOT_AUTHORISED");
  }

  const passages: RagPassage[] = [];
  for (const r of (data ?? []) as any[]) {
    const sim = Number(r.similarity);
    if (!Number.isFinite(sim) || sim < threshold) continue;
    const passage: RagPassage = {
      chunkId: String(r.chunk_id ?? r.id ?? ""),
      sourceKey: String(r.source_key ?? ""),
      title: String(r.title ?? ""),
      content: String(r.content ?? ""),
      similarity: sim,
      domain,
      ...(r.document_id ? { documentId: String(r.document_id) } : {}),
    };
    passages.push(passage);
  }

  return passages.sort((a, b) => b.similarity - a.similarity).slice(0, n);
}

/**
 * Retrieves context for one scope. Each domain is a separate database function over a physically separate table —
 * never one combined search filtered afterwards. Unauthorised domains throw a generic error that reveals nothing.
 */
export async function retrieveContext(
  db: Rpc,
  scope: { kind: "clinic"; clinicId: string } | { kind: "platform-admin" },
  query: string,
  count = 5,
  embed: Embed = embedTexts,
): Promise<RetrievedChunk[]> {
  const q = query.trim();
  if (!q || q.length > 8000) throw new Error("INVALID_INPUT");
  if (scope.kind === "clinic" && !/^[0-9a-f-]{36}$/i.test(scope.clinicId)) throw new Error("NOT_AUTHORISED");
  const [vector] = await embed([q]);
  if (!vector) throw new Error("AI_UNAVAILABLE");
  const n = Math.min(Math.max(1, Math.floor(count)), MAX_RESULTS);
  const results: RetrievedChunk[] = [];
  for (const domain of allowedDomains(scope.kind === "clinic" ? "clinic" : "platform-admin")) {
    const args: Record<string, unknown> = { p_embedding: toVec(vector), p_count: n };
    if (domain === "CLINIC") args["p_clinic"] = (scope as { clinicId: string }).clinicId;
    const { data, error } = await db.rpc(SEARCH_FN[domain], args);
    if (error) throw new Error("NOT_AUTHORISED");
    for (const r of (data ?? []) as {
      chunk_id: string;
      source_key: string;
      title: string;
      content: string;
      similarity: number;
    }[])
      results.push({
        chunkId: r.chunk_id,
        sourceKey: r.source_key,
        title: r.title,
        content: r.content,
        similarity: Number(r.similarity),
        domain,
      });
  }
  return results.sort((a, b) => b.similarity - a.similarity).slice(0, n);
}

/** Chunks, embeds and replaces a document atomically (old chunks are removed in the same database call). */
export async function ingestDocument(
  db: Rpc,
  doc: { domain: KnowledgeDomain; clinicId: string | null; sourceKey: string; title: string; text: string },
  embed: Embed = embedTexts,
) {
  if (!KNOWLEDGE_DOMAINS.includes(doc.domain)) throw new Error("INVALID_CLASSIFICATION");
  if ((doc.domain === "CLINIC") !== !!doc.clinicId) throw new Error("INVALID_CLASSIFICATION");
  const chunks = chunkText(doc.text);
  if (!chunks.length || chunks.length > 500) throw new Error("INVALID_INPUT");
  const vectors = await embed(chunks);
  const { data, error } = await db.rpc("rag_upsert_document", {
    p_domain: doc.domain,
    p_clinic: doc.clinicId,
    p_source_key: doc.sourceKey,
    p_title: doc.title,
    p_chunks: chunks.map((content, i) => ({ content, embedding: toVec(vectors[i] ?? []) })),
  });
  if (error) throw new Error("NOT_AUTHORISED");
  return { documentId: data as string, chunks: chunks.length };
}

export async function deleteDocument(
  db: Rpc,
  doc: { domain: KnowledgeDomain; clinicId: string | null; sourceKey: string },
) {
  if (!KNOWLEDGE_DOMAINS.includes(doc.domain)) throw new Error("INVALID_CLASSIFICATION");
  const { data, error } = await db.rpc("rag_delete_document", {
    p_domain: doc.domain,
    p_clinic: doc.clinicId,
    p_source_key: doc.sourceKey,
  });
  if (error) throw new Error("NOT_AUTHORISED");
  return data === true;
}
