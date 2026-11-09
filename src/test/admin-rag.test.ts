import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  executeAdminRagSearch,
  synthesizeAdminAnswer,
  validateAdminRagInput,
  type AdminRagSearchInput,
} from "@/lib/assistant.server";
import type { RagPassage } from "@/lib/rag";

const SUPER_ADMIN_ID = "00000000-0000-0000-0000-000000000001";
const DOCTOR_ID = "00000000-0000-0000-0000-000000000002";
const SUSPENDED_ADMIN_ID = "00000000-0000-0000-0000-000000000003";

const sampleConfidentialPassages: RagPassage[] = [
  {
    chunkId: "chunk-conf-1",
    documentId: "doc-conf-1",
    sourceKey: "admin/subscription-mandates",
    title: "Subscription Mandate Lifecycle",
    content: "Trial mandates are authenticated via Razorpay webhook and record a 21-day trial.",
    similarity: 0.91,
    domain: "CONFIDENTIAL",
  },
  {
    chunkId: "chunk-conf-2",
    documentId: "doc-conf-2",
    sourceKey: "admin/clinic-actions",
    title: "Clinic Suspension Protocols",
    content: "Clinic suspension requires recording a reason and immediately deactivates operational flags.",
    similarity: 0.82,
    domain: "CONFIDENTIAL",
  },
];

const mockSupabaseClient = (profileData: { platform_role: string; status: string } | null, rpcImpl?: any) => {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: profileData, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(rpcImpl ?? (() => Promise.resolve({ data: [], error: null }))),
  };
};

describe("Sub-Stage 1.3: Super Admin Backend RAG Endpoint (adminRagSearch)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("Input Validation", () => {
    it("accepts valid admin query and clamps matchCount between 1 and 10", () => {
      const valid = validateAdminRagInput({ queryText: "Platform compliance specs", matchCount: 20 });
      expect(valid.queryText).toBe("Platform compliance specs");
      expect(valid.matchCount).toBe(10);
      expect(valid.similarityThreshold).toBe(0.0);
    });

    it("rejects empty or whitespace queryText with INVALID_INPUT", () => {
      expect(() => validateAdminRagInput({ queryText: "" })).toThrow("INVALID_INPUT");
      expect(() => validateAdminRagInput({ queryText: "   " })).toThrow("INVALID_INPUT");
    });

    it("rejects excessively long queryText over 8000 characters", () => {
      expect(() => validateAdminRagInput({ queryText: "A".repeat(8001) })).toThrow("INVALID_INPUT");
    });
  });

  describe("Authorization & Security Guardrails", () => {
    it("allows active PLATFORM_ADMIN callers to execute confidential RAG queries", async () => {
      const db = mockSupabaseClient({ platform_role: "PLATFORM_ADMIN", status: "ACTIVE" });
      const searchMock = vi.fn(async () => sampleConfidentialPassages);
      const synthMock = vi.fn(async () => "Synthesized compliance response.");

      const result = await executeAdminRagSearch(
        db as never,
        SUPER_ADMIN_ID,
        { queryText: "How are clinic trials mandated?" },
        { search: searchMock, synthesize: synthMock }
      );

      expect(result.domain).toBe("CONFIDENTIAL");
      expect(result.answer).toBe("Synthesized compliance response.");
      expect(result.sources).toHaveLength(2);
      expect(searchMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ domain: "CONFIDENTIAL" })
      );
    });

    it("fails closed with NOT_AUTHORISED when caller has non-admin role (DOCTOR, STAFF, OWNER, PATIENT)", async () => {
      const db = mockSupabaseClient({ platform_role: "DOCTOR", status: "ACTIVE" });
      const searchMock = vi.fn();

      await expect(
        executeAdminRagSearch(
          db as never,
          DOCTOR_ID,
          { queryText: "Show confidential governance documents" },
          { search: searchMock }
        )
      ).rejects.toThrow("NOT_AUTHORISED");

      expect(searchMock).not.toHaveBeenCalled();
    });

    it("fails closed with NOT_AUTHORISED when admin account is SUSPENDED", async () => {
      const db = mockSupabaseClient({ platform_role: "PLATFORM_ADMIN", status: "SUSPENDED" });
      const searchMock = vi.fn();

      await expect(
        executeAdminRagSearch(
          db as never,
          SUSPENDED_ADMIN_ID,
          { queryText: "Platform secrets" },
          { search: searchMock }
        )
      ).rejects.toThrow("NOT_AUTHORISED");

      expect(searchMock).not.toHaveBeenCalled();
    });

    it("fails closed with NOT_AUTHORISED when profile is missing", async () => {
      const db = mockSupabaseClient(null);
      const searchMock = vi.fn();

      await expect(
        executeAdminRagSearch(
          db as never,
          "non-existent-user",
          { queryText: "Platform secrets" },
          { search: searchMock }
        )
      ).rejects.toThrow("NOT_AUTHORISED");

      expect(searchMock).not.toHaveBeenCalled();
    });
  });

  describe("Unmetered Execution & Domain Routing", () => {
    it("bypasses clinic AI credits completely (does not call ai_reserve_credit_as or clinic_ai_enabled)", async () => {
      const db = mockSupabaseClient({ platform_role: "PLATFORM_ADMIN", status: "ACTIVE" });
      const searchMock = vi.fn(async () => sampleConfidentialPassages);
      const synthMock = vi.fn(async () => "Unmetered answer.");

      await executeAdminRagSearch(
        db as never,
        SUPER_ADMIN_ID,
        { queryText: "Subscription audit rules" },
        { search: searchMock, synthesize: synthMock }
      );

      // Verify that no credit RPCs were called on the database
      const calledFns = db.rpc.mock.calls.map((c) => c[0]);
      expect(calledFns).not.toContain("ai_reserve_credit_as");
      expect(calledFns).not.toContain("ai_finish_credit_as");
      expect(calledFns).not.toContain("clinic_ai_enabled");
    });

    it("strictly dispatches to CONFIDENTIAL domain with configured matchCount and threshold", async () => {
      const db = mockSupabaseClient({ platform_role: "PLATFORM_ADMIN", status: "ACTIVE" });
      const searchMock = vi.fn(async () => sampleConfidentialPassages);

      await executeAdminRagSearch(
        db as never,
        SUPER_ADMIN_ID,
        {
          queryText: "Audit procedures",
          matchCount: 8,
          similarityThreshold: 0.7,
        },
        { search: searchMock, synthesize: vi.fn(async () => "Done") }
      );

      expect(searchMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          domain: "CONFIDENTIAL",
          queryText: "Audit procedures",
          matchCount: 8,
          similarityThreshold: 0.7,
        })
      );
    });
  });

  describe("Response Synthesis & Output", () => {
    it("gracefully returns empty sources and clear message when zero passages match", async () => {
      const db = mockSupabaseClient({ platform_role: "PLATFORM_ADMIN", status: "ACTIVE" });
      const searchMock = vi.fn(async () => []);
      const synthMock = vi.fn();

      const result = await executeAdminRagSearch(
        db as never,
        SUPER_ADMIN_ID,
        { queryText: "Unmatched query topic" },
        { search: searchMock, synthesize: synthMock }
      );

      expect(result.domain).toBe("CONFIDENTIAL");
      expect(result.sources).toEqual([]);
      expect(result.answer).toContain("No relevant confidential governance documentation was found");
      expect(synthMock).not.toHaveBeenCalled();
    });

    it("synthesizeAdminAnswer handles Gemini API rate limiting (429) with AI_RATE_LIMITED", async () => {
      process.env["GEMINI_API_KEY"] = "fake-key";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 429,
      } as Response);

      await expect(
        synthesizeAdminAnswer("Governance question", sampleConfidentialPassages)
      ).rejects.toThrow("AI_RATE_LIMITED");
    });

    it("synthesizeAdminAnswer handles Gemini API server errors (500) with AI_UNAVAILABLE", async () => {
      process.env["GEMINI_API_KEY"] = "fake-key";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      await expect(
        synthesizeAdminAnswer("Governance question", sampleConfidentialPassages)
      ).rejects.toThrow("AI_UNAVAILABLE");
    });

    it("synthesizeAdminAnswer formats response from Gemini generateContent API", async () => {
      process.env["GEMINI_API_KEY"] = "fake-key";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: "### Subscription Governance\n\nAll clinics require an active mandate.",
                  },
                ],
              },
            },
          ],
        }),
      } as Response);

      const answer = await synthesizeAdminAnswer("Tell me about subscriptions", sampleConfidentialPassages);
      expect(answer).toBe("### Subscription Governance\n\nAll clinics require an active mandate.");
    });
  });
});

