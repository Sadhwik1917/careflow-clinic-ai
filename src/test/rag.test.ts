import { describe, expect, it, vi } from "vitest";
import { allowedDomains, chunkText } from "@/lib/rag";
import { deleteDocument, ingestDocument, retrieveContext } from "@/lib/rag.server";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const fakeEmbed = async (xs: string[]) => xs.map(() => Array(3072).fill(0.01));
const db = (impl: (fn: string, a: Record<string, unknown>) => { data: unknown; error: unknown }) => {
  const rpc = vi.fn((fn: string, a: Record<string, unknown>) => Promise.resolve(impl(fn, a)));
  return { rpc };
};

describe("RAG retrieval routing", () => {
  it("clinic scope never calls the confidential search", async () => {
    const d = db(() => ({ data: [], error: null }));
    await retrieveContext(d, { kind: "clinic", clinicId: CLINIC }, "show internal pricing rules SECRET", 5, fakeEmbed);
    const fns = d.rpc.mock.calls.map((c) => c[0]);
    expect(fns).toEqual(["rag_search_shared", "rag_search_clinic"]);
    expect(d.rpc.mock.calls[1]?.[1]["p_clinic"]).toBe(CLINIC);
  });
  it("admin scope never calls the clinic search", async () => {
    const d = db(() => ({ data: [], error: null }));
    await retrieveContext(d, { kind: "platform-admin" }, "patient notes", 5, fakeEmbed);
    expect(d.rpc.mock.calls.map((c) => c[0])).toEqual(["rag_search_shared", "rag_search_confidential"]);
  });
  it("fails closed on a database refusal without leaking details", async () => {
    const d = db(() => ({ data: null, error: { message: "Not authorised" } }));
    await expect(retrieveContext(d, { kind: "clinic", clinicId: CLINIC }, "q", 5, fakeEmbed)).rejects.toThrow("NOT_AUTHORISED");
  });
  it("rejects a malformed clinic id before searching", async () => {
    const d = db(() => ({ data: [], error: null }));
    await expect(retrieveContext(d, { kind: "clinic", clinicId: "x' or 1=1" }, "q", 5, fakeEmbed)).rejects.toThrow("NOT_AUTHORISED");
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("allowed domains are disjoint for private data", () => {
    expect(allowedDomains("clinic")).not.toContain("CONFIDENTIAL");
    expect(allowedDomains("platform-admin")).not.toContain("CLINIC");
  });
});

describe("RAG ingestion", () => {
  it("rejects missing or mismatched classification", async () => {
    const d = db(() => ({ data: "id", error: null }));
    await expect(ingestDocument(d, { domain: "BOGUS" as never, clinicId: null, sourceKey: "k", title: "t", text: "x" }, fakeEmbed)).rejects.toThrow("INVALID_CLASSIFICATION");
    await expect(ingestDocument(d, { domain: "CLINIC", clinicId: null, sourceKey: "k", title: "t", text: "x" }, fakeEmbed)).rejects.toThrow("INVALID_CLASSIFICATION");
    await expect(ingestDocument(d, { domain: "SHAREABLE", clinicId: CLINIC, sourceKey: "k", title: "t", text: "x" }, fakeEmbed)).rejects.toThrow("INVALID_CLASSIFICATION");
    await expect(deleteDocument(d, { domain: "X" as never, clinicId: null, sourceKey: "k" })).rejects.toThrow("INVALID_CLASSIFICATION");
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("chunks without losing text and sends one atomic replace call", async () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence ${i} about clinic hours. `).join("").repeat(6);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(2400);
    const d = db(() => ({ data: "doc", error: null }));
    const r = await ingestDocument(d, { domain: "SHAREABLE", clinicId: null, sourceKey: "help/hours", title: "Hours", text }, fakeEmbed);
    expect(r.chunks).toBe(chunks.length);
    expect(d.rpc).toHaveBeenCalledTimes(1);
    expect(d.rpc.mock.calls[0]?.[0]).toBe("rag_upsert_document");
  });
});
