import { describe, expect, it, vi } from "vitest";
import { embedPassages, embedQuery, searchKnowledgeBase } from "@/lib/rag.server";
import { EMBEDDING_DIMS, type KnowledgeDomain } from "@/lib/rag";

const VALID_CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const makeFakeVector = (dim = 3072, fill = 0.02) => Array(dim).fill(fill);
const fakeEmbed3072 = async (inputs: string[]) => inputs.map(() => makeFakeVector(3072));

const mockDb = (fnImpl: (fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown }) => {
  const rpc = vi.fn((fn: string, args: Record<string, unknown>) => Promise.resolve(fnImpl(fn, args)));
  return { rpc };
};

describe("Sub-Stage 1.2: Server Embedding Engine (embedQuery & embedPassages)", () => {
  it("embedQuery successfully returns a 3072-dimension vector", async () => {
    const vector = await embedQuery("Patient intake guidelines", fakeEmbed3072);
    expect(vector).toHaveLength(EMBEDDING_DIMS);
    expect(vector[0]).toBe(0.02);
  });

  it("embedQuery rejects empty or whitespace-only inputs with INVALID_INPUT", async () => {
    await expect(embedQuery("", fakeEmbed3072)).rejects.toThrow("INVALID_INPUT");
    await expect(embedQuery("   ", fakeEmbed3072)).rejects.toThrow("INVALID_INPUT");
  });

  it("embedQuery strictly enforces 3072-dimension outputs and fails closed on dimension mismatch", async () => {
    const fakeBadEmbed = async (xs: string[]) => xs.map(() => makeFakeVector(1536));
    await expect(embedQuery("Cardiology follow-up protocol", fakeBadEmbed)).rejects.toThrow("AI_UNAVAILABLE");
  });

  it("embedQuery fails closed when embedding contains non-finite numbers or NaN", async () => {
    const fakeNanEmbed = async (xs: string[]) => xs.map(() => {
      const v = makeFakeVector(3072);
      v[10] = NaN;
      return v;
    });
    await expect(embedQuery("Cardiology protocol", fakeNanEmbed)).rejects.toThrow("AI_UNAVAILABLE");
  });

  it("embedPassages embeds multiple passages and verifies 3072-dimension integrity for all items", async () => {
    const passages = [
      "Clinic operating policy paragraph 1",
      "Doctor consultation notes and requirements",
      "Staff front-desk emergency procedures",
    ];
    const vectors = await embedPassages(passages, fakeEmbed3072);
    expect(vectors).toHaveLength(3);
    for (const vec of vectors) {
      expect(vec).toHaveLength(3072);
    }
  });

  it("embedPassages rejects empty arrays or invalid passage items with INVALID_INPUT", async () => {
    await expect(embedPassages([], fakeEmbed3072)).rejects.toThrow("INVALID_INPUT");
    await expect(embedPassages(["Valid passage", ""], fakeEmbed3072)).rejects.toThrow("INVALID_INPUT");
  });

  it("embedPassages fails closed when any passage vector fails the 3072 dimension check", async () => {
    const fakeInconsistentEmbed = async (xs: string[]) => [
      makeFakeVector(3072),
      makeFakeVector(768), // Mismatched dimension
    ];
    await expect(
      embedPassages(["Passage 1", "Passage 2"], fakeInconsistentEmbed)
    ).rejects.toThrow("AI_UNAVAILABLE");
  });
});

describe("Sub-Stage 1.2: Unified Vector Search Pipeline (searchKnowledgeBase)", () => {
  const sampleRows = [
    {
      chunk_id: "c1111111-1111-1111-1111-111111111111",
      document_id: "d1111111-1111-1111-1111-111111111111",
      source_key: "protocols/hypertension",
      title: "Hypertension Guidelines",
      content: "Stage 1 hypertension management recommendations.",
      similarity: 0.88,
    },
    {
      chunk_id: "c2222222-2222-2222-2222-222222222222",
      document_id: "d2222222-2222-2222-2222-222222222222",
      source_key: "protocols/diabetes",
      title: "Type 2 Diabetes Screening",
      content: "Annual HbA1c screening rules.",
      similarity: 0.65,
    },
  ];

  it("dispatches CONFIDENTIAL searches to rag_search_confidential with proper arguments", async () => {
    const db = mockDb((fn, args) => {
      expect(fn).toBe("rag_search_confidential");
      expect(args["p_count"]).toBe(5);
      expect(args["match_count"]).toBe(5);
      expect(args["p_threshold"]).toBe(0.5);
      expect(args["match_threshold"]).toBe(0.5);
      return { data: sampleRows, error: null };
    });

    const results = await searchKnowledgeBase(
      db,
      {
        domain: "CONFIDENTIAL",
        queryText: "Platform compliance rules",
        matchCount: 5,
        similarityThreshold: 0.5,
      },
      fakeEmbed3072
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.domain).toBe("CONFIDENTIAL");
    expect(results[0]?.title).toBe("Hypertension Guidelines");
    expect(results[0]?.similarity).toBe(0.88);
  });

  it("dispatches CLINIC searches to rag_search_clinic with clinic_id multi-tenant isolation", async () => {
    const db = mockDb((fn, args) => {
      expect(fn).toBe("rag_search_clinic");
      expect(args["p_clinic"]).toBe(VALID_CLINIC_ID);
      expect(args["p_clinic_id"]).toBe(VALID_CLINIC_ID);
      return { data: sampleRows, error: null };
    });

    const results = await searchKnowledgeBase(
      db,
      {
        domain: "CLINIC",
        queryText: "Clinic operational hours",
        clinicId: VALID_CLINIC_ID,
        matchCount: 3,
      },
      fakeEmbed3072
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.domain).toBe("CLINIC");
    expect(db.rpc).toHaveBeenCalledOnce();
  });

  it("dispatches SHAREABLE searches to rag_search_shared without clinic scope", async () => {
    const db = mockDb((fn, args) => {
      expect(fn).toBe("rag_search_shared");
      expect(args["p_clinic"]).toBeUndefined();
      return { data: sampleRows, error: null };
    });

    const results = await searchKnowledgeBase(
      db,
      {
        domain: "SHAREABLE",
        queryText: "Standard vital ranges",
      },
      fakeEmbed3072
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.domain).toBe("SHAREABLE");
  });

  it("strictly requires a valid clinicId for CLINIC domain searches and fails closed", async () => {
    const db = mockDb(() => ({ data: [], error: null }));

    await expect(
      searchKnowledgeBase(
        db,
        { domain: "CLINIC", queryText: "test" },
        fakeEmbed3072
      )
    ).rejects.toThrow("NOT_AUTHORISED");

    await expect(
      searchKnowledgeBase(
        db,
        { domain: "CLINIC", queryText: "test", clinicId: "invalid-uuid" },
        fakeEmbed3072
      )
    ).rejects.toThrow("NOT_AUTHORISED");

    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid domain classification with INVALID_CLASSIFICATION", async () => {
    const db = mockDb(() => ({ data: [], error: null }));

    await expect(
      searchKnowledgeBase(
        db,
        { domain: "UNKNOWN" as KnowledgeDomain, queryText: "query" },
        fakeEmbed3072
      )
    ).rejects.toThrow("INVALID_CLASSIFICATION");

    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("filters out results falling below similarityThreshold", async () => {
    const db = mockDb(() => ({ data: sampleRows, error: null }));

    const results = await searchKnowledgeBase(
      db,
      {
        domain: "SHAREABLE",
        queryText: "Blood pressure",
        similarityThreshold: 0.75, // Only 0.88 should pass, 0.65 is filtered
      },
      fakeEmbed3072
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.similarity).toBe(0.88);
  });

  it("gracefully returns empty array when zero passages match in the database", async () => {
    const db = mockDb(() => ({ data: [], error: null }));

    const results = await searchKnowledgeBase(
      db,
      { domain: "SHAREABLE", queryText: "Unmatched query" },
      fakeEmbed3072
    );

    expect(results).toEqual([]);
  });

  it("fails closed with NOT_AUTHORISED when the database RPC returns an authorization error", async () => {
    const db = mockDb(() => ({
      data: null,
      error: { message: "Not authorised", code: "42501" },
    }));

    await expect(
      searchKnowledgeBase(
        db,
        { domain: "CONFIDENTIAL", queryText: "Unauthorized probe" },
        fakeEmbed3072
      )
    ).rejects.toThrow("NOT_AUTHORISED");
  });

  it("fails closed when embedding generation engine throws an error", async () => {
    const db = mockDb(() => ({ data: sampleRows, error: null }));
    const failingEmbed = async () => {
      throw new Error("AI_RATE_LIMITED");
    };

    await expect(
      searchKnowledgeBase(
        db,
        { domain: "SHAREABLE", queryText: "Rate limited query" },
        failingEmbed
      )
    ).rejects.toThrow("AI_RATE_LIMITED");

    expect(db.rpc).not.toHaveBeenCalled();
  });
});

