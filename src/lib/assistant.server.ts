/**
 * Server-only RAG Services for Platform Super Admins & Doctors (Phase-2 Sub-Stages 1.3 & 1.4).
 *
 * 1. adminRagSearch:
 *    Dedicated unmetered endpoint for Platform Super Admins querying confidential
 *    governance, compliance, subscription specs, and verification documentation (CONFIDENTIAL domain).
 *
 * 2. doctorPatientRagSearch:
 *    Metered clinical RAG endpoint combining dynamic patient records (consultations, vitals,
 *    prescriptions) with static knowledge base search (CLINIC and SHAREABLE domains),
 *    metered against clinic AI credits.
 */

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { meteredAi } from "@/lib/ai.functions";
import { searchKnowledgeBase, type Rpc } from "@/lib/rag.server";
import { type RagPassage } from "@/lib/rag";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// 1. Super Admin RAG Service Types & Validation
// ---------------------------------------------------------------------------

export interface AdminRagSearchInput {
  queryText: string;
  matchCount?: number | undefined;
  similarityThreshold?: number | undefined;
}

export interface AdminRagSearchOutput {
  answer: string;
  sources: RagPassage[];
  domain: "CONFIDENTIAL";
}

export function validateAdminRagInput(i: unknown): AdminRagSearchInput {
  const o = (i ?? {}) as Record<string, unknown>;
  const queryText = typeof o["queryText"] === "string" ? o["queryText"].trim() : "";
  if (!queryText || queryText.length > 8000) {
    throw new Error("INVALID_INPUT");
  }
  const matchCount =
    typeof o["matchCount"] === "number" && Number.isFinite(o["matchCount"])
      ? Math.min(Math.max(1, Math.floor(o["matchCount"])), 10)
      : 5;
  const similarityThreshold =
    typeof o["similarityThreshold"] === "number" && Number.isFinite(o["similarityThreshold"])
      ? Math.max(0.0, Math.min(1.0, o["similarityThreshold"]))
      : 0.0;

  return { queryText, matchCount, similarityThreshold };
}

// ---------------------------------------------------------------------------
// 2. Doctor Patient RAG Service Types & Validation
// ---------------------------------------------------------------------------

export interface DoctorPatientRagInput {
  clinicId: string;
  patientId: string;
  queryText: string;
  matchCount?: number | undefined;
  similarityThreshold?: number | undefined;
  requestId?: string | undefined;
}

export interface PatientContextSummary {
  patientName: string;
  patientNumber: string;
  consultationsCount: number;
  vitalsCount: number;
  prescriptionsCount: number;
}

export interface DoctorPatientRagOutput {
  answer: string;
  sources: RagPassage[];
  patientContextSummary: PatientContextSummary;
}

export function validateDoctorPatientRagInput(i: unknown): DoctorPatientRagInput {
  const o = (i ?? {}) as Record<string, unknown>;
  const clinicId = typeof o["clinicId"] === "string" ? o["clinicId"].trim() : "";
  const patientId = typeof o["patientId"] === "string" ? o["patientId"].trim() : "";
  const queryText = typeof o["queryText"] === "string" ? o["queryText"].trim() : "";

  if (!clinicId || !uuidRegex.test(clinicId)) {
    throw new Error("INVALID_INPUT");
  }
  if (!patientId || !uuidRegex.test(patientId)) {
    throw new Error("INVALID_INPUT");
  }
  if (!queryText || queryText.length > 8000) {
    throw new Error("INVALID_INPUT");
  }

  const matchCount =
    typeof o["matchCount"] === "number" && Number.isFinite(o["matchCount"])
      ? Math.min(Math.max(1, Math.floor(o["matchCount"])), 10)
      : 5;
  const similarityThreshold =
    typeof o["similarityThreshold"] === "number" && Number.isFinite(o["similarityThreshold"])
      ? Math.max(0.0, Math.min(1.0, o["similarityThreshold"]))
      : 0.0;

  const requestId =
    typeof o["requestId"] === "string" && uuidRegex.test(o["requestId"].trim())
      ? o["requestId"].trim()
      : undefined;

  return {
    clinicId,
    patientId,
    queryText,
    matchCount,
    similarityThreshold,
    ...(requestId ? { requestId } : {}),
  };
}

// ---------------------------------------------------------------------------
// 3. Response Synthesis Functions
// ---------------------------------------------------------------------------

/** Synthesizes retrieved confidential passages into an authoritative markdown answer using Gemini. */
export async function synthesizeAdminAnswer(
  query: string,
  passages: RagPassage[],
  signal?: AbortSignal | undefined,
): Promise<string> {
  if (passages.length === 0) {
    return "No relevant confidential governance documentation was found for this query.";
  }

  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    throw new Error("AI_UNAVAILABLE");
  }

  const contextText = passages
    .map(
      (p, i) =>
        `[Source ${i + 1}] Title: ${p.title} (Key: ${p.sourceKey})\n${p.content}`,
    )
    .join("\n\n---\n\n");

  const promptText = `Confidential Reference Documents:\n\n${contextText}\n\nSuper Admin Question:\n${query}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(signal ? { signal } : {}),
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        systemInstruction: {
          parts: [
            {
              text:
                "You are CareFlow AI's governance and platform compliance assistant for Platform Super Admins. " +
                "You have access to confidential platform policies, compliance guidelines, subscription configurations, and verification workflows. " +
                "Base your answer strictly on the provided confidential source references. If the references do not contain sufficient information to answer the question, clearly state that the available confidential documentation does not cover it. " +
                "Provide clear, authoritative markdown-formatted responses with proper headings and bullet points where helpful. " +
                "Do not invent facts or citations.",
            },
          ],
        },
      }),
    },
  );

  if (!res.ok) {
    console.error("Gemini admin RAG synthesis error", res.status);
    throw new Error(res.status === 429 ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE");
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || !text.trim()) {
    throw new Error("AI_UNAVAILABLE");
  }

  return text.trim();
}

/** Synthesizes patient longitudinal history with clinical knowledge guidelines using Gemini. */
export async function synthesizeDoctorPatientAnswer(
  query: string,
  patientContext: string,
  passages: RagPassage[],
  signal?: AbortSignal | undefined,
): Promise<string> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    throw new Error("AI_UNAVAILABLE");
  }

  const guidelinesContext =
    passages.length > 0
      ? passages
          .map((p, i) => `[Guideline ${i + 1}] Title: ${p.title} (${p.sourceKey})\n${p.content}`)
          .join("\n\n---\n\n")
      : "No static guidelines matched this query.";

  const promptText = `Patient Clinical History & Vitals:\n\n${patientContext}\n\nClinical Guidelines & Protocols:\n\n${guidelinesContext}\n\nDoctor Question:\n${query}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(signal ? { signal } : {}),
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        systemInstruction: {
          parts: [
            {
              text:
                "You are CareFlow AI's clinical assistant for verified clinic doctors. " +
                "You assist attending physicians by synthesizing dynamic patient longitudinal health data " +
                "(consultations, vitals, active prescriptions) with official clinic and medical reference guidelines. " +
                "Highlight vital trends, potential drug interactions, and pertinent past diagnoses. " +
                "Provide structured clinical summaries with clear markdown headings and bullet points. " +
                "Do not invent medical facts or clinical history not present in the record.",
            },
          ],
        },
      }),
    },
  );

  if (!res.ok) {
    console.error("Gemini doctor RAG synthesis error", res.status);
    throw new Error(res.status === 429 ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE");
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || !text.trim()) {
    throw new Error("AI_UNAVAILABLE");
  }

  return text.trim();
}

// ---------------------------------------------------------------------------
// 4. Execution Functions
// ---------------------------------------------------------------------------

/**
 * Core execution logic for Super Admin RAG search.
 * Bypasses clinic AI credits, verifies PLATFORM_ADMIN role, searches CONFIDENTIAL domain,
 * and synthesizes retrieved passages.
 */
export async function executeAdminRagSearch(
  db: Rpc & { from: (table: string) => any },
  userId: string,
  input: AdminRagSearchInput,
  options?: {
    search?: typeof searchKnowledgeBase;
    synthesize?: (query: string, passages: RagPassage[]) => Promise<string>;
    signal?: AbortSignal | undefined;
  },
): Promise<AdminRagSearchOutput> {
  const { data: profile, error } = await db
    .from("profiles")
    .select("platform_role, status")
    .eq("id", userId)
    .maybeSingle();

  if (
    error ||
    !profile ||
    profile.status !== "ACTIVE" ||
    profile.platform_role !== "PLATFORM_ADMIN"
  ) {
    throw new Error("NOT_AUTHORISED");
  }

  const searchFn = options?.search ?? searchKnowledgeBase;
  const synthFn = options?.synthesize ?? synthesizeAdminAnswer;

  const passages = await searchFn(db, {
    domain: "CONFIDENTIAL",
    queryText: input.queryText,
    matchCount: input.matchCount ?? 5,
    similarityThreshold: input.similarityThreshold ?? 0.0,
  });

  if (passages.length === 0) {
    return {
      answer: "No relevant confidential governance documentation was found for this query.",
      sources: [],
      domain: "CONFIDENTIAL",
    };
  }

  const answer = await synthFn(input.queryText, passages);

  return {
    answer,
    sources: passages,
    domain: "CONFIDENTIAL",
  };
}

/**
 * Core execution logic for Doctor Patient RAG search.
 * Verifies DOCTOR/OWNER role, operational clinic, and tenant patient boundary.
 * Enforces server-side AI credit metering, loads longitudinal health records,
 * queries CLINIC and SHAREABLE static vectors, and synthesizes clinical response.
 */
export async function executeDoctorPatientRagSearch(
  userDb: Rpc & { from: (table: string) => any },
  adminDb: Rpc,
  userId: string,
  input: DoctorPatientRagInput,
  options?: {
    search?: typeof searchKnowledgeBase;
    synthesize?: (query: string, patientContext: string, passages: RagPassage[]) => Promise<string>;
    signal?: AbortSignal | undefined;
  },
): Promise<DoctorPatientRagOutput> {
  const {
    clinicId,
    patientId,
    queryText,
    matchCount = 5,
    similarityThreshold = 0.0,
    requestId = crypto.randomUUID(),
  } = input;

  // 1. Verify caller has active DOCTOR or OWNER role in clinic and clinic is operational
  const [memberRes, clinicOpRes] = await Promise.all([
    userDb
      .from("clinic_members")
      .select("role, status")
      .eq("user_id", userId)
      .eq("clinic_id", clinicId)
      .maybeSingle(),
    userDb.rpc("clinic_is_operational", { p_clinic: clinicId }),
  ]);

  if (
    memberRes.error ||
    !memberRes.data ||
    memberRes.data.status !== "ACTIVE" ||
    !["DOCTOR", "OWNER"].includes(memberRes.data.role) ||
    clinicOpRes.error ||
    clinicOpRes.data !== true
  ) {
    throw new Error("NOT_AUTHORISED");
  }

  // 2. Verify patient strictly belongs to this clinic (prevent cross-tenant data access)
  const { data: patient, error: patientError } = await userDb
    .from("patients")
    .select("id, clinic_id, first_name, last_name, patient_number, date_of_birth, gender, phone, notes")
    .eq("id", patientId)
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (patientError || !patient) {
    throw new Error("NOT_AUTHORISED");
  }

  // 3. Metered AI credit reservation & execution wrapper
  return await meteredAi(
    userDb,
    adminDb,
    userId,
    clinicId,
    "doctor_patient_rag",
    requestId,
    async () => {
      // 4. Fetch dynamic clinical records for patient
      const [consultsRes, vitalsRes, prescriptsRes] = await Promise.all([
        userDb
          .from("consultations")
          .select("id, chief_complaint, diagnosis, assessment, clinical_notes, follow_up_date, created_at, status")
          .eq("patient_id", patientId)
          .eq("clinic_id", clinicId)
          .order("created_at", { ascending: false })
          .limit(10),
        userDb
          .from("vitals")
          .select(
            "id, blood_pressure_systolic, blood_pressure_diastolic, heart_rate, temperature, respiratory_rate, oxygen_saturation, weight_kg, height_cm, recorded_at",
          )
          .eq("patient_id", patientId)
          .eq("clinic_id", clinicId)
          .order("recorded_at", { ascending: false })
          .limit(10),
        userDb
          .from("prescriptions")
          .select(
            "id, status, created_at, items:prescription_items(id, medication_name, dosage, frequency, duration_days, instructions)",
          )
          .eq("patient_id", patientId)
          .eq("clinic_id", clinicId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const consultations = consultsRes.data ?? [];
      const vitals = vitalsRes.data ?? [];
      const prescriptions = prescriptsRes.data ?? [];

      // 5. Query static vector knowledge (CLINIC domain + SHAREABLE domain)
      const searchFn = options?.search ?? searchKnowledgeBase;
      const [clinicPassages, sharedPassages] = await Promise.all([
        searchFn(userDb, {
          domain: "CLINIC",
          queryText,
          clinicId,
          matchCount,
          similarityThreshold,
        }),
        searchFn(userDb, {
          domain: "SHAREABLE",
          queryText,
          matchCount,
          similarityThreshold,
        }),
      ]);

      const allPassages = [...clinicPassages, ...sharedPassages]
        .filter((p) => p.similarity >= similarityThreshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, matchCount);

      // 6. Format Patient Clinical Context
      const patientContextLines: string[] = [
        `Patient: ${patient.first_name} ${patient.last_name} (${patient.patient_number})`,
        `Gender: ${patient.gender || "Unknown"}, DOB: ${patient.date_of_birth || "Unknown"}`,
        patient.notes ? `General Notes: ${patient.notes}` : "",
        "\nRecent Consultations:",
        consultations.length > 0
          ? consultations
              .map(
                (c: any, idx: number) =>
                  `[Consultation ${idx + 1}] Date: ${c.created_at}, Complaint: ${c.chief_complaint || "N/A"}, Diagnosis: ${c.diagnosis || "N/A"}, Notes: ${c.clinical_notes || c.assessment || "N/A"}`,
              )
              .join("\n")
          : "No prior consultations recorded.",
        "\nRecent Vitals:",
        vitals.length > 0
          ? vitals
              .map(
                (v: any, idx: number) =>
                  `[Vitals ${idx + 1}] Date: ${v.recorded_at}, BP: ${v.blood_pressure_systolic}/${v.blood_pressure_diastolic} mmHg, HR: ${v.heart_rate} bpm, Temp: ${v.temperature} F, SpO2: ${v.oxygen_saturation}%, Weight: ${v.weight_kg} kg`,
              )
              .join("\n")
          : "No vitals recorded.",
        "\nRecent Prescriptions:",
        prescriptions.length > 0
          ? prescriptions
              .map((p: any, idx: number) => {
                const itemsStr = (p.items ?? [])
                  .map(
                    (it: any) =>
                      `${it.medication_name} ${it.dosage} (${it.frequency}, ${it.duration_days} days)`,
                  )
                  .join("; ");
                return `[Prescription ${idx + 1}] Date: ${p.created_at}, Status: ${p.status}, Items: ${itemsStr || "None"}`;
              })
              .join("\n")
          : "No prescriptions recorded.",
      ];

      const patientContext = patientContextLines.filter(Boolean).join("\n");

      // 7. Synthesize Response
      const synthFn = options?.synthesize ?? synthesizeDoctorPatientAnswer;
      const answer = await synthFn(queryText, patientContext, allPassages);

      const patientContextSummary: PatientContextSummary = {
        patientName: `${patient.first_name} ${patient.last_name}`.trim(),
        patientNumber: patient.patient_number,
        consultationsCount: consultations.length,
        vitalsCount: vitals.length,
        prescriptionsCount: prescriptions.length,
      };

      return {
        answer,
        sources: allPassages,
        patientContextSummary,
      };
    },
  );
}

// ---------------------------------------------------------------------------
// 5. Server Function Endpoints
// ---------------------------------------------------------------------------

/**
 * Server function endpoint for Platform Super Admin RAG search.
 * Authenticated via requireSupabaseAuth, strictly authorized for PLATFORM_ADMIN.
 */
export const adminRagSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateAdminRagInput)
  .handler(async ({ data, context }) => {
    let signal: AbortSignal | undefined;
    try {
      signal = getRequest()?.signal;
    } catch {
      // Running outside request context (e.g. tests)
    }

    return await executeAdminRagSearch(
      context.supabase as never,
      context.userId,
      data,
      signal ? { signal } : undefined,
    );
  });

/**
 * Server function endpoint for Doctor Patient Clinical RAG search.
 * Authenticated via requireSupabaseAuth, strictly authorized for active DOCTOR / OWNER.
 * Metered against clinic AI credits.
 */
export const doctorPatientRagSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateDoctorPatientRagInput)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let signal: AbortSignal | undefined;
    try {
      signal = getRequest()?.signal;
    } catch {
      // Running outside request context (e.g. tests)
    }

    return await executeDoctorPatientRagSearch(
      context.supabase as never,
      supabaseAdmin as never,
      context.userId,
      data,
      signal ? { signal } : undefined,
    );
  });
