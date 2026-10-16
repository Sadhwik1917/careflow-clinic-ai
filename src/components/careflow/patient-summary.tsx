import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { FileClock, Search, Square } from "lucide-react";
import { listSummaryPatients, summarizePatientHistory, type SummaryResult } from "@/lib/patient-summary.functions";
import { SUMMARY_NOTICE, summaryErrorMessage, type SummaryPatient } from "@/lib/patient-summary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AITextLoading from "@/components/kokonutui/ai-text-loading";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; result: Extract<SummaryResult, { kind: "ok" }>; patient: SummaryPatient }
  | { kind: "empty"; patient: SummaryPatient }
  | { kind: "error"; message: string; patient: SummaryPatient };

export function PatientSummary({ clinicId }: { clinicId: string }) {
  const listPatients = useServerFn(listSummaryPatients);
  const summarize = useServerFn(summarizePatientHistory);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SummaryPatient | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const list = useQuery({
    queryKey: ["summary-patients", clinicId, search],
    queryFn: () => listPatients({ data: { clinicId, search } }),
    enabled: !selected,
  });

  const generate = async (patient: SummaryPatient) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: "loading" });
    try {
      const result = await summarize({ data: { clinicId, patientId: patient.id, requestId: crypto.randomUUID() }, signal: controller.signal });
      if (controller.signal.aborted) { setState({ kind: "idle" }); return; }
      setState(result.kind === "empty" ? { kind: "empty", patient } : { kind: "ok", result, patient });
    } catch (e) {
      if (controller.signal.aborted) setState({ kind: "idle" });
      else setState({ kind: "error", message: summaryErrorMessage(e), patient });
    } finally {
      qc.invalidateQueries({ queryKey: ["plan-state", clinicId, "ai-usage"] });
    }
  };

  const stop = () => { abortRef.current?.abort(); setState({ kind: "idle" }); };

  return (
    <section aria-label="Patient history summary" className="rounded-xl border bg-card p-4 md:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><FileClock className="size-4" aria-hidden="true" /></span>
        <div>
          <h2 className="text-sm font-semibold">Patient history summary</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Summarises one patient's recorded history. Uses 1 AI credit per summary.</p>
        </div>
      </div>

      {selected ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="text-sm"><span className="font-medium">{selected.label}</span> <span className="text-muted-foreground">· {selected.patientNumber}</span></p>
          <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setState({ kind: "idle" }); }}>Change patient</Button>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or patient number" className="pl-8" aria-label="Search patients" />
          </div>
          <ul className="max-h-56 overflow-y-auto rounded-md border">
            {list.isPending && <li className="px-3 py-2 text-sm text-muted-foreground">Searching…</li>}
            {list.isError && <li className="px-3 py-2 text-sm text-destructive">Couldn't load patients. Try again.</li>}
            {list.data?.patients.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No patients found.</li>}
            {list.data?.patients.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setSelected(p)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="font-medium">{p.label}</span>
                  <span className="text-xs text-muted-foreground">{p.patientNumber}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected && state.kind !== "ok" && state.kind !== "empty" && (
        <div className="mt-3 flex items-center gap-2">
          {state.kind === "loading" ? (
            <>
              <AITextLoading className="text-sm text-muted-foreground" label="Generating summary" texts={["Reading records...", "Writing summary..."]} interval={2000} />
              <Button variant="outline" size="sm" onClick={stop}><Square className="size-3.5" aria-hidden="true" /> Stop</Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={() => generate(selected)}>{state.kind === "error" ? "Try again" : "Generate summary"}</Button>
              {state.kind === "error" && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
            </>
          )}
        </div>
      )}

      {state.kind === "empty" && (
        <div className="mt-4 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No history recorded yet</p>
          <p className="mt-1">{state.patient.label} has no consultations, vitals, prescriptions or notes on record, so there is nothing to summarise. No credit was used.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setState({ kind: "idle" })}>Done</Button>
        </div>
      )}

      {state.kind === "ok" && (
        <div className="mt-4 space-y-3">
          <div className="max-w-none break-words text-sm leading-relaxed text-foreground [&_h1]:mt-3 [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown>{state.result.summary}</ReactMarkdown>
          </div>
          <div className="border-t pt-3 text-xs text-muted-foreground">
            <p role="note" className="font-medium text-foreground">{SUMMARY_NOTICE}</p>
            <p className="mt-1">
              Generated {new Date(state.result.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
              {state.result.counts.consultations} consultation{state.result.counts.consultations === 1 ? "" : "s"},{" "}
              {state.result.counts.vitals} vitals record{state.result.counts.vitals === 1 ? "" : "s"},{" "}
              {state.result.counts.prescriptions} prescription{state.result.counts.prescriptions === 1 ? "" : "s"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setState({ kind: "idle" })}>Done</Button>
        </div>
      )}
    </section>
  );
}
