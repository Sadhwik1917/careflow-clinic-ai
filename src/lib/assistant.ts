/** Client-safe rules for the clinic AI assistant. The server re-checks every one of them. */
export const ASSISTANT_MODELS = {
  Fast: { id: "gemini-3.8-flash", description: "Quick answers for everyday questions" },
  Smart: { id: "gemini-3.7-flash", description: "Careful answers with deep reasoning" },
} as const;
export type AssistantModel = keyof typeof ASSISTANT_MODELS;
export const ASSISTANT_EFFORTS = ["Low", "Medium", "High"] as const;
export type AssistantEffort = (typeof ASSISTANT_EFFORTS)[number];

export const ASSISTANT_COMMANDS = [
  { id: "summarize", label: "Summarize", description: "Shorten text or attached files", instruction: "Summarize the following clearly and briefly." },
  { id: "explain", label: "Explain simply", description: "In plain words a patient understands", instruction: "Explain the following in plain, simple language a patient can understand." },
  { id: "draft", label: "Draft message", description: "A polite note to a patient", instruction: "Draft a short, polite message from the clinic to a patient about the following." },
  { id: "translate", label: "Translate", description: "Into another language", instruction: "Translate the following. If no target language is named, translate into Hindi." },
] as const;
export type AssistantCommandId = (typeof ASSISTANT_COMMANDS)[number]["id"];

export const MAX_FILES = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_BYTES = 200 * 1024;
export const MAX_MESSAGE_CHARS = 8000;
export const MAX_HISTORY = 20;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const TEXT_EXTENSIONS = [".txt", ".md", ".csv", ".json"];
export const ATTACH_ACCEPT = [...IMAGE_TYPES, ...TEXT_EXTENSIONS].join(",");

export type FileCheck = { ok: true; kind: "image" | "text" } | { ok: false; reason: string };
export function checkFile(f: { name: string; type: string; size: number }): FileCheck {
  if (IMAGE_TYPES.includes(f.type)) return f.size <= MAX_IMAGE_BYTES ? { ok: true, kind: "image" } : { ok: false, reason: `${f.name} is larger than 5 MB` };
  if (TEXT_EXTENSIONS.some((e) => f.name.toLowerCase().endsWith(e))) return f.size <= MAX_TEXT_BYTES ? { ok: true, kind: "text" } : { ok: false, reason: `${f.name} is larger than 200 KB` };
  return { ok: false, reason: `${f.name} isn't supported. Use images (PNG, JPG, WEBP, GIF) or text files (TXT, MD, CSV, JSON)` };
}

export type AssistantFile = { name: string; kind: "image" | "text"; mime: string; data: string };
export type AssistantTurn = { role: "user" | "assistant"; text: string };

const ERRORS: Record<string, string> = {
  AI_NOT_INCLUDED: "AI isn't included in this clinic's plan.",
  AI_LIMIT_REACHED: "This clinic has used all its AI credits for this billing period.",
  DUPLICATE_REQUEST: "This message was already sent.",
  AI_RATE_LIMITED: "The assistant is busy right now. Please try again in a minute.",
  AI_UNAVAILABLE: "The assistant isn't available right now. Please try again later.",
  AI_REFUSED: "The assistant couldn't help with that request.",
  NOT_AUTHORISED: "The assistant couldn't access permitted knowledge documents. No reply was generated.",
  INVALID_INPUT: "That message couldn't be sent. Check the text and attachments.",
};
export const assistantErrorMessage = (e: unknown) => ERRORS[e instanceof Error ? e.message : ""] ?? "The assistant couldn't reply. Please try again.";
