import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { meteredAi } from "@/lib/ai.functions";
import { ASSISTANT_COMMANDS, ASSISTANT_EFFORTS, ASSISTANT_MODELS, MAX_FILES, MAX_HISTORY, MAX_MESSAGE_CHARS, checkFile, type AssistantEffort, type AssistantFile, type AssistantModel, type AssistantTurn, type AssistantCommandId } from "@/lib/assistant";

type Input = { clinicId: string; requestId: string; model: AssistantModel; effort: AssistantEffort; command: AssistantCommandId | null; message: string; history: AssistantTurn[]; files: AssistantFile[] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validate(i: Input): Input {
  const bad = () => { throw new Error("INVALID_INPUT"); };
  if (!i || !uuid.test(i.clinicId) || !uuid.test(i.requestId)) bad();
  if (!(i.model in ASSISTANT_MODELS) || !ASSISTANT_EFFORTS.includes(i.effort)) bad();
  if (i.command !== null && !ASSISTANT_COMMANDS.some((c) => c.id === i.command)) bad();
  if (typeof i.message !== "string" || !i.message.trim() || i.message.length > MAX_MESSAGE_CHARS) bad();
  if (!Array.isArray(i.history) || i.history.length > MAX_HISTORY) bad();
  for (const t of i.history) if ((t.role !== "user" && t.role !== "assistant") || typeof t.text !== "string" || t.text.length > 20000) bad();
  if (!Array.isArray(i.files) || i.files.length > MAX_FILES) bad();
  for (const f of i.files) {
    const size = f.kind === "image" ? Math.floor((f.data?.length ?? 0) * 0.75) : new TextEncoder().encode(f.data ?? "").length;
    const c = checkFile({ name: String(f.name), type: f.kind === "image" ? f.mime : "text/plain", size });
    if (!c.ok || c.kind !== f.kind || typeof f.data !== "string") bad();
  }
  return i;
}

/** Calls Google Gemini Interactions API server-side and returns the structured JSON text. */
async function generate(i: Input, signal: AbortSignal, references: string, instructions: string, _format: Record<string, unknown>) {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("AI_UNAVAILABLE");

  const modelId = ASSISTANT_MODELS[i.model]?.id || "gemini-3.8-flash";
  const cleanModel = modelId.replace(/^google\//, "");

  const inputSteps: {
    type: "user_input" | "model_output";
    content: (
      | { type: "text"; text: string }
      | { type: "image"; mime_type: string; data: string }
    )[];
  }[] = [];

  for (const t of i.history) {
    inputSteps.push({
      type: t.role === "user" ? "user_input" : "model_output",
      content: [{ type: "text", text: t.text }],
    });
  }

  const currentUserContent: (
    | { type: "text"; text: string }
    | { type: "image"; mime_type: string; data: string }
  )[] = [];

  if (references.trim()) {
    currentUserContent.push({ type: "text", text: references });
  }

  const cmd = ASSISTANT_COMMANDS.find((c) => c.id === i.command);
  const promptText = cmd ? `${cmd.instruction}\n\n${i.message}` : i.message;
  currentUserContent.push({ type: "text", text: promptText });

  for (const f of i.files) {
    if (f.kind === "image") {
      currentUserContent.push({
        type: "image",
        mime_type: f.mime,
        data: f.data,
      });
    } else {
      currentUserContent.push({
        type: "text",
        text: `Attached file "${f.name}":\n\n${f.data}`,
      });
    }
  }

  inputSteps.push({
    type: "user_input",
    content: currentUserContent,
  });

  const candidateModels = [cleanModel, "gemini-3.5-flash"].filter((m, idx, arr) => arr.indexOf(m) === idx);

  let lastError: Error | null = null;

  for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
    const currentModel = candidateModels[mIdx]!;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      signal.throwIfAborted();
      let res: Response;
      try {
        res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST",
          signal,
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            model: currentModel,
            input: inputSteps,
            system_instruction: instructions,
            response_format: {
              type: "text",
              mime_type: "application/json",
              schema: {
                type: "object",
                properties: {
                  answer: { type: "string" },
                  sourceIds: {
                    type: "array",
                    items: { type: "string" },
                  },
                  knowledgeStatus: {
                    type: "string",
                    enum: ["grounded", "general", "unsupported"],
                  },
                },
                required: ["answer", "sourceIds", "knowledgeStatus"],
              },
            },
          }),
        });
      } catch (networkErr) {
        if (signal.aborted) throw networkErr;
        lastError = new Error("AI_UNAVAILABLE");
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, Math.min(attempt * 1000, 3000)));
          continue;
        }
        break; // try fallback model
      }

      if (res.ok) {
        const json = (await res.json()) as {
          status?: string;
          steps?: {
            type: string;
            content?: { type: string; text?: string }[];
          }[];
          error?: unknown;
        };

        if (json.error) {
          console.error("assistant response error", json.error);
          lastError = new Error("AI_UNAVAILABLE");
          break;
        }

        const modelOutputStep = json.steps?.find((s) => s.type === "model_output");
        const textContent = modelOutputStep?.content?.find((c) => c.type === "text" && c.text);
        const text = textContent?.text;

        if (!text || !text.trim()) {
          lastError = new Error("AI_UNAVAILABLE");
          break;
        }

        return text;
      }

      // Check for transient capacity / rate limit errors
      const isCapacityError = res.status === 503 || res.status === 429 || res.status === 500 || res.status === 504;
      if (isCapacityError) {
        lastError = new Error(res.status === 429 ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE");
        if (attempt < maxAttempts) {
          const retryAfterSec = parseInt(res.headers.get("retry-after") || "", 10);
          const delayMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
            ? Math.min(retryAfterSec * 1000, 5000)
            : Math.min(attempt * 1000, 3000);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        // Exceeded attempts on this model, proceed to fallback model
        break;
      }

      // Non-retryable error (e.g. 400 Bad Request, 401/403 Auth error)
      const errText = await res.text().catch(() => "");
      console.error(`assistant non-retryable error on ${currentModel}`, res.status, errText);
      throw new Error("AI_UNAVAILABLE");
    }
  }

  throw lastError || new Error("AI_UNAVAILABLE");
}

/** One assistant reply. Runs through meteredAi: plan check + 1 credit, charged only on success. */
export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assistantReferences, referenceInput, finalizeAnswer, ASSISTANT_SYSTEM, GROUNDED_FORMAT } = await import("@/lib/assistant-rag.server");
    const signal = getRequest().signal;
    const { data: profile, error } = await context.supabase.from("profiles").select("platform_role, status").eq("id", context.userId).maybeSingle();
    if (error || !profile || profile.status !== "ACTIVE") throw new Error("NOT_AUTHORISED");
    const run = async (scope: Parameters<typeof assistantReferences>[1]) => {
      const chunks = await assistantReferences(context.supabase as never, scope, data.message, signal);
      const raw = await generate(data, signal, referenceInput(chunks), ASSISTANT_SYSTEM, GROUNDED_FORMAT);
      signal.throwIfAborted();
      return finalizeAnswer(raw, chunks, data.message);
    };
    // Explicit admin entitlement: platform admins use the assistant unmetered — no clinic's credits are ever consumed.
    if (profile.platform_role === "PLATFORM_ADMIN") return await run({ kind: "platform-admin" });
    return await meteredAi(context.supabase as never, supabaseAdmin as never, context.userId, data.clinicId, "assistant", data.requestId,
      () => run({ kind: "clinic", clinicId: data.clinicId }));
  });
