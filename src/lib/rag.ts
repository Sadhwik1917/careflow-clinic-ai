/** Client-safe RAG rules. The database search/ingest functions are the authority; these only shape requests. */
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMS = 3072;
export const MAX_CHUNK_CHARS = 2400; // ~600 tokens; well under the model's 8192-token input cap
export const CHUNK_OVERLAP_CHARS = 200;
export const MAX_RESULTS = 10;

export type KnowledgeDomain = "SHAREABLE" | "CONFIDENTIAL" | "CLINIC";
export const KNOWLEDGE_DOMAINS: readonly KnowledgeDomain[] = ["SHAREABLE", "CONFIDENTIAL", "CLINIC"];

export type RetrievedChunk = { chunkId: string; sourceKey: string; title: string; content: string; similarity: number; domain: KnowledgeDomain };

/** Splits on paragraph/sentence boundaries; every character of the input lands in some chunk (never truncated). */
export function chunkText(text: string, max = MAX_CHUNK_CHARS, overlap = CHUNK_OVERLAP_CHARS): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + max, clean.length);
    if (end < clean.length) {
      const window = clean.slice(start, end);
      const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("\n"));
      if (cut > max / 2) end = start + cut + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

/** Clinic-facing requests may only search shareable docs + their own clinic; admin requests only shareable + confidential. */
export function allowedDomains(scope: "clinic" | "platform-admin"): KnowledgeDomain[] {
  return scope === "clinic" ? ["SHAREABLE", "CLINIC"] : ["SHAREABLE", "CONFIDENTIAL"];
}
