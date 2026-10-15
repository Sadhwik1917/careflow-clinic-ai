import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { AlignLeft, Languages, Lightbulb, MessageSquareText, Stethoscope } from "lucide-react";
import AI_Prompt, { type PromptModel } from "@/components/kokonutui/ai-prompt";
import AILoadingState, { type AgentStep } from "@/components/kokonutui/ai-loading";
import AITextLoading from "@/components/kokonutui/ai-text-loading";
import { askAssistant } from "@/lib/assistant.functions";
import { getClinicAiAccess } from "@/lib/ai.functions";
import { ASSISTANT_COMMANDS, ASSISTANT_EFFORTS, ASSISTANT_MODELS, ATTACH_ACCEPT, MAX_FILES, MAX_HISTORY, assistantErrorMessage, checkFile, type AssistantEffort, type AssistantFile, type AssistantModel, type AssistantTurn, type AssistantCommandId } from "@/lib/assistant";
import { cn } from "@/lib/utils";

const icons = { summarize: <AlignLeft className="size-4" />, explain: <Lightbulb className="size-4" />, draft: <MessageSquareText className="size-4" />, translate: <Languages className="size-4" /> };
const commands = ASSISTANT_COMMANDS.map((c) => ({ id: c.id, label: c.label, description: c.description, icon: icons[c.id] }));
const models: PromptModel[] = (Object.keys(ASSISTANT_MODELS) as AssistantModel[]).map((name) => ({ name, description: ASSISTANT_MODELS[name].description, efforts: [...ASSISTANT_EFFORTS], defaultEffort: name === "Fast" ? "Low" : "Medium" }));

type Turn = { id: string; role: "user" | "assistant"; text: string; files?: string[]; status?: "pending" | "done" | "error" | "stopped" };

async function readFile(f: File): Promise<AssistantFile> {
  const c = checkFile(f);
  if (!c.ok) throw new Error("INVALID_INPUT");
  if (c.kind === "text") return { name: f.name, kind: "text", mime: "text/plain", data: await f.text() };
  const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
  return { name: f.name, kind: "image", mime: f.type, data: url.slice(url.indexOf(",") + 1) };
}

export function AiAssistant({ clinicId }: { clinicId: string }) {
  const ask = useServerFn(askAssistant);
  const checkAccess = useServerFn(getClinicAiAccess);
  const qc = useQueryClient();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [steps, setSteps] = useState<AgentStep[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [turns, steps]);

  const setStep = (id: string, patch: Partial<AgentStep>) => setSteps((s) => s?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? null);
  const setAssistant = (id: string, patch: Partial<Turn>) => setTurns((t) => t.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const onSubmit = async (value: string, model: string, o: { effort: string | null; files: File[]; signal: AbortSignal; command: { id: string } | null }) => {
    setNotice(null);
    const history: AssistantTurn[] = turns.filter((t) => t.status !== "error" && t.status !== "stopped" && t.status !== "pending").slice(-MAX_HISTORY).map((t) => ({ role: t.role, text: t.text }));
    const userId = crypto.randomUUID(), botId = crypto.randomUUID();
    const label = o.command ? `/${ASSISTANT_COMMANDS.find((c) => c.id === o.command?.id)?.label} ${value}` : value;
    setTurns((t) => [...t, { id: userId, role: "user", text: label, files: o.files.map((f) => f.name) }, { id: botId, role: "assistant", text: "", status: "pending" }]);
    const effort = (o.effort ?? "Medium") as AssistantEffort;
    setSteps([
      { id: "plan", label: "Checking your plan", status: "running" },
      ...(o.files.length ? [{ id: "files", label: `Reading ${o.files.length} attachment${o.files.length > 1 ? "s" : ""}`, status: "pending" as const, detail: [] }] : []),
      { id: "reply", label: "Writing the reply", status: "pending", detail: [] },
    ]);
    let current = "plan";
    try {
      const access = await checkAccess({ data: { clinicId } });
      if (!access.allowed) throw new Error("AI_NOT_INCLUDED");
      setStep("plan", { status: "done" });
      if (o.signal.aborted) throw new DOMException("Aborted", "AbortError");
      let files: AssistantFile[] = [];
      if (o.files.length) {
        current = "files"; setStep("files", { status: "running" });
        for (const f of o.files) { files.push(await readFile(f)); setStep("files", { detail: files.map((x) => x.name) }); }
        setStep("files", { status: "done" });
      }
      current = "reply"; setStep("reply", { status: "running", detail: [`${model} · ${effort} effort`] });
      const { reply } = await ask({ data: { clinicId, requestId: crypto.randomUUID(), model: model as AssistantModel, effort, command: (o.command?.id ?? null) as AssistantCommandId | null, message: value, history, files }, signal: o.signal });
      setStep("reply", { status: "done" });
      setAssistant(botId, { text: reply, status: "done" });
    } catch (e) {
      if (o.signal.aborted) { setStep(current, { status: "error", detail: ["Stopped"] }); setAssistant(botId, { text: "Stopped.", status: "stopped" }); }
      else { setStep(current, { status: "error" }); setAssistant(botId, { text: assistantErrorMessage(e), status: "error" }); }
    } finally {
      qc.invalidateQueries({ queryKey: ["plan-state", clinicId, "ai-usage"] });
    }
  };

  const accept = (f: File) => { const c = checkFile(f); if (!c.ok) setNotice(c.reason); return c.ok; };

  return (
    <section aria-label="AI assistant" className="mx-auto flex w-full max-w-2xl flex-col">
      <div className="space-y-5 py-4" aria-live="polite">
        {turns.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-primary"><Stethoscope className="size-5" aria-hidden="true" /></span>
            <h2 className="text-base font-semibold">Ask CareFlow</h2>
            <p className="max-w-md text-sm text-muted-foreground">Draft patient messages, summarise notes or explain terms. Each reply uses 1 AI credit. The assistant can't see clinic records unless you paste or attach them, and it doesn't replace a doctor's judgement.</p>
          </div>
        )}
        {turns.map((t) => t.role === "user" ? (
          <div key={t.id} className="ml-auto max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
            <p className="whitespace-pre-wrap break-words">{t.text}</p>
            {!!t.files?.length && <p className="mt-1 text-xs opacity-80">{t.files.join(", ")}</p>}
          </div>
        ) : (
          <div key={t.id} className="max-w-full text-sm">
            {t.status === "pending" ? <AITextLoading className="justify-start text-sm font-medium text-muted-foreground" label="Assistant is replying" texts={["Thinking...", "Writing..."]} interval={2000} />
              : t.status === "done" ? <div className="prose prose-sm max-w-none break-words text-foreground dark:prose-invert [&_a]:text-primary"><ReactMarkdown>{t.text}</ReactMarkdown></div>
              : <p className={cn(t.status === "error" ? "text-destructive" : "text-muted-foreground")}>{t.text}</p>}
          </div>
        ))}
        {steps && <AILoadingState steps={steps} />}
        <div ref={endRef} />
      </div>
      <div className="sticky bottom-0 bg-background/95 pb-2 backdrop-blur-sm">
        {notice && <p role="alert" className="px-1 pt-2 text-xs text-destructive">{notice}</p>}
        <AI_Prompt className="max-w-none" models={models} defaultModel="Fast" headerText="" commands={commands}
          placeholder={`Ask anything. Type / for commands. Attach up to ${MAX_FILES} images or text files`}
          accept={ATTACH_ACCEPT} acceptFile={accept} onSubmit={onSubmit} />
      </div>
    </section>
  );
}
