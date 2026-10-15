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

const SYSTEM = "You are CareFlow's assistant for clinic teams in India. Help with clinic administration, patient communication and general health information. You can't see the clinic's records, appointments or patients unless the user pastes or attaches them. Don't diagnose or prescribe; for clinical decisions, remind the user that a qualified doctor must decide. Reply in clear Markdown.";

/** Streams the gateway's SSE response server-side and returns the final text. */
async function generate(i: Input, signal: AbortSignal) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI_UNAVAILABLE");
  const cmd = ASSISTANT_COMMANDS.find((c) => c.id === i.command);
  const content: Record<string, unknown>[] = [{ type: "input_text", text: cmd ? `${cmd.instruction}\n\n${i.message}` : i.message }];
  for (const f of i.files) {
    if (f.kind === "image") content.push({ type: "input_image", image_url: `data:${f.mime};base64,${f.data}` });
    else content.push({ type: "input_text", text: `Attached file "${f.name}":\n\n${f.data}` });
  }
  const input = [
    ...i.history.map((t) => ({ role: t.role, content: [{ type: t.role === "user" ? "input_text" : "output_text", text: t.text }] })),
    { role: "user", content },
  ];
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: ASSISTANT_MODELS[i.model].id,
      instructions: SYSTEM,
      input,
      stream: true,
      store: false,
      reasoning: { effort: i.effort.toLowerCase() },
    }),
  });
  if (!res.ok || !res.body) {
    console.error("assistant gateway error", res.status, await res.text().catch(() => ""));
    throw new Error(res.status === 429 ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE");
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", refused = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const raw = line.slice(5).trim();
      if (raw === "[DONE]") continue;
      let ev: { type?: string; delta?: string; response?: { error?: unknown } };
      try { ev = JSON.parse(raw); } catch { continue; }
      if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") text += ev.delta;
      else if (ev.type === "response.refusal.delta") refused = true;
      else if (ev.type === "response.failed" || ev.type === "error") { console.error("assistant stream error", raw); throw new Error("AI_UNAVAILABLE"); }
    }
  }
  if (refused || !text.trim()) throw new Error(refused ? "AI_REFUSED" : "AI_UNAVAILABLE");
  return text;
}

/** One assistant reply. Runs through meteredAi: plan check + 1 credit, charged only on success. */
export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signal = getRequest().signal;
    const reply = await meteredAi(context.supabase as never, supabaseAdmin as never, context.userId, data.clinicId, "assistant", data.requestId, () => generate(data, signal));
    return { reply };
  });
