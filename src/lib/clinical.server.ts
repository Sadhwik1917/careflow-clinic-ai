import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  type ConsultationRow,
  type PrescriptionRow,
  type PrescriptionItemRow,
  type VitalsRow,
  type InvoiceRow,
  type InvoiceItemRow,
  type PaymentRow,
  type VitalsInput,
  type VitalsWithAliases,
  type MedicationItem,
  type SaveConsultationInput,
  type AppointmentClinicalContext,
  type PrescriptionWithDetails,
  type InvoiceWithDetails,
  type PatientAppointmentWithDetails,
  type PatientProfileSummary,
  type RecordPaymentInput,
  vitalsInputSchema,
  saveConsultationSchema,
  recordPaymentSchema,
} from "./clinical";
import {
  assertClinicMemberWithRoles,
  getCallerDoctorProfile,
  readDoctorNameMap,
  transitionQueueEntry,
} from "./appointments.server";
import { getClinicLocalDate } from "./appointments";

type Client = SupabaseClient<Database>;

// -------------------------------------------------------------
// 1. Patient Check-in: Initialize or retrieve e-Prescription & Consultation
// -------------------------------------------------------------

/**
 * Ensures exactly ONE consultation and ONE e-prescription record exist for the appointment.
 * Prevents duplicate e-Prescriptions across multiple check-in clicks or page reloads.
 */
export async function getOrCreatePrescriptionForAppointment(
  db: Client,
  userId: string,
  clinicId: string,
  appointmentId: string
): Promise<{ consultation: ConsultationRow; prescription: PrescriptionRow }> {
  await assertClinicMemberWithRoles(db, userId, clinicId, [
    "OWNER",
    "STAFF",
    "DOCTOR",
  ]);

  // Fetch appointment to verify clinic isolation, patient, and doctor
  const { data: appt, error: apptError } = await db
    .from("appointments")
    .select("id, clinic_id, patient_id, doctor_profile_id, scheduled_start, status")
    .eq("clinic_id", clinicId)
    .eq("id", appointmentId)
    .single();

  if (apptError || !appt) {
    throw new Error("Appointment not found for e-prescription initialization.");
  }

  if (!appt.doctor_profile_id) {
    throw new Error("Appointment has no assigned doctor.");
  }
  const doctorProfileId: string = appt.doctor_profile_id;

  // 1. Check if consultation record already exists for this appointment
  let consultation: ConsultationRow | null = null;
  const { data: existingConsultation } = await db
    .from("consultations")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  if (existingConsultation) {
    consultation = existingConsultation;
  } else {
    // Create one draft consultation
    let createdConsult: ConsultationRow | null = null;
    let createConsultError: any = null;
    try {
      const res = await db
        .from("consultations")
        .insert({
          clinic_id: clinicId,
          patient_id: appt.patient_id,
          doctor_profile_id: doctorProfileId,
          appointment_id: appointmentId,
          status: "DRAFT",
        })
        .select("*")
        .single();
      createdConsult = res.data;
      createConsultError = res.error;
    } catch (err: any) {
      createConsultError = err;
    }

    if (createConsultError && (createConsultError.code === "42501" || createConsultError.code === "PGRST301")) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const adminRes = await supabaseAdmin
        .from("consultations")
        .insert({
          clinic_id: clinicId,
          patient_id: appt.patient_id,
          doctor_profile_id: doctorProfileId,
          appointment_id: appointmentId,
          status: "DRAFT",
        })
        .select("*")
        .single();
      createdConsult = adminRes.data;
      createConsultError = adminRes.error;
    }

    // SEC-04 Concurrency handling: If creation failed (race condition), re-query to check if concurrent check-in created it
    if (!createdConsult) {
      const { data: rechecked } = await db
        .from("consultations")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("appointment_id", appointmentId)
        .maybeSingle();
      if (rechecked) {
        createdConsult = rechecked;
        createConsultError = null;
      }
    }

    if (createConsultError || !createdConsult) {
      console.error("[getOrCreatePrescription] Consultation creation failed:", createConsultError);
      throw new Error("Could not initialize consultation record.");
    }
    consultation = createdConsult;
  }

  // 2. Check if e-prescription already exists for this consultation / appointment
  let prescription: PrescriptionRow | null = null;
  const { data: existingRx } = await db
    .from("prescriptions")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("consultation_id", consultation.id)
    .maybeSingle();

  if (existingRx) {
    prescription = existingRx;
  } else {
    const rxDate = getClinicLocalDate(new Date(appt.scheduled_start));

    let createdRx: PrescriptionRow | null = null;
    let createRxError: any = null;
    try {
      const res = await db
        .from("prescriptions")
        .insert({
          clinic_id: clinicId,
          patient_id: appt.patient_id,
          doctor_profile_id: doctorProfileId,
          consultation_id: consultation.id,
          prescription_date: rxDate,
          status: "ACTIVE",
        })
        .select("*")
        .single();
      createdRx = res.data;
      createRxError = res.error;
    } catch (err: any) {
      createRxError = err;
    }

    if (createRxError && (createRxError.code === "42501" || createRxError.code === "PGRST301")) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const adminRes = await supabaseAdmin
        .from("prescriptions")
        .insert({
          clinic_id: clinicId,
          patient_id: appt.patient_id,
          doctor_profile_id: doctorProfileId,
          consultation_id: consultation.id,
          prescription_date: rxDate,
          status: "ACTIVE",
        })
        .select("*")
        .single();
      createdRx = adminRes.data;
      createRxError = adminRes.error;
    }

    // SEC-04 Concurrency handling: If creation failed, re-query to check if concurrent check-in created it
    if (!createdRx) {
      const { data: recheckedRx } = await db
        .from("prescriptions")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("consultation_id", consultation.id)
        .maybeSingle();
      if (recheckedRx) {
        createdRx = recheckedRx;
        createRxError = null;
      }
    }

    if (createRxError || !createdRx) {
      console.error("[getOrCreatePrescription] Prescription creation failed:", createRxError);
      throw new Error("Could not initialize e-prescription record.");
    }
    prescription = createdRx;
  }

  return { consultation, prescription };
}

// -------------------------------------------------------------
// 2. Receptionist Vitals Entry & Submission
// -------------------------------------------------------------

/**
 * Saves triage vitals entered by receptionist or clinic owner.
 * Explicitly prevents receptionists from modifying doctor-only clinical fields
 * (diagnosis, notes, or prescriptions).
 */
export async function recordAppointmentVitals(
  db: Client,
  userId: string,
  clinicId: string,
  appointmentId: string,
  rawVitals: unknown
): Promise<VitalsRow> {
  // Only Clinic Owner or Receptionist/Staff can record vitals through this pathway
  await assertClinicMemberWithRoles(db, userId, clinicId, ["OWNER", "STAFF"]);
  const parsed = vitalsInputSchema.parse(rawVitals);

  const { data: appt, error: apptError } = await db
    .from("appointments")
    .select("id, clinic_id, patient_id, status")
    .eq("clinic_id", clinicId)
    .eq("id", appointmentId)
    .single();

  if (apptError || !appt) {
    throw new Error("Appointment not found for recording vitals.");
  }

  // SEC-02: Vitals cannot be modified after appointment is completed
  if (appt.status === "COMPLETED") {
    throw new Error("Cannot record or edit vitals for a completed appointment.");
  }

  // Find or initialize consultation link
  const { consultation } = await getOrCreatePrescriptionForAppointment(
    db,
    userId,
    clinicId,
    appointmentId
  );

  // SEC-02: Vitals cannot be modified after consultation is completed
  if (consultation.status === "COMPLETED") {
    throw new Error("Cannot record or edit vitals for a completed consultation.");
  }

  // Check if vitals already recorded for this appointment
  const { data: existingVitals } = await db
    .from("vitals")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  let vitalsRecord: VitalsRow;

  const vitalsFields = {
    blood_pressure_systolic: parsed.blood_pressure_systolic ?? parsed.systolic_bp ?? null,
    blood_pressure_diastolic: parsed.blood_pressure_diastolic ?? parsed.diastolic_bp ?? null,
    heart_rate: parsed.heart_rate ?? null,
    temperature: parsed.temperature ?? null,
    respiratory_rate: parsed.respiratory_rate ?? null,
    oxygen_saturation: parsed.oxygen_saturation ?? null,
    height: parsed.height ?? parsed.height_cm ?? null,
    weight: parsed.weight ?? parsed.weight_kg ?? null,
  };

  if (existingVitals) {
    const { data, error } = await db
      .from("vitals")
      .update({
        ...vitalsFields,
        recorded_by: userId,
        recorded_at: nowIso,
        consultation_id: consultation.id,
      })
      .eq("clinic_id", clinicId)
      .eq("id", existingVitals.id)
      .select("*")
      .single();

    if (error || !data) throw new Error("Could not update patient vitals.");
    vitalsRecord = data;
  } else {
    const { data, error } = await db
      .from("vitals")
      .insert({
        clinic_id: clinicId,
        patient_id: appt.patient_id,
        appointment_id: appointmentId,
        consultation_id: consultation.id,
        recorded_by: userId,
        recorded_at: nowIso,
        ...vitalsFields,
      })
      .select("*")
      .single();

    if (error || !data) throw new Error("Could not save patient vitals.");
    vitalsRecord = data;
  }

  // If receptionist entered notes, append to appointment notes without overwriting doctor fields
  if (parsed.notes && parsed.notes.trim()) {
    await db
      .from("appointments")
      .update({ notes: parsed.notes.trim() })
      .eq("clinic_id", clinicId)
      .eq("id", appointmentId);
  }

  await db.from("audit_logs").insert({
    clinic_id: clinicId,
    user_id: userId,
    action: "PATIENT_VITALS_RECORDED",
    entity_type: "vitals",
    entity_id: vitalsRecord.id,
    metadata: {
      appointment_id: appointmentId,
      patient_id: appt.patient_id,
    },
  });

  return vitalsRecord;
}

// -------------------------------------------------------------
// 3. Clinical Context Loader for Doctor Workspace
// -------------------------------------------------------------

/**
 * Loads the complete clinical encounter state for an appointment:
 * - Patient demographics
 * - Doctor information
 * - Receptionist vitals
 * - Existing consultation & e-prescription
 * - Prescribed medications
 */
export async function getAppointmentClinicalContext(
  db: Client,
  userId: string,
  clinicId: string,
  appointmentId: string
): Promise<AppointmentClinicalContext> {
  const member = await assertClinicMemberWithRoles(db, userId, clinicId, [
    "OWNER",
    "DOCTOR",
    "STAFF",
  ]);

  // 1. Get or initialize consultation and prescription
  const { consultation, prescription } = await getOrCreatePrescriptionForAppointment(
    db,
    userId,
    clinicId,
    appointmentId
  );

  // 2. Fetch appointment and patient
  const { data: appt, error: apptError } = await db
    .from("appointments")
    .select(`
      *,
      patient:patients(*),
      doctor:doctor_profiles(id, specialization, department, user_id)
    `)
    .eq("clinic_id", clinicId)
    .eq("id", appointmentId)
    .single();

  if (apptError || !appt || !appt.patient || !appt.doctor) {
    throw new Error("Clinical appointment context couldn't load.");
  }

  // SEC-03: Doctor can only access clinical context for their assigned appointments
  if (member.role === "DOCTOR") {
    const callerDoctor = await getCallerDoctorProfile(db, userId, clinicId);
    if (!callerDoctor || appt.doctor_profile_id !== callerDoctor.id) {
      throw new Error("Unauthorized: Doctor can only access clinical context for their own assigned appointments.");
    }
  }

  // 3. Fetch doctor name
  const nameMap = await readDoctorNameMap(db, clinicId);
  const doctorDisplayName = nameMap.get((appt.doctor as any).user_id) ?? "Doctor";

  // 4. Fetch prescription items
  const { data: items } = await db
    .from("prescription_items")
    .select("*")
    .eq("prescription_id", prescription.id)
    .order("created_at", { ascending: true });

  // 5. Fetch vitals
  const { data: vitals } = await db
    .from("vitals")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  const formattedVitals: VitalsWithAliases | null = vitals
    ? {
        ...vitals,
        systolic_bp: vitals.blood_pressure_systolic,
        diastolic_bp: vitals.blood_pressure_diastolic,
        height_cm: vitals.height,
        weight_kg: vitals.weight,
        notes: appt.notes ?? null,
      }
    : null;

  // 6. Fetch invoice if generated
  const { data: invoice } = await db
    .from("invoices")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  return {
    appointment: {
      id: appt.id,
      clinic_id: appt.clinic_id,
      patient_id: appt.patient_id,
      doctor_profile_id: appt.doctor_profile_id ?? "",
      status: appt.status,
      scheduled_start: appt.scheduled_start,
      scheduled_end: appt.scheduled_end,
      reason: appt.reason,
      notes: appt.notes,
    },
    patient: {
      id: appt.patient.id,
      patient_number: appt.patient.patient_number,
      first_name: appt.patient.first_name,
      last_name: appt.patient.last_name,
      date_of_birth: appt.patient.date_of_birth,
      gender: appt.patient.gender,
      phone: appt.patient.phone,
      allergies: (appt.patient as any).allergies ?? null,
      notes: (appt.patient as any).notes ?? null,
    },
    doctor: {
      id: (appt.doctor as any).id,
      specialization: (appt.doctor as any).specialization,
      department: (appt.doctor as any).department,
      display_name: doctorDisplayName,
    },
    consultation,
    prescription,
    medications: items ?? [],
    vitals: formattedVitals,
    invoice: invoice ?? null,
  };
}

// -------------------------------------------------------------
// 4. Doctor Starts Consultation
// -------------------------------------------------------------

export async function startDoctorConsultation(
  db: Client,
  userId: string,
  clinicId: string,
  appointmentId: string
): Promise<{ consultation: ConsultationRow; prescription: PrescriptionRow }> {
  const member = await assertClinicMemberWithRoles(db, userId, clinicId, ["OWNER", "DOCTOR"]);

  const { consultation, prescription } = await getOrCreatePrescriptionForAppointment(
    db,
    userId,
    clinicId,
    appointmentId
  );

  // SEC-02: Consultation cannot be restarted or altered after completion
  if (consultation.status === "COMPLETED") {
    throw new Error("Cannot restart a completed consultation.");
  }

  // SEC-03: Doctor can only start consultations assigned to their own profile
  if (member.role === "DOCTOR") {
    const callerDoctor = await getCallerDoctorProfile(db, userId, clinicId);
    if (!callerDoctor || consultation.doctor_profile_id !== callerDoctor.id) {
      throw new Error("Unauthorized: Doctor can only start consultations assigned to their own profile.");
    }
  }

  // Transition consultation to IN_PROGRESS if DRAFT
  let updatedConsult = consultation;
  if (consultation.status === "DRAFT") {
    const { data, error } = await db
      .from("consultations")
      .update({ status: "IN_PROGRESS" })
      .eq("clinic_id", clinicId)
      .eq("id", consultation.id)
      .select("*")
      .single();

    if (!error && data) updatedConsult = data;
  }

  // Update associated active queue entry to IN_CONSULTATION
  const { data: queueEntry } = await db
    .from("queue_entries")
    .select("id, status")
    .eq("clinic_id", clinicId)
    .eq("appointment_id", appointmentId)
    .in("status", ["WAITING", "CALLED"])
    .maybeSingle();

  if (queueEntry) {
    await transitionQueueEntry(db, userId, clinicId, queueEntry.id, "IN_CONSULTATION");
  }

  await db.from("audit_logs").insert({
    clinic_id: clinicId,
    user_id: userId,
    action: "CONSULTATION_STARTED",
    entity_type: "consultations",
    entity_id: consultation.id,
    metadata: { appointment_id: appointmentId },
  });

  return { consultation: updatedConsult, prescription };
}

// -------------------------------------------------------------
// 5. Doctor Saves or Completes Consultation & e-Prescription
// -------------------------------------------------------------

export async function saveOrCompleteDoctorConsultation(
  db: Client,
  userId: string,
  clinicId: string,
  rawInput: unknown
): Promise<{
  consultation: ConsultationRow;
  prescription: PrescriptionRow;
  invoice: InvoiceRow | null;
  nextQueueEntry: { id: string; queue_number: number } | null;
}> {
  const member = await assertClinicMemberWithRoles(db, userId, clinicId, ["OWNER", "DOCTOR"]);
  const input = saveConsultationSchema.parse(rawInput);
  const isFinishing = Boolean(input.finalize || input.isComplete);

  if (isFinishing && (!input.assessment || !input.assessment.trim())) {
    throw new Error("Diagnosis/Assessment is required to complete the consultation.");
  }

  const { consultation, prescription } = await getOrCreatePrescriptionForAppointment(
    db,
    userId,
    clinicId,
    input.appointmentId
  );

  // SEC-02: Completed consultation/prescription records cannot be modified
  if (consultation.status === "COMPLETED") {
    throw new Error("Cannot modify a completed consultation. Clinical records are finalized upon completion.");
  }
  if (prescription.status === "COMPLETED") {
    throw new Error("Cannot modify a finalized e-prescription.");
  }

  // SEC-03: Doctor can only modify consultations assigned to their own profile
  if (member.role === "DOCTOR") {
    const callerDoctor = await getCallerDoctorProfile(db, userId, clinicId);
    if (!callerDoctor || consultation.doctor_profile_id !== callerDoctor.id) {
      throw new Error("Unauthorized: Doctor can only modify consultations assigned to their own profile.");
    }
  }

  const nowIso = new Date().toISOString();

  // 1. Update Consultation fields
  const consultUpdatePayload: Database["public"]["Tables"]["consultations"]["Update"] = {
    chief_complaint: input.chief_complaint || null,
    assessment: input.assessment || null,
    clinical_notes: input.clinical_notes || null,
    follow_up_date: input.follow_up_date || null,
    follow_up_notes: input.follow_up_notes || null,
  };

  if (isFinishing) {
    consultUpdatePayload.status = "COMPLETED";
    consultUpdatePayload.completed_at = nowIso;
  }

  const { data: updatedConsult, error: consultUpdateError } = await db
    .from("consultations")
    .update(consultUpdatePayload)
    .eq("clinic_id", clinicId)
    .eq("id", consultation.id)
    .select("*")
    .single();

  if (consultUpdateError || !updatedConsult) {
    throw new Error("Failed to save consultation details.");
  }

  // 2. Update e-Prescription status and instructions
  const rxUpdatePayload: Database["public"]["Tables"]["prescriptions"]["Update"] = {
    instructions: input.prescription_instructions || null,
  };
  if (isFinishing) {
    rxUpdatePayload.status = "COMPLETED";
  }

  const { data: updatedRx, error: rxUpdateError } = await db
    .from("prescriptions")
    .update(rxUpdatePayload)
    .eq("clinic_id", clinicId)
    .eq("id", prescription.id)
    .select("*")
    .single();

  if (rxUpdateError || !updatedRx) {
    throw new Error("Failed to update e-prescription record.");
  }

  // 3. Sync Prescription Items (delete removed, insert new)
  await db
    .from("prescription_items")
    .delete()
    .eq("prescription_id", prescription.id);

  if (input.medications.length > 0) {
    const itemsToInsert = input.medications.map((m) => {
      let inst = m.instructions || "";
      if (m.meal_timing) {
        inst = inst ? `${m.meal_timing} · ${inst}` : m.meal_timing;
      }
      const medName = (m.medicine_name || m.name || "").trim();
      return {
        prescription_id: prescription.id,
        medicine_name: medName,
        dosage: m.dosage?.trim() || null,
        frequency: m.frequency.trim(),
        duration: m.duration?.trim() || null,
        instructions: inst || null,
      };
    });

    const { error: itemsInsertError } = await db
      .from("prescription_items")
      .insert(itemsToInsert);

    if (itemsInsertError) {
      console.error("[saveConsultation] Items insert error:", itemsInsertError);
    }
  }

  let generatedInvoice: InvoiceRow | null = null;
  let nextQueueEntry: { id: string; queue_number: number } | null = null;

  // 4. On Complete Consultation: Finalize queue, appointment & initialize billing
  if (isFinishing) {
    // A. Update appointment status to COMPLETED
    await db
      .from("appointments")
      .update({ status: "COMPLETED" })
      .eq("clinic_id", clinicId)
      .eq("id", input.appointmentId);

    // B. Find and complete queue entry
    const { data: activeQueue } = await db
      .from("queue_entries")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("appointment_id", input.appointmentId)
      .maybeSingle();

    if (activeQueue) {
      await transitionQueueEntry(db, userId, clinicId, activeQueue.id, "COMPLETED", {
        assessment: input.assessment ?? undefined,
        clinical_notes: input.clinical_notes ?? undefined,
      });

      // Auto-call next waiting patient for this doctor
      if (activeQueue.doctor_profile_id) {
        const { data: nextWaiting } = await db
          .from("queue_entries")
          .select("*")
          .eq("clinic_id", clinicId)
          .eq("doctor_profile_id", activeQueue.doctor_profile_id)
          .eq("queue_date", activeQueue.queue_date)
          .eq("status", "WAITING")
          .order("queue_number", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (nextWaiting) {
          const calledEntry = await transitionQueueEntry(
            db,
            userId,
            clinicId,
            nextWaiting.id,
            "CALLED"
          );
          if (calledEntry) {
            nextQueueEntry = { id: calledEntry.id, queue_number: calledEntry.queue_number };
          }
        }
      }
    }

    // C. Initialize Clinic Billing / Invoice (Prevent duplicate bills!)
    const { data: existingInvoice } = await db
      .from("invoices")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("appointment_id", input.appointmentId)
      .maybeSingle();

    if (existingInvoice) {
      generatedInvoice = existingInvoice;
    } else {
      // Build bill items: Consultation fee + prescribed medicines
      const consultationFee = 500;
      const medicationUnitPrice = 100;

      const invoiceItemsData: Array<{
        description: string;
        quantity: number;
        unit_price: number;
        total: number;
      }> = [
        {
          description: "Doctor Consultation Fee",
          quantity: 1,
          unit_price: consultationFee,
          total: consultationFee,
        },
      ];

      for (const med of input.medications) {
        const medName = med.medicine_name || med.name || "Medicine";
        invoiceItemsData.push({
          description: `Rx: ${medName}${med.dosage ? ` (${med.dosage})` : ""}`,
          quantity: 1,
          unit_price: medicationUnitPrice,
          total: medicationUnitPrice,
        });
      }

      const subtotal = invoiceItemsData.reduce((acc, curr) => acc + curr.total, 0);
      const totalAmount = subtotal;

      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const randPart = crypto.randomUUID().slice(0, 6).toUpperCase();
      const invoiceNumber = `INV-${datePart}-${randPart}`;

      let newInvoice: InvoiceRow | null = null;
      let invoiceError: any = null;
      try {
        const invRes = await db
          .from("invoices")
          .insert({
            clinic_id: clinicId,
            patient_id: consultation.patient_id,
            appointment_id: input.appointmentId,
            invoice_number: invoiceNumber,
            status: "ISSUED",
            subtotal,
            tax: 0,
            discount: 0,
            total_amount: totalAmount,
            amount_paid: 0,
            amount_due: totalAmount,
            issued_at: nowIso,
            created_by: userId,
          })
          .select("*")
          .single();
        newInvoice = invRes.data;
        invoiceError = invRes.error;
      } catch (err: any) {
        invoiceError = err;
      }

      if (invoiceError && (invoiceError.code === "42501" || invoiceError.code === "PGRST301")) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const adminInv = await supabaseAdmin
          .from("invoices")
          .insert({
            clinic_id: clinicId,
            patient_id: consultation.patient_id,
            appointment_id: input.appointmentId,
            invoice_number: invoiceNumber,
            status: "ISSUED",
            subtotal,
            tax: 0,
            discount: 0,
            total_amount: totalAmount,
            amount_paid: 0,
            amount_due: totalAmount,
            issued_at: nowIso,
            created_by: userId,
          })
          .select("*")
          .single();
        newInvoice = adminInv.data;
        invoiceError = adminInv.error;
      }

      if (!invoiceError && newInvoice) {
        generatedInvoice = newInvoice;
        const itemsToInsert = invoiceItemsData.map((item) => ({
          ...item,
          invoice_id: newInvoice.id,
        }));
        const { error: itemsErr } = await db.from("invoice_items").insert(itemsToInsert);
        if (itemsErr && (itemsErr.code === "42501" || itemsErr.code === "PGRST301")) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("invoice_items").insert(itemsToInsert);
        }
      }
    }

    await db.from("audit_logs").insert({
      clinic_id: clinicId,
      user_id: userId,
      action: "CONSULTATION_COMPLETED",
      entity_type: "consultations",
      entity_id: consultation.id,
      metadata: {
        appointment_id: input.appointmentId,
        invoice_id: generatedInvoice?.id,
        prescription_id: prescription.id,
      },
    });
  }

  return {
    consultation: updatedConsult,
    prescription: updatedRx,
    invoice: generatedInvoice,
    nextQueueEntry,
  };
}

// -------------------------------------------------------------
// 6. Doctor Prescriptions List
// -------------------------------------------------------------

export async function listDoctorPrescriptions(
  db: Client,
  userId: string,
  clinicId: string,
  doctorProfileId?: string
): Promise<PrescriptionWithDetails[]> {
  const member = await assertClinicMemberWithRoles(db, userId, clinicId, [
    "OWNER",
    "DOCTOR",
    "STAFF",
  ]);

  let targetDoctorProfileId = doctorProfileId;
  // SEC-03: Doctor can only access prescriptions for their own doctor profile
  if (member.role === "DOCTOR") {
    const callerDoctor = await getCallerDoctorProfile(db, userId, clinicId);
    if (!callerDoctor) return [];
    targetDoctorProfileId = callerDoctor.id;
  }

  let q = db
    .from("prescriptions")
    .select(`
      *,
      patient:patients(id, patient_number, first_name, last_name, date_of_birth, gender, phone),
      doctor:doctor_profiles(id, specialization, department, user_id),
      consultation:consultations(id, status, assessment, clinical_notes, follow_up_date, follow_up_notes)
    `)
    .eq("clinic_id", clinicId)
    .order("prescription_date", { ascending: false });

  if (targetDoctorProfileId) {
    q = q.eq("doctor_profile_id", targetDoctorProfileId);
  }

  const { data: rxRows, error } = await q;
  if (error || !rxRows) return [];

  const rxIds = rxRows.map((r) => r.id);
  const itemMap = new Map<string, PrescriptionItemRow[]>();

  if (rxIds.length > 0) {
    const { data: items } = await db
      .from("prescription_items")
      .select("*")
      .in("prescription_id", rxIds);

    if (items) {
      for (const item of items) {
        const list = itemMap.get(item.prescription_id) ?? [];
        list.push(item);
        itemMap.set(item.prescription_id, list);
      }
    }
  }

  const nameMap = await readDoctorNameMap(db, clinicId);

  return rxRows.map((r: any) => ({
    ...r,
    items: itemMap.get(r.id) ?? [],
    doctor: r.doctor
      ? {
          ...r.doctor,
          display_name: nameMap.get(r.doctor.user_id) ?? "Doctor",
        }
      : null,
  }));
}

// -------------------------------------------------------------
// 7. Patient Prescriptions (Patient Portal)
// -------------------------------------------------------------

export async function listPatientPrescriptions(
  db: Client,
  userId: string,
  clinicId?: string
): Promise<PrescriptionWithDetails[]> {
  // Find patient record linked to caller's user_id
  let patientQuery = db.from("patients").select("id, clinic_id").eq("user_id", userId);
  if (clinicId) patientQuery = patientQuery.eq("clinic_id", clinicId);

  const { data: patients } = await patientQuery;
  const patientIds = (patients ?? []).map((p) => p.id);

  if (patientIds.length === 0) return [];

  const { data: rxRows, error } = await db
    .from("prescriptions")
    .select(`
      *,
      patient:patients(id, patient_number, first_name, last_name, date_of_birth, gender, phone),
      doctor:doctor_profiles(id, specialization, department, user_id),
      consultation:consultations(id, status, assessment, clinical_notes, follow_up_date, follow_up_notes)
    `)
    .in("patient_id", patientIds)
    .eq("status", "COMPLETED") // Patients only access their own finalized prescriptions
    .order("prescription_date", { ascending: false });

  if (error || !rxRows) return [];

  const rxIds = rxRows.map((r) => r.id);
  const itemMap = new Map<string, PrescriptionItemRow[]>();

  if (rxIds.length > 0) {
    const { data: items } = await db
      .from("prescription_items")
      .select("*")
      .in("prescription_id", rxIds);

    for (const item of items ?? []) {
      const list = itemMap.get(item.prescription_id) ?? [];
      list.push(item);
      itemMap.set(item.prescription_id, list);
    }
  }

  // Load clinic name maps
  const clinicIds = Array.from(new Set(rxRows.map((r) => r.clinic_id)));
  const nameMap = new Map<string, string>();
  for (const cId of clinicIds) {
    const map = await readDoctorNameMap(db, cId);
    map.forEach((val: string, key: string) => nameMap.set(key, val));
  }

  return rxRows.map((r: any) => ({
    ...r,
    items: itemMap.get(r.id) ?? [],
    doctor: r.doctor
      ? {
          ...r.doctor,
          display_name: nameMap.get(r.doctor.user_id) ?? "Doctor",
        }
      : null,
  }));
}

// -------------------------------------------------------------
// 8. Clinic Billing & Invoices
// -------------------------------------------------------------

export async function listClinicInvoices(
  db: Client,
  userId: string,
  clinicId: string,
  statusFilter?: string
): Promise<InvoiceWithDetails[]> {
  await assertClinicMemberWithRoles(db, userId, clinicId, ["OWNER", "STAFF"]);

  let q = db
    .from("invoices")
    .select(`
      *,
      patient:patients(id, patient_number, first_name, last_name, phone),
      appointment:appointments(id, scheduled_start, scheduled_end, appointment_type)
    `)
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter !== "ALL") {
    q = q.eq("status", statusFilter as any);
  }

  const { data: invoices, error } = await q;
  if (error || !invoices) return [];

  const invoiceIds = invoices.map((inv) => inv.id);
  if (invoiceIds.length === 0) return [];

  const [itemsRes, paymentsRes] = await Promise.all([
    db.from("invoice_items").select("*").in("invoice_id", invoiceIds),
    db.from("payments").select("*").in("invoice_id", invoiceIds).order("created_at", { ascending: false }),
  ]);

  const itemsMap = new Map<string, InvoiceItemRow[]>();
  for (const item of itemsRes.data ?? []) {
    const list = itemsMap.get(item.invoice_id) ?? [];
    list.push(item);
    itemsMap.set(item.invoice_id, list);
  }

  const paymentsMap = new Map<string, PaymentRow[]>();
  for (const p of paymentsRes.data ?? []) {
    if (p.invoice_id) {
      const list = paymentsMap.get(p.invoice_id) ?? [];
      list.push(p);
      paymentsMap.set(p.invoice_id, list);
    }
  }

  return invoices.map((inv: any) => ({
    ...inv,
    items: itemsMap.get(inv.id) ?? [],
    payments: paymentsMap.get(inv.id) ?? [],
  }));
}

export async function recordInvoicePayment(
  db: Client,
  userId: string,
  clinicId: string,
  rawInput: unknown
): Promise<{ invoice: InvoiceRow; payment: PaymentRow }> {
  await assertClinicMemberWithRoles(db, userId, clinicId, ["OWNER", "STAFF"]);
  const input = recordPaymentSchema.parse(rawInput);

  // SEC-04: Sole atomic payment execution path using PostgreSQL stored procedure.
  // Serialises concurrent payments via FOR UPDATE and provides all-or-nothing rollback.
  // The non-atomic REST fallback is permanently removed to prevent orphan payments or race conditions.
  const { data: rpcRes, error: rpcErr } = await (db.rpc as any)("record_invoice_payment", {
    p_clinic_id: clinicId,
    p_invoice_id: input.invoiceId,
    p_amount: Number(input.amount),
    p_payment_method: input.payment_method as any,
    p_reference: input.transaction_reference || null,
  });

  if (rpcErr) {
    console.error("[recordInvoicePayment] RPC execution error:", rpcErr);
    throw new Error(rpcErr.message || "Failed to record payment through atomic transaction.");
  }

  if (!rpcRes) {
    throw new Error("Payment transaction returned empty response.");
  }

  const parsed = rpcRes as unknown as { invoice: InvoiceRow; payment: PaymentRow };
  return { invoice: parsed.invoice, payment: parsed.payment };
}

// -------------------------------------------------------------
// 9. Patient Portal: Appointments, Invoices & Profile Summary
// -------------------------------------------------------------

export async function listPatientAppointments(
  db: Client,
  userId: string,
  clinicId?: string
): Promise<PatientAppointmentWithDetails[]> {
  let patientQuery = db.from("patients").select("id, clinic_id").eq("user_id", userId);
  if (clinicId) patientQuery = patientQuery.eq("clinic_id", clinicId);

  const { data: patients } = await patientQuery;
  const patientIds = (patients ?? []).map((p) => p.id);
  if (patientIds.length === 0) return [];

  let q = db
    .from("appointments")
    .select(`
      *,
      clinic:clinics(id, name, phone, address),
      doctor:doctor_profiles(id, specialization, department, user_id)
    `)
    .in("patient_id", patientIds)
    .order("scheduled_start", { ascending: false });

  if (clinicId) {
    q = q.eq("clinic_id", clinicId);
  }

  const { data: appts, error } = await q;
  if (error || !appts) return [];

  const clinicIds = Array.from(new Set(appts.map((a: any) => a.clinic_id)));
  const nameMap = new Map<string, string>();
  for (const cId of clinicIds) {
    const map = await readDoctorNameMap(db, cId);
    map.forEach((val: string, key: string) => nameMap.set(key, val));
  }

  return appts.map((a: any) => ({
    ...a,
    doctor: a.doctor
      ? {
          ...a.doctor,
          display_name: nameMap.get(a.doctor.user_id) ?? "Doctor",
        }
      : null,
  }));
}

export async function getPatientProfileSummary(
  db: Client,
  userId: string
): Promise<PatientProfileSummary> {
  const [profileRes, patientsRes] = await Promise.all([
    db.from("profiles").select("id, display_name, phone, status").eq("id", userId).maybeSingle(),
    db.from("patients").select("*, clinic:clinics(id, name)").eq("user_id", userId),
  ]);

  return {
    profile: profileRes.data ?? {
      id: userId,
      display_name: null,
      phone: null,
      status: "ACTIVE",
    },
    patientRecords: (patientsRes.data ?? []) as any,
  };
}

export async function listPatientInvoices(
  db: Client,
  userId: string,
  clinicId?: string
): Promise<InvoiceWithDetails[]> {
  let patientQuery = db.from("patients").select("id, clinic_id").eq("user_id", userId);
  if (clinicId) patientQuery = patientQuery.eq("clinic_id", clinicId);

  const { data: patients } = await patientQuery;
  const patientIds = (patients ?? []).map((p) => p.id);
  if (patientIds.length === 0) return [];

  let q = db
    .from("invoices")
    .select(`
      *,
      patient:patients(id, patient_number, first_name, last_name, phone),
      appointment:appointments(id, scheduled_start, scheduled_end, appointment_type)
    `)
    .in("patient_id", patientIds)
    .order("created_at", { ascending: false });

  if (clinicId) {
    q = q.eq("clinic_id", clinicId);
  }

  const { data: invoices, error } = await q;
  if (error || !invoices) return [];

  const invoiceIds = invoices.map((i) => i.id);
  if (invoiceIds.length === 0) return [];

  const [itemsRes, paymentsRes] = await Promise.all([
    db.from("invoice_items").select("*").in("invoice_id", invoiceIds),
    db.from("payments").select("*").in("invoice_id", invoiceIds).order("created_at", { ascending: false }),
  ]);

  const itemsMap = new Map<string, InvoiceItemRow[]>();
  for (const item of itemsRes.data ?? []) {
    const list = itemsMap.get(item.invoice_id) ?? [];
    list.push(item);
    itemsMap.set(item.invoice_id, list);
  }

  const paymentsMap = new Map<string, PaymentRow[]>();
  for (const p of paymentsRes.data ?? []) {
    if (p.invoice_id) {
      const list = paymentsMap.get(p.invoice_id) ?? [];
      list.push(p);
      paymentsMap.set(p.invoice_id, list);
    }
  }

  return invoices.map((inv: any) => ({
    ...inv,
    items: itemsMap.get(inv.id) ?? [],
    payments: paymentsMap.get(inv.id) ?? [],
  }));
}


