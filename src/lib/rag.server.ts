/**
 * Server-only retrieval service (future AI Assistant + Patient History Summary).
 * `db` MUST be the caller's RLS client (context.supabase from requireSupabaseAuth): every search/ingest database function
 * re-checks auth.uid(), role and clinic membership itself, so a wrong scope here fails closed, never open.
 * Never pass the service-role client — it has no auth.uid() and every call is refused.
 */
import { EMBEDDING_DIMS, EMBEDDING_MODEL, KNOWLEDGE_DOMAINS, MAX_RESULTS, allowedDomains, chunkText, type KnowledgeDomain, type RetrievedChunk } from "@/lib/rag";

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
type Embed = (inputs: string[]) => Promise<number[][]>;

export async function embedTexts(inputs: string[]): Promise<number[][]> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI_UNAVAILABLE");
  const out: number[][] = [];
  for (let i = 0; i < inputs.length; i += 100) {
    const batch = inputs.slice(i, i + 100);
    let res: Response | undefined;
    for (let attempt = 1; attempt <= 3; attempt++) {
      res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch }),
      });
      if (res.ok || !(res.status === 429 || res.status >= 500) || attempt === 3) break;
      await res.body?.cancel();
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt + Math.random() * 500));
    }
    if (!res?.ok) { console.error("embedding error", res?.status); throw new Error(res?.status === 429 ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE"); }
    const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    const ordered: number[][] = [];
    for (const d of json.data) {
      if (!Number.isInteger(d.index) || d.index < 0 || d.index >= batch.length || ordered[d.index] || d.embedding?.length !== EMBEDDING_DIMS) throw new Error("AI_UNAVAILABLE");
      ordered[d.index] = d.embedding;
    }
    for (let j = 0; j < batch.length; j++) { if (!ordered[j]) throw new Error("AI_UNAVAILABLE"); out.push(ordered[j]); }
  }
  return out;
}

const toVec = (v: number[]) => `[${v.join(",")}]`;
const SEARCH_FN: Record<KnowledgeDomain, string> = { SHAREABLE: "rag_search_shared", CONFIDENTIAL: "rag_search_confidential", CLINIC: "rag_search_clinic" };

/**
 * Retrieves context for one scope. Each domain is a separate database function over a physically separate table —
 * never one combined search filtered afterwards. Unauthorised domains throw a generic error that reveals nothing.
 */
export async function retrieveContext(db: Rpc, scope: { kind: "clinic"; clinicId: string } | { kind: "platform-admin" }, query: string, count = 5, embed: Embed = embedTexts): Promise<RetrievedChunk[]> {
  const q = query.trim();
  if (!q || q.length > 8000) throw new Error("INVALID_INPUT");
  if (scope.kind === "clinic" && !/^[0-9a-f-]{36}$/i.test(scope.clinicId)) throw new Error("NOT_AUTHORISED");
  const [vector] = await embed([q]); if (!vector) throw new Error("AI_UNAVAILABLE");
  const n = Math.min(Math.max(1, Math.floor(count)), MAX_RESULTS);
  const results: RetrievedChunk[] = [];
  for (const domain of allowedDomains(scope.kind === "clinic" ? "clinic" : "platform-admin")) {
    const args: Record<string, unknown> = { p_embedding: toVec(vector), p_count: n };
    if (domain === "CLINIC") args["p_clinic"] = (scope as { clinicId: string }).clinicId;
    const { data, error } = await db.rpc(SEARCH_FN[domain], args);
    if (error) throw new Error("NOT_AUTHORISED");
    for (const r of (data ?? []) as { chunk_id: string; source_key: string; title: string; content: string; similarity: number }[])
      results.push({ chunkId: r.chunk_id, sourceKey: r.source_key, title: r.title, content: r.content, similarity: Number(r.similarity), domain });
  }
  return results.sort((a, b) => b.similarity - a.similarity).slice(0, n);
}

/** Chunks, embeds and replaces a document atomically (old chunks are removed in the same database call). */
export async function ingestDocument(db: Rpc, doc: { domain: KnowledgeDomain; clinicId: string | null; sourceKey: string; title: string; text: string }, embed: Embed = embedTexts) {
  if (!KNOWLEDGE_DOMAINS.includes(doc.domain)) throw new Error("INVALID_CLASSIFICATION");
  if ((doc.domain === "CLINIC") !== !!doc.clinicId) throw new Error("INVALID_CLASSIFICATION");
  const chunks = chunkText(doc.text);
  if (!chunks.length || chunks.length > 500) throw new Error("INVALID_INPUT");
  const vectors = await embed(chunks);
  const { data, error } = await db.rpc("rag_upsert_document", {
    p_domain: doc.domain, p_clinic: doc.clinicId, p_source_key: doc.sourceKey, p_title: doc.title,
    p_chunks: chunks.map((content, i) => ({ content, embedding: toVec(vectors[i] ?? []) })),
  });
  if (error) throw new Error("NOT_AUTHORISED");
  return { documentId: data as string, chunks: chunks.length };
}

export async function deleteDocument(db: Rpc, doc: { domain: KnowledgeDomain; clinicId: string | null; sourceKey: string }) {
  if (!KNOWLEDGE_DOMAINS.includes(doc.domain)) throw new Error("INVALID_CLASSIFICATION");
  const { data, error } = await db.rpc("rag_delete_document", { p_domain: doc.domain, p_clinic: doc.clinicId, p_source_key: doc.sourceKey });
  if (error) throw new Error("NOT_AUTHORISED");
  return data === true;
}
