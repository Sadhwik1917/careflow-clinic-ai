import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { meteredAi } from "@/lib/ai.functions";
import {
  MAX_CONSULTATIONS, MAX_PATIENT_SEARCH, MAX_PRESCRIPTIONS, MAX_VITALS,
  SUMMARY_FORMAT, SUMMARY_SYSTEM, buildSummaryInput, canRequestSummary, hasAnyHistory, parseSummary,
  type SummaryFacts, type SummaryPatient,
} from "@/lib/patient-summary";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Db = {
  from: (t: string) => unknown;
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** Verifies the caller is an active OWNER/DOCTOR/STAFF member of the clinic. Platform admins are refused. */
async function assertSummaryAccess(db: Db, userId: string, clinicId: string) {
  const { data: profile, error } = await (db.from("profiles") as any).select("platform_role, status").eq("id", userId).maybeSingle();
  if (error || !profile || profile.status !== "ACTIVE" || profile.platform_role === "PLATFORM_ADMIN") throw new Error("NOT_AUTHORISED");
  const { data: membership, error: mErr } = await (db.from("clinic_members") as any)
    .select("role, status").eq("clinic_id", clinicId).eq("user_id", userId).maybeSingle();
  if (mErr || !membership || membership.status !== "ACTIVE" || !canRequestSummary(membership.role)) throw new Error("NOT_AUTHORISED");
}

/** Patient search for the picker. RLS limits rows to clinics the caller may read; the clinic filter is still applied. */
export const listSummaryPatients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { clinicId: string; search: string }) => {
    if (!i || !uuid.test(i.clinicId) || typeof i.search !== "string" || i.search.length > MAX_PATIENT_SEARCH) throw new Error("INVALID_INPUT");
    return i;
  })
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    await assertSummaryAccess(db, context.userId, data.clinicId);
    let q = (context.supabase.from("patients") as any)
      .select("id, patient_number, first_name, last_name")
      .eq("clinic_id", data.clinicId).eq("status", "ACTIVE")
      .order("first_name").limit(20);
    const s = data.search.trim();
    if (s) q = q.or(`first_name.ilike.%${s.replace(/[%,.]/g, "")}%,last_name.ilike.%${s.replace(/[%,.]/g, "")}%,patient_number.ilike.%${s.replace(/[%,.]/g, "")}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error("NOT_AUTHORISED");
    const patients: SummaryPatient[] = (rows ?? []).map((p: any) => ({
      id: p.id as string,
      patientNumber: p.patient_number as string,
      label: [p.first_name, p.last_name].filter(Boolean).join(" "),
    }));
    return { patients };
  });

/**
 * Gathers one patient's records through exact, permission-checked queries on the caller's RLS client.
 * Every query is scoped to the authorised clinic and the selected patient; an unreadable patient fails closed.
 * Clinical notes come from these exact consultation rows — the vector RAG stores have no patient-level scope,
 * so they are deliberately not used for clinical data.
 */
async function gatherFacts(db: Db, clinicId: string, patientId: string): Promise<SummaryFacts> {
  const { data: patient, error } = await (db.from("patients") as any)
    .select("patient_number, first_name, last_name, date_of_birth, gender, notes")
    .eq("clinic_id", clinicId).eq("id", patientId).maybeSingle();
  if (error || !patient) throw new Error("NOT_AUTHORISED");

  const [cons, vits, rxs] = await Promise.all([
    (db.from("consultations") as any)
      .select("created_at, status, chief_complaint, clinical_notes, assessment, follow_up_date")
      .eq("clinic_id", clinicId).eq("patient_id", patientId)
      .order("created_at", { ascending: false }).limit(MAX_CONSULTATIONS),
    (db.from("vitals") as any)
      .select("recorded_at, temperature, blood_pressure_systolic, blood_pressure_diastolic, heart_rate, respiratory_rate, oxygen_saturation, weight, height")
      .eq("clinic_id", clinicId).eq("patient_id", patientId)
      .order("recorded_at", { ascending: false }).limit(MAX_VITALS),
    (db.from("prescriptions") as any)
      .select("id, prescription_date, status, instructions")
      .eq("clinic_id", clinicId).eq("patient_id", patientId)
      .order("prescription_date", { ascending: false }).limit(MAX_PRESCRIPTIONS),
  ]);
  if (cons.error || vits.error || rxs.error) throw new Error("NOT_AUTHORISED");

  const rxRows = (rxs.data ?? []) as any[];
  let items: any[] = [];
  if (rxRows.length) {
    const { data: itemRows, error: iErr } = await (db.from("prescription_items") as any)
      .select("prescription_id, medicine_name, dosage, frequency, duration, instructions")
      .in("prescription_id", rxRows.map((r) => r.id));
    if (iErr) throw new Error("NOT_AUTHORISED");
    items = itemRows ?? [];
  }

  return {
    patient: {
      patientNumber: patient.patient_number, firstName: patient.first_name, lastName: patient.last_name,
      dateOfBirth: patient.date_of_birth, gender: patient.gender, notes: patient.notes,
    },
    consultations: ((cons.data ?? []) as any[]).map((c) => ({
      date: c.created_at, status: c.status, chiefComplaint: c.chief_complaint,
      clinicalNotes: c.clinical_notes, assessment: c.assessment, followUpDate: c.follow_up_date,
    })),
    vitals: ((vits.data ?? []) as any[]).map((v) => ({
      recordedAt: v.recorded_at, temperatureC: v.temperature,
      bloodPressure: v.blood_pressure_systolic != null && v.blood_pressure_diastolic != null
        ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic} mmHg` : null,
      heartRateBpm: v.heart_rate, respiratoryRatePerMin: v.respiratory_rate,
      oxygenSaturationPct: v.oxygen_saturation, weightKg: v.weight, heightCm: v.height,
    })),
    prescriptions: rxRows.map((r) => ({
      date: r.prescription_date, status: r.status, instructions: r.instructions,
      items: items.filter((i) => i.prescription_id === r.id).map((i) => ({
        medicine: i.medicine_name, dosage: i.dosage, frequency: i.frequency, duration: i.duration, instructions: i.instructions,
      })),
    })),
  };
}

/** Non-streaming gateway call with a strict JSON answer. */
async function generateSummary(input: string, signal: AbortSignal): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI_UNAVAILABLE");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      instructions: SUMMARY_SYSTEM,
      input: [{ role: "user", content: [{ type: "input_text", text: input }] }],
      store: false,
      reasoning: { effort: "medium" },
      text: { format: SUMMARY_FORMAT },
    }),
  });
  if (!res.ok) {
    console.error("patient summary gateway error", res.status);
    throw new Error(res.status === 429 ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE");
  }
  const json = (await res.json()) as { output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[]; error?: unknown };
  if (json.error) throw new Error("AI_UNAVAILABLE");
  for (const item of json.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c.type === "refusal" || c.refusal) throw new Error("AI_REFUSED");
      if (c.type === "output_text" && typeof c.text === "string") return parseSummary(c.text);
    }
  }
  throw new Error("AI_UNAVAILABLE");
}

export type SummaryResult =
  | { kind: "empty" }
  | { kind: "ok"; summary: string; generatedAt: string; counts: { consultations: number; vitals: number; prescriptions: number } };

/** One patient history summary. Runs through meteredAi: plan check + 1 credit, charged only on success. */
export const summarizePatientHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { clinicId: string; patientId: string; requestId: string }) => {
    if (!i || !uuid.test(i.clinicId) || !uuid.test(i.patientId) || !uuid.test(i.requestId)) throw new Error("INVALID_INPUT");
    return i;
  })
  .handler(async ({ data, context }): Promise<SummaryResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = context.supabase as unknown as Db;
    const signal = getRequest().signal;
    await assertSummaryAccess(db, context.userId, data.clinicId);
    // Facts are gathered before reserving a credit: a patient with no history never consumes one.
    const facts = await gatherFacts(db, data.clinicId, data.patientId);
    if (!hasAnyHistory(facts)) return { kind: "empty" };
    return await meteredAi(context.supabase as never, supabaseAdmin as never, context.userId, data.clinicId, "patient-summary", data.requestId, async () => {
      const summary = await generateSummary(buildSummaryInput(facts), signal);
      signal.throwIfAborted();
      return {
        kind: "ok" as const,
        summary,
        generatedAt: new Date().toISOString(),
        counts: { consultations: facts.consultations.length, vitals: facts.vitals.length, prescriptions: facts.prescriptions.length },
      };
    });
  });
