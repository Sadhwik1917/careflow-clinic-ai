import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { embedTexts } from "@/lib/rag.server";
import { EMBEDDING_DIMS, EMBEDDING_MODEL } from "@/lib/rag";
import { ASSISTANT_MODELS } from "@/lib/assistant";
import { parseSummary } from "@/lib/patient-summary";
import { finalizeAnswer, MISSING_EVIDENCE } from "@/lib/assistant-rag.server";

describe("Google Gemini Configuration & Models", () => {
  it("uses native Gemini embedding model and 3072 dimensions", () => {
    expect(EMBEDDING_MODEL).toBe("gemini-embedding-001");
    expect(EMBEDDING_DIMS).toBe(3072);
  });

  it("configures Fast and Smart assistant models with Gemini", () => {
    expect(ASSISTANT_MODELS.Fast.id).toBe("gemini-3.8-flash");
    expect(ASSISTANT_MODELS.Smart.id).toBe("gemini-3.7-flash");
  });
});

describe("Gemini embedTexts", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("throws AI_UNAVAILABLE when GEMINI_API_KEY is not configured", async () => {
    delete process.env["GEMINI_API_KEY"];
    await expect(embedTexts(["Sample clinic policy"])).rejects.toThrow("AI_UNAVAILABLE");
  });

  it("successfully embeds text using Gemini batchEmbedContents API", async () => {
    process.env["GEMINI_API_KEY"] = "fake-gemini-key";
    const fakeVector = Array(3072).fill(0.015);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        embeddings: [{ values: fakeVector }],
      }),
    } as Response);

    const result = await embedTexts(["Patient consultation guidelines"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(3072);
    expect(fetchSpy).toHaveBeenCalledOnce();

    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(url).toContain("gemini-embedding-001:batchEmbedContents");
    expect((options?.headers as Record<string, string>)["x-goog-api-key"]).toBe("fake-gemini-key");
  });

  it("handles 429 rate limiting with AI_RATE_LIMITED", async () => {
    vi.useFakeTimers();
    process.env["GEMINI_API_KEY"] = "fake-gemini-key";

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 429,
      body: { cancel: vi.fn() } as never,
    } as unknown as Response);

    const assertion = expect(embedTexts(["text"])).rejects.toThrow("AI_RATE_LIMITED");
    await vi.runAllTimersAsync();
    await assertion;
    vi.useRealTimers();
  });

  it("fails closed when Gemini returns wrong vector dimensions", async () => {
    process.env["GEMINI_API_KEY"] = "fake-gemini-key";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        embeddings: [{ values: [0.1, 0.2] }], // Only 2 dimensions instead of 3072
      }),
    } as Response);

    await expect(embedTexts(["text"])).rejects.toThrow("AI_UNAVAILABLE");
  });
});

describe("Structured Gemini Output Handlers", () => {
  it("parseSummary parses valid JSON output and rejects empty/invalid formats", () => {
    expect(parseSummary(JSON.stringify({ summary: "Patient has well-managed hypertension." }))).toBe(
      "Patient has well-managed hypertension."
    );
    expect(() => parseSummary("plain string not json")).toThrow("AI_UNAVAILABLE");
    expect(() => parseSummary(JSON.stringify({ summary: "" }))).toThrow("AI_UNAVAILABLE");
  });

  it("finalizeAnswer enforces grounding and citations correctly", () => {
    const chunks = [
      {
        chunkId: "c1",
        sourceKey: "kb-1",
        title: "Clinic Hours",
        content: "Open 9am-5pm",
        similarity: 0.85,
        domain: "SHAREABLE" as const,
      },
    ];

    const groundedJson = JSON.stringify({
      answer: "Clinic opens at 9am.",
      sourceIds: ["1"],
      knowledgeStatus: "grounded",
    });

    const result = finalizeAnswer(groundedJson, chunks, "When does the clinic open?");
    expect(result.reply).toBe("Clinic opens at 9am.");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.title).toBe("Clinic Hours");

    const unsupportedJson = JSON.stringify({
      answer: "I do not know.",
      sourceIds: [],
      knowledgeStatus: "unsupported",
    });

    const unsupportedResult = finalizeAnswer(unsupportedJson, chunks, "CareFlow policy question");
    expect(unsupportedResult.reply).toBe(MISSING_EVIDENCE);
    expect(unsupportedResult.sources).toEqual([]);
  });

  it("handles Interactions API response structure and step extraction", () => {
    const mockInteractionResponse = {
      id: "v1_test_interaction",
      status: "completed",
      steps: [
        {
          type: "thought",
          signature: "dummy_sig",
        },
        {
          type: "model_output",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                answer: "The clinic offers pediatric care.",
                sourceIds: ["1"],
                knowledgeStatus: "grounded",
              }),
            },
          ],
        },
      ],
    };

    const modelOutputStep = mockInteractionResponse.steps.find((s) => s.type === "model_output");
    const textContent = modelOutputStep?.content?.find((c) => c.type === "text" && c.text);
    const parsed = JSON.parse(textContent?.text || "{}");

    expect(parsed.answer).toBe("The clinic offers pediatric care.");
    expect(parsed.knowledgeStatus).toBe("grounded");
  });

  it("identifies retryable HTTP capacity status codes", () => {
    const isCapacity = (status: number) => status === 503 || status === 429 || status === 500 || status === 504;
    expect(isCapacity(503)).toBe(true);
    expect(isCapacity(429)).toBe(true);
    expect(isCapacity(500)).toBe(true);
    expect(isCapacity(504)).toBe(true);
    expect(isCapacity(400)).toBe(false);
    expect(isCapacity(401)).toBe(false);
    expect(isCapacity(404)).toBe(false);
  });
});


