import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  FREQUENCY_PRESETS,
  MEAL_TIMING_OPTIONS,
  formatFrequencyLabel,
  formatMealTimingLabel,
  vitalsInputSchema,
  medicationItemSchema,
  saveConsultationSchema,
  recordPaymentSchema,
} from "@/lib/clinical";
import {
  getOrCreatePrescriptionForAppointment,
  recordAppointmentVitals,
  getAppointmentClinicalContext,
  startDoctorConsultation,
  saveOrCompleteDoctorConsultation,
  listDoctorPrescriptions,
  listPatientPrescriptions,
  listClinicInvoices,
  recordInvoicePayment,
} from "@/lib/clinical.server";

const clinicId = "11111111-1111-4111-8111-111111111111";
const doctorId = "22222222-2222-4222-8222-222222222222";
const patientId = "33333333-3333-4333-8333-333333333333";
const appointmentId = "44444444-4444-4444-8444-444444444444";
const consultationId = "55555555-5555-4555-8555-555555555555";
const prescriptionId = "66666666-6666-4666-8666-666666666666";
const invoiceId = "77777777-7777-4777-8777-777777777777";
const userId = "88888888-8888-4888-8888-888888888888";
const staffUserId = "99999999-9999-4999-8999-999999999999";

function createClinicalDbMock(options: {
  role?: "OWNER" | "DOCTOR" | "STAFF" | "PATIENT";
  existingConsultation?: boolean;
  existingPrescription?: boolean;
  existingVitals?: boolean;
  existingInvoice?: boolean;
  hasWaitingPatient?: boolean;
  consultationStatus?: "DRAFT" | "IN_PROGRESS" | "COMPLETED";
  prescriptionStatus?: "ACTIVE" | "COMPLETED";
  appointmentStatus?: "CHECKED_IN" | "COMPLETED";
  invoiceStatus?: "ISSUED" | "PAID" | "CANCELLED";
  appointmentDoctorProfileId?: string;
  concurrencyConflict?: boolean;
  rpcError?: any;
  existingPaymentReference?: string;
} = {}) {
  const role = options.role ?? "DOCTOR";
  const apptDoctorProfileId = options.appointmentDoctorProfileId ?? doctorId;
  const consultRow = {
    id: consultationId,
    clinic_id: clinicId,
    patient_id: patientId,
    doctor_profile_id: apptDoctorProfileId,
    appointment_id: appointmentId,
    status: options.consultationStatus ?? (options.existingConsultation ? "IN_PROGRESS" : "DRAFT"),
    chief_complaint: "Cough and mild fever",
    assessment: "Viral bronchitis",
    clinical_notes: "Advised bed rest and fluids",
    follow_up_date: "2026-11-05",
    follow_up_notes: "Review in 1 week",
    completed_at: null,
    created_at: "2026-10-28T09:00:00Z",
    updated_at: "2026-10-28T09:00:00Z",
  };

  const prescriptionRow = {
    id: prescriptionId,
    clinic_id: clinicId,
    patient_id: patientId,
    doctor_profile_id: doctorId,
    consultation_id: consultationId,
    prescription_date: "2026-10-28",
    status: options.prescriptionStatus ?? (options.existingPrescription ? "ACTIVE" : "ACTIVE"),
    instructions: "Take with warm water",
    created_at: "2026-10-28T09:00:00Z",
    updated_at: "2026-10-28T09:00:00Z",
  };

  const vitalsRow = {
    id: "vitals-123",
    clinic_id: clinicId,
    patient_id: patientId,
    appointment_id: appointmentId,
    consultation_id: consultationId,
    blood_pressure_systolic: 120,
    blood_pressure_diastolic: 80,
    heart_rate: 72,
    temperature: 98.6,
    respiratory_rate: 16,
    oxygen_saturation: 99,
    height: 175,
    weight: 70,
    recorded_by: staffUserId,
    recorded_at: "2026-10-28T08:45:00Z",
    created_at: "2026-10-28T08:45:00Z",
  };

  const invoiceRow = {
    id: invoiceId,
    clinic_id: clinicId,
    patient_id: patientId,
    appointment_id: appointmentId,
    invoice_number: "INV-20261028-001",
    status: options.invoiceStatus ?? "ISSUED",
    subtotal: 600,
    tax: 0,
    discount: 0,
    total_amount: 600,
    amount_paid: 0,
    amount_due: 600,
    issued_at: "2026-10-28T09:30:00Z",
    created_by: userId,
    created_at: "2026-10-28T09:30:00Z",
    updated_at: "2026-10-28T09:30:00Z",
  };

  const calls: [string, unknown[]][] = [];
  const insertedRows: Record<string, any[]> = {};

  const from = (table: string) => {
    const filters: Record<string, any> = {};
    let pendingInsert: any = null;
    let pendingUpdate: any = null;

    const chain: any = {};
    for (const m of [
      "select",
      "insert",
      "update",
      "delete",
      "order",
      "eq",
      "neq",
      "in",
      "limit",
    ]) {
      chain[m] = (...args: any[]) => {
        calls.push([`${table}.${m}`, args]);
        if (m === "eq") {
          filters[args[0]] = args[1];
        }
        if (m === "insert") {
          pendingInsert = args[0];
          if (!insertedRows[table]) insertedRows[table] = [];
          if (Array.isArray(args[0])) {
            insertedRows[table].push(...args[0]);
          } else {
            insertedRows[table].push(args[0]);
          }
        }
        if (m === "update") {
          pendingUpdate = args[0];
        }
        return chain;
      };
    }

    chain.single = async () => {
      if (table === "appointments") {
        return {
          data: {
            id: appointmentId,
            clinic_id: clinicId,
            patient_id: patientId,
            doctor_profile_id: apptDoctorProfileId,
            scheduled_start: "2026-10-28T10:00:00+05:30",
            scheduled_end: "2026-10-28T10:30:00+05:30",
            status: options.appointmentStatus ?? "CHECKED_IN",
            reason: "Fever and cough",
            notes: "Patient reported mild dizziness",
            patient: {
              id: patientId,
              patient_number: "P-1001",
              first_name: "Rahul",
              last_name: "Verma",
              gender: "MALE",
              phone: "9876543210",
              date_of_birth: "1990-01-01",
            },
            doctor: {
              id: apptDoctorProfileId,
              specialization: "General Medicine",
              department: "OPD",
              user_id: userId,
            },
          },
          error: null,
        };
      }
      if (table === "consultations") {
        return { data: { ...consultRow, ...(pendingUpdate ?? {}) }, error: null };
      }
      if (table === "prescriptions") {
        return { data: { ...prescriptionRow, ...(pendingUpdate ?? {}) }, error: null };
      }
      if (table === "vitals") {
        return { data: { ...vitalsRow, ...(pendingUpdate ?? {}) }, error: null };
      }
      if (table === "invoices") {
        return { data: { ...invoiceRow, ...(pendingUpdate ?? {}) }, error: null };
      }
      if (table === "payments") {
        return {
          data: {
            id: "payment-123",
            clinic_id: clinicId,
            invoice_id: invoiceId,
            patient_id: patientId,
            amount: 600,
            payment_method: "UPI",
            paid_at: new Date().toISOString(),
            status: "SUCCESS",
            transaction_reference: "UPI-999888",
            recorded_by: userId,
            created_at: new Date().toISOString(),
          },
          error: null,
        };
      }
      if (table === "queue_entries") {
        const isNextWaiting = filters["id"] === "next-queue-id";
        return {
          data: {
            id: isNextWaiting ? "next-queue-id" : "queue-123",
            queue_number: isNextWaiting ? 2 : 1,
            clinic_id: clinicId,
            appointment_id: appointmentId,
            doctor_profile_id: doctorId,
            status: isNextWaiting ? (pendingUpdate?.["status"] ?? "WAITING") : (pendingUpdate?.["status"] ?? "IN_CONSULTATION"),
            checked_in_at: new Date().toISOString(),
          },
          error: null,
        };
      }
      return { data: pendingInsert ?? {}, error: null };
    };

    chain.maybeSingle = async () => {
      if (table === "profiles") {
        return { data: { platform_role: "USER", status: "ACTIVE" }, error: null };
      }
      if (table === "clinic_members") {
        return { data: { role, status: "ACTIVE" }, error: null };
      }
      if (table === "doctor_profiles") {
        return {
          data: {
            id: doctorId,
            user_id: userId,
            clinic_id: clinicId,
            specialization: "General Medicine",
            department: "OPD",
            status: "ACTIVE",
          },
          error: null,
        };
      }
      if (table === "consultations") {
        return { data: options.existingConsultation ? consultRow : null, error: null };
      }
      if (table === "prescriptions") {
        return { data: options.existingPrescription ? prescriptionRow : null, error: null };
      }
      if (table === "vitals") {
        return { data: options.existingVitals ? vitalsRow : null, error: null };
      }
      if (table === "invoices") {
        if (options.concurrencyConflict) {
          return { data: null, error: null };
        }
        return {
          data: options.existingInvoice
            ? { ...invoiceRow, ...(pendingUpdate ?? {}) }
            : null,
          error: null,
        };
      }
      if (table === "queue_entries") {
        if (filters["id"] === "next-queue-id" || filters["status"] === "WAITING") {
          return {
            data: options.hasWaitingPatient
              ? {
                  id: "next-queue-id",
                  queue_number: 2,
                  status: "WAITING",
                  doctor_profile_id: doctorId,
                  clinic_id: clinicId,
                  appointment_id: appointmentId,
                  queue_date: "2026-10-28",
                  checked_in_at: new Date().toISOString(),
                }
              : null,
            error: null,
          };
        }
        return {
          data: {
            id: "queue-123",
            appointment_id: appointmentId,
            clinic_id: clinicId,
            doctor_profile_id: doctorId,
            queue_date: "2026-10-28",
            queue_number: 1,
            status: "IN_CONSULTATION",
            checked_in_at: new Date().toISOString(),
          },
          error: null,
        };
      }
      return { data: null, error: null };
    };

    chain.then = (resolve: any) => {
      if (table === "prescription_items") {
        resolve({
          data: [
            {
              id: "item-1",
              prescription_id: prescriptionId,
              medicine_name: "Amoxicillin 500mg",
              dosage: "500 mg",
              frequency: "1-0-1",
              duration: "5 days",
              instructions: "After Meal · Take with water",
              created_at: "2026-10-28T09:05:00Z",
            },
          ],
          error: null,
        });
        return;
      }
      if (table === "prescriptions") {
        resolve({
          data: [
            {
              ...prescriptionRow,
              patient: {
                id: patientId,
                patient_number: "P-1001",
                first_name: "Rahul",
                last_name: "Verma",
                phone: "9876543210",
              },
              doctor: {
                id: doctorId,
                specialization: "General Medicine",
                department: "OPD",
                user_id: userId,
              },
              consultation: consultRow,
            },
          ],
          error: null,
        });
        return;
      }
      if (table === "invoices") {
        resolve({
          data: [
            {
              ...invoiceRow,
              patient: {
                id: patientId,
                patient_number: "P-1001",
                first_name: "Rahul",
                last_name: "Verma",
                phone: "9876543210",
              },
              appointment: {
                id: appointmentId,
                scheduled_start: "2026-10-28T10:00:00Z",
                scheduled_end: "2026-10-28T10:30:00Z",
                appointment_type: "IN_PERSON",
              },
            },
          ],
          error: null,
        });
        return;
      }
      if (table === "invoice_items") {
        resolve({
          data: [
            {
              id: "inv-item-1",
              invoice_id: invoiceId,
              description: "Doctor Consultation Fee",
              quantity: 1,
              unit_price: 500,
              total: 500,
              created_at: "2026-10-28T09:30:00Z",
            },
            {
              id: "inv-item-2",
              invoice_id: invoiceId,
              description: "Rx: Amoxicillin 500mg",
              quantity: 1,
              unit_price: 100,
              total: 100,
              created_at: "2026-10-28T09:30:00Z",
            },
          ],
          error: null,
        });
        return;
      }
      if (table === "payments") {
        resolve({ data: [], error: null });
        return;
      }
      if (table === "patients") {
        resolve({ data: [{ id: patientId, clinic_id: clinicId }], error: null });
        return;
      }
      resolve({ data: [], error: null });
    };

    return chain;
  };

  const rpc = (fn: string, args: any) => {
    calls.push([`rpc.${fn}`, [args]]);
    if (fn === "clinic_is_operational") {
      return Promise.resolve({ data: true, error: null });
    }
    if (fn === "clinic_member_names") {
      return Promise.resolve({
        data: [{ user_id: userId, display_name: "Dr. Sarah Smith" }],
        error: null,
      });
    }
    if (fn === "record_invoice_payment") {
      if (options.rpcError) {
        return Promise.resolve({ data: null, error: options.rpcError });
      }
      if (options.role === "PATIENT") {
        return Promise.resolve({ data: null, error: { message: "Access is unavailable for this clinic.", code: "42501" } });
      }
      if (options.invoiceStatus === "PAID" || options.invoiceStatus === "CANCELLED") {
        return Promise.resolve({
          data: null,
          error: { message: "Invoice has already been finalized or cancelled.", code: "22023" },
        });
      }
      if (options.concurrencyConflict) {
        return Promise.resolve({
          data: null,
          error: { message: "Invoice was modified concurrently by another transaction. Please refresh and retry.", code: "40001" },
        });
      }
      if (args.p_reference && options.existingPaymentReference === args.p_reference) {
        return Promise.resolve({
          data: {
            payment: {
              id: "payment-existing-123",
              clinic_id: args.p_clinic_id,
              invoice_id: args.p_invoice_id,
              amount: 300,
              payment_method: args.p_payment_method,
              status: "SUCCESS",
              transaction_reference: args.p_reference,
            },
            invoice: invoiceRow,
          },
          error: null,
        });
      }
      const payAmount = Number(args.p_amount);
      if (payAmount > 600) {
        return Promise.resolve({
          data: null,
          error: { message: "Payment cannot exceed the outstanding balance of ₹600.", code: "22023" },
        });
      }
      const newPaid = payAmount;
      const newDue = Math.max(0, 600 - newPaid);
      const newStatus = newDue === 0 ? "PAID" : "PARTIALLY_PAID";
      const payment = {
        id: "payment-atomic-123",
        clinic_id: args.p_clinic_id,
        invoice_id: args.p_invoice_id,
        patient_id: patientId,
        amount: payAmount,
        payment_method: args.p_payment_method,
        paid_at: new Date().toISOString(),
        status: "SUCCESS",
        transaction_reference: args.p_reference ?? null,
        recorded_by: userId,
        created_at: new Date().toISOString(),
      };
      const invoice = {
        ...invoiceRow,
        amount_paid: newPaid,
        amount_due: newDue,
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      return Promise.resolve({ data: { payment, invoice }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  };

  const db = {
    from,
    rpc,
    calls,
    insertedRows,
  } as unknown as SupabaseClient<Database> & {
    calls: [string, unknown[]][];
    insertedRows: Record<string, any[]>;
  };

  // Mock assertClinicMemberWithRoles
  vi.spyOn(db, "rpc");
  return db;
}

// -------------------------------------------------------------
// Test Suite
// -------------------------------------------------------------

describe("CAREFLOW AI — Doctor Consultation & e-Prescription Clinical Workflow", () => {
  it("Requirement 1: Initializes exactly one e-Prescription and prevents duplicates", async () => {
    // 1. First check-in: consultation and prescription are initialized
    const db1 = createClinicalDbMock({
      role: "STAFF",
      existingConsultation: false,
      existingPrescription: false,
    });

    const init1 = await getOrCreatePrescriptionForAppointment(
      db1,
      staffUserId,
      clinicId,
      appointmentId
    );

    expect(init1.consultation).toBeDefined();
    expect(init1.prescription).toBeDefined();
    expect(init1.consultation.status).toBe("DRAFT");
    expect(init1.prescription.status).toBe("ACTIVE");

    // 2. Second check-in or reload: returns the existing records without duplicate insertions
    const db2 = createClinicalDbMock({
      role: "STAFF",
      existingConsultation: true,
      existingPrescription: true,
    });

    const init2 = await getOrCreatePrescriptionForAppointment(
      db2,
      staffUserId,
      clinicId,
      appointmentId
    );

    expect(init2.consultation.id).toBe(consultationId);
    expect(init2.prescription.id).toBe(prescriptionId);
  });

  it("Requirement 2: Receptionist submits vitals which are stored and visible in context", async () => {
    const db = createClinicalDbMock({
      role: "STAFF",
      existingConsultation: true,
      existingPrescription: true,
      existingVitals: true,
    });

    const vitalsData = {
      systolic_bp: 120,
      diastolic_bp: 80,
      heart_rate: 72,
      temperature: 98.6,
      oxygen_saturation: 99,
      respiratory_rate: 16,
      height_cm: 175,
      weight_kg: 70,
      notes: "Patient is resting comfortably.",
    };

    const vitals = await recordAppointmentVitals(
      db,
      staffUserId,
      clinicId,
      appointmentId,
      vitalsData
    );

    expect(vitals).toBeDefined();
    expect(db.insertedRows["audit_logs"]).toBeDefined();
    expect(db.insertedRows["audit_logs"]![0]!.action).toBe("PATIENT_VITALS_RECORDED");

    // Verify vitals are returned in clinical context for the doctor
    const context = await getAppointmentClinicalContext(
      db,
      userId,
      clinicId,
      appointmentId
    );

    expect(context.vitals).toBeDefined();
    expect(context.vitals?.blood_pressure_systolic).toBe(120);
    expect(context.vitals?.blood_pressure_diastolic).toBe(80);
    expect(context.vitals?.heart_rate).toBe(72);
    expect(context.doctor.display_name).toBe("Dr. Sarah Smith");
  });

  it("Requirement 3: Doctor starts consultation using the same prescription", async () => {
    const db = createClinicalDbMock({
      role: "DOCTOR",
      existingConsultation: true,
      existingPrescription: true,
    });

    const started = await startDoctorConsultation(
      db,
      userId,
      clinicId,
      appointmentId
    );

    expect(started.consultation).toBeDefined();
    expect(started.prescription.id).toBe(prescriptionId);
    expect(
      db.insertedRows["audit_logs"]!.some((a: any) => a.action === "CONSULTATION_STARTED")
    ).toBe(true);
  });

  it("Requirement 4: Supports medication entry with 1-0-1 frequency, meal timing, duration and multiple items", () => {
    const validMedication = medicationItemSchema.parse({
      medicine_name: "Amoxicillin",
      dosage: "500mg",
      frequency: "1-0-1",
      meal_timing: "AFTER_MEAL",
      duration: "5 days",
      instructions: "Take with warm water",
    });

    expect(validMedication.medicine_name).toBe("Amoxicillin");
    expect(validMedication.frequency).toBe("1-0-1");
    expect(validMedication.meal_timing).toBe("AFTER_MEAL");
    expect(formatFrequencyLabel("1-0-1")).toBe("1-0-1 (Morning & Night)");
    expect(formatMealTimingLabel("AFTER_MEAL")).toBe("After Meal");

    // Rejects empty medicine name
    expect(() =>
      medicationItemSchema.parse({
        frequency: "1-0-1",
      })
    ).toThrow();
  });

  it("Requirement 5: Doctor completes consultation and finalizes prescription with billing generation", async () => {
    const db = createClinicalDbMock({
      role: "DOCTOR",
      existingConsultation: true,
      existingPrescription: true,
      hasWaitingPatient: true,
    });

    const completionPayload = {
      clinicId,
      appointmentId,
      assessment: "Acute Bronchitis",
      chief_complaint: "Productive cough and fever",
      clinical_notes: "Clear lungs, throat congestion.",
      follow_up_date: "2026-11-04",
      follow_up_notes: "Return if fever persists",
      medications: [
        {
          medicine_name: "Amoxicillin 500mg",
          dosage: "500 mg",
          frequency: "1-0-1",
          meal_timing: "AFTER_MEAL",
          duration: "5 days",
          instructions: "Take after meals",
          unit_price: 100,
        },
        {
          medicine_name: "Paracetamol 650mg",
          dosage: "650 mg",
          frequency: "SOS",
          meal_timing: "AFTER_MEAL",
          duration: "3 days",
          instructions: "For fever",
          unit_price: 100,
        },
      ],
      finalize: true,
    };

    const result = await saveOrCompleteDoctorConsultation(
      db,
      userId,
      clinicId,
      completionPayload
    );

    // 1. Prescription and Consultation are completed
    expect(result.consultation.status).toBe("COMPLETED");
    expect(result.prescription.status).toBe("COMPLETED");

    // 2. Invoice generated with consultation fee (₹500) + 2 medications (₹100 each = ₹700 total)
    expect(result.invoice).toBeDefined();
    expect(db.insertedRows["invoices"]).toBeDefined();
    const createdInvoice = db.insertedRows["invoices"]![0]!;
    expect(createdInvoice.total_amount).toBe(700);
    expect(createdInvoice.status).toBe("ISSUED");
    expect(createdInvoice.amount_due).toBe(700);

    // 3. Invoice items recorded
    expect(db.insertedRows["invoice_items"]).toBeDefined();
    expect(db.insertedRows["invoice_items"]!.length).toBe(3); // 1 fee + 2 meds

    // 4. Next waiting patient is called automatically
    expect(result.nextQueueEntry).toBeDefined();
    expect(result.nextQueueEntry?.queue_number).toBe(2);
  });

  it("Requirement 5 Validation: Fails to complete consultation if diagnosis is missing", async () => {
    const db = createClinicalDbMock({
      role: "DOCTOR",
      existingConsultation: true,
      existingPrescription: true,
    });

    await expect(
      saveOrCompleteDoctorConsultation(db, userId, clinicId, {
        clinicId,
        appointmentId,
        assessment: "", // Missing assessment
        finalize: true,
      })
    ).rejects.toThrow("Diagnosis/Assessment is required to complete the consultation.");
  });

  it("Requirement 6: Patient only accesses their own finalized prescriptions", async () => {
    const db = createClinicalDbMock({ role: "PATIENT" });

    const patientPrescriptions = await listPatientPrescriptions(
      db,
      patientId,
      clinicId
    );

    expect(patientPrescriptions).toBeDefined();
    expect(patientPrescriptions.length).toBeGreaterThan(0);
    expect(patientPrescriptions[0]!.consultation).toBeDefined();
    expect(patientPrescriptions[0]!.items.length).toBeGreaterThan(0);
  });

  it("Requirement 6: Clinic billing lists invoices and records patient payment", async () => {
    const db = createClinicalDbMock({
      role: "STAFF",
      existingInvoice: true,
    });

    const invoices = await listClinicInvoices(db, staffUserId, clinicId);
    expect(invoices.length).toBe(1);
    expect(invoices[0]!.total_amount).toBe(600);
    expect(invoices[0]!.amount_due).toBe(600);

    // Record full payment of ₹600 via UPI
    const paymentResult = await recordInvoicePayment(db, staffUserId, clinicId, {
      clinicId,
      invoiceId,
      amount: 600,
      payment_method: "UPI",
      transaction_reference: "UPI-TXN-12345",
    });

    expect(paymentResult.payment.amount).toBe(600);
    expect(paymentResult.payment.status).toBe("SUCCESS");
    expect(paymentResult.invoice.status).toBe("PAID");
    expect(paymentResult.invoice.amount_due).toBe(0);
    expect(paymentResult.invoice.amount_paid).toBe(600);
  });

  it("Requirement 6: Prevents payments exceeding the amount due", async () => {
    const db = createClinicalDbMock({
      role: "STAFF",
      existingInvoice: true,
    });

    await expect(
      recordInvoicePayment(db, staffUserId, clinicId, {
        clinicId,
        invoiceId,
        amount: 1000, // Due is only 600
        payment_method: "CASH",
      })
    ).rejects.toThrow("Payment cannot exceed the outstanding balance of ₹600.");
  });

  it("Requirement 7: Prevents duplicate bill creation on reopening consultation or billing", async () => {
    const db = createClinicalDbMock({
      role: "DOCTOR",
      existingConsultation: true,
      existingPrescription: true,
      existingInvoice: true, // Existing invoice already on record
    });

    const res = await saveOrCompleteDoctorConsultation(db, userId, clinicId, {
      clinicId,
      appointmentId,
      assessment: "Acute Bronchitis",
      finalize: true,
    });

    // Reuses the existing invoice and does not insert a new one
    expect(res.invoice?.id).toBe(invoiceId);
    expect(db.insertedRows["invoices"]).toBeUndefined();
  });

  describe("Security, Authorization & Immutability Audited Enforcements", () => {
    it("SEC-02: Prevents recording vitals for a completed appointment", async () => {
      const db = createClinicalDbMock({
        role: "STAFF",
        appointmentStatus: "COMPLETED",
      });

      await expect(
        recordAppointmentVitals(db, staffUserId, clinicId, appointmentId, {
          systolic_bp: 120,
          diastolic_bp: 80,
        })
      ).rejects.toThrow("Cannot record or edit vitals for a completed appointment.");
    });

    it("SEC-02: Prevents recording vitals for a completed consultation", async () => {
      const db = createClinicalDbMock({
        role: "STAFF",
        consultationStatus: "COMPLETED",
        existingConsultation: true,
      });

      await expect(
        recordAppointmentVitals(db, staffUserId, clinicId, appointmentId, {
          systolic_bp: 120,
          diastolic_bp: 80,
        })
      ).rejects.toThrow("Cannot record or edit vitals for a completed consultation.");
    });

    it("SEC-02: Prevents modifying an already completed consultation", async () => {
      const db = createClinicalDbMock({
        role: "DOCTOR",
        consultationStatus: "COMPLETED",
        existingConsultation: true,
      });

      await expect(
        saveOrCompleteDoctorConsultation(db, userId, clinicId, {
          clinicId,
          appointmentId,
          assessment: "Modified Diagnosis",
          finalize: false,
        })
      ).rejects.toThrow("Cannot modify a completed consultation. Clinical records are finalized upon completion.");
    });

    it("SEC-02: Prevents restarting an already completed consultation", async () => {
      const db = createClinicalDbMock({
        role: "DOCTOR",
        consultationStatus: "COMPLETED",
        existingConsultation: true,
      });

      await expect(
        startDoctorConsultation(db, userId, clinicId, appointmentId)
      ).rejects.toThrow("Cannot restart a completed consultation.");
    });

    it("SEC-03: Rejects doctor accessing clinical context assigned to another doctor", async () => {
      const otherDoctorId = "99999999-0000-4000-8000-000000000000";
      const db = createClinicalDbMock({
        role: "DOCTOR",
        appointmentDoctorProfileId: otherDoctorId,
      });

      await expect(
        getAppointmentClinicalContext(db, userId, clinicId, appointmentId)
      ).rejects.toThrow("Unauthorized: Doctor can only access clinical context for their own assigned appointments.");
    });

    it("SEC-03: Rejects doctor starting consultation assigned to another doctor", async () => {
      const otherDoctorId = "99999999-0000-4000-8000-000000000000";
      const db = createClinicalDbMock({
        role: "DOCTOR",
        appointmentDoctorProfileId: otherDoctorId,
      });

      await expect(
        startDoctorConsultation(db, userId, clinicId, appointmentId)
      ).rejects.toThrow("Unauthorized: Doctor can only start consultations assigned to their own profile.");
    });

    it("SEC-03: Rejects doctor modifying consultation assigned to another doctor", async () => {
      const otherDoctorId = "99999999-0000-4000-8000-000000000000";
      const db = createClinicalDbMock({
        role: "DOCTOR",
        appointmentDoctorProfileId: otherDoctorId,
      });

      await expect(
        saveOrCompleteDoctorConsultation(db, userId, clinicId, {
          clinicId,
          appointmentId,
          assessment: "Bronchitis",
          finalize: false,
        })
      ).rejects.toThrow("Unauthorized: Doctor can only modify consultations assigned to their own profile.");
    });

    it("SEC-03: Restricts doctor prescription list strictly to the caller's doctor profile", async () => {
      const db = createClinicalDbMock({
        role: "DOCTOR",
      });

      // Doctor supplies a different doctor profile ID in the filter
      const otherDoctorId = "99999999-0000-4000-8000-000000000000";
      await listDoctorPrescriptions(db, userId, clinicId, otherDoctorId);

      // Verify that the query enforced doctor's own doctorId instead of otherDoctorId
      const eqCalls = db.calls.filter((c) => c[0] === "prescriptions.eq" && (c[1] as any)[0] === "doctor_profile_id");
      expect(eqCalls.length).toBeGreaterThan(0);
      expect((eqCalls[0]![1] as any)[1]).toBe(doctorId);
    });

    it("SEC-03: Clinic Owner retains access to clinical records across all doctors", async () => {
      const otherDoctorId = "99999999-0000-4000-8000-000000000000";
      const db = createClinicalDbMock({
        role: "OWNER",
        appointmentDoctorProfileId: otherDoctorId,
      });

      // Owner can view context without error
      const ctx = await getAppointmentClinicalContext(db, userId, clinicId, appointmentId);
      expect(ctx.appointment.id).toBe(appointmentId);
    });

    it("SEC-04: Prevents lost updates on concurrent invoice payments via OCC check", async () => {
      const db = createClinicalDbMock({
        role: "STAFF",
        existingInvoice: true,
        concurrencyConflict: true, // Simulates another transaction updating the invoice concurrently
      });

      await expect(
        recordInvoicePayment(db, staffUserId, clinicId, {
          clinicId,
          invoiceId,
          amount: 300,
          payment_method: "CASH",
        })
      ).rejects.toThrow("Invoice was modified concurrently by another transaction. Please refresh and retry.");
    });

    it("SEC-04: Executes atomic payment recording via record_invoice_payment RPC", async () => {
      const db = createClinicalDbMock({
        role: "STAFF",
        existingInvoice: true,
      });

      const res = await recordInvoicePayment(db, staffUserId, clinicId, {
        clinicId,
        invoiceId,
        amount: 300,
        payment_method: "UPI",
        transaction_reference: "UPI-TXN-ATOMIC-1",
      });

      expect(res.payment.amount).toBe(300);
      expect(res.payment.status).toBe("SUCCESS");
      expect(res.invoice.amount_paid).toBe(300);
      expect(res.invoice.amount_due).toBe(300);
      expect(res.invoice.status).toBe("PARTIALLY_PAID");

      // Verify RPC was called with correct parameters
      const rpcCalls = db.calls.filter((c) => c[0] === "rpc.record_invoice_payment");
      expect(rpcCalls.length).toBe(1);
      expect((rpcCalls[0]![1] as any)[0].p_amount).toBe(300);
      expect((rpcCalls[0]![1] as any)[0].p_reference).toBe("UPI-TXN-ATOMIC-1");

      // Verify NO direct REST payments.insert occurred
      const directPaymentInserts = db.calls.filter((c) => c[0] === "payments.insert");
      expect(directPaymentInserts.length).toBe(0);
    });

    it("SEC-04: RPC failure fails closed without triggering separate REST writes", async () => {
      const db = createClinicalDbMock({
        role: "STAFF",
        existingInvoice: true,
        rpcError: { message: "Database connection failed or function unavailable", code: "PGRST202" },
      });

      await expect(
        recordInvoicePayment(db, staffUserId, clinicId, {
          clinicId,
          invoiceId,
          amount: 300,
          payment_method: "UPI",
        })
      ).rejects.toThrow("Database connection failed or function unavailable");

      // Assert that no fallback REST calls were made
      const directPaymentInserts = db.calls.filter((c) => c[0] === "payments.insert");
      const directInvoiceUpdates = db.calls.filter((c) => c[0] === "invoices.update");
      expect(directPaymentInserts.length).toBe(0);
      expect(directInvoiceUpdates.length).toBe(0);
    });

    it("SEC-04: Idempotency returns existing payment when same transaction reference is re-submitted", async () => {
      const db = createClinicalDbMock({
        role: "STAFF",
        existingInvoice: true,
        existingPaymentReference: "UPI-TXN-DUP-TEST",
      });

      const p1 = await recordInvoicePayment(db, staffUserId, clinicId, {
        clinicId,
        invoiceId,
        amount: 300,
        payment_method: "UPI",
        transaction_reference: "UPI-TXN-DUP-TEST",
      });

      expect(p1.payment.status).toBe("SUCCESS");
      expect(p1.payment.transaction_reference).toBe("UPI-TXN-DUP-TEST");
    });

    it("SEC-04: Rejects invalid or excessive payment amounts", async () => {
      const db = createClinicalDbMock({
        role: "STAFF",
        existingInvoice: true,
      });

      // 1. Amount exceeds balance
      await expect(
        recordInvoicePayment(db, staffUserId, clinicId, {
          clinicId,
          invoiceId,
          amount: 800,
          payment_method: "CASH",
        })
      ).rejects.toThrow("Payment cannot exceed the outstanding balance of ₹600.");

      // 2. Amount <= 0 rejected by schema validation
      await expect(
        recordInvoicePayment(db, staffUserId, clinicId, {
          clinicId,
          invoiceId,
          amount: -50,
          payment_method: "CASH",
        })
      ).rejects.toThrow("Payment amount must be greater than 0");
    });

    it("SEC-04: Rejects payment on already finalized (PAID) or CANCELLED invoice", async () => {
      const db = createClinicalDbMock({
        role: "STAFF",
        existingInvoice: true,
        invoiceStatus: "PAID",
      });

      await expect(
        recordInvoicePayment(db, staffUserId, clinicId, {
          clinicId,
          invoiceId,
          amount: 200,
          payment_method: "CASH",
        })
      ).rejects.toThrow("Invoice has already been finalized or cancelled.");
    });

    it("SEC-04: Rejects payment by unauthorized role (PATIENT)", async () => {
      const db = createClinicalDbMock({
        role: "PATIENT",
        existingInvoice: true,
      });

      await expect(
        recordInvoicePayment(db, userId, clinicId, {
          clinicId,
          invoiceId,
          amount: 200,
          payment_method: "CASH",
        })
      ).rejects.toThrow("Access is unavailable for this clinic.");
    });

    // =========================================================================
    // SEC-02: Clinical Immutability Tests
    // =========================================================================

    it("SEC-02: Rejects modifying a consultation that is already COMPLETED", async () => {
      const db = createClinicalDbMock({
        role: "DOCTOR",
        existingConsultation: true,
        consultationStatus: "COMPLETED",
      });

      await expect(
        saveOrCompleteDoctorConsultation(db, userId, clinicId, {
          clinicId,
          appointmentId,
          assessment: "Updated Assessment Post Completion",
          finalize: false,
        })
      ).rejects.toThrow("Cannot modify a completed consultation. Clinical records are finalized upon completion.");
    });

    it("SEC-02: Rejects restarting a consultation that is already COMPLETED", async () => {
      const db = createClinicalDbMock({
        role: "DOCTOR",
        existingConsultation: true,
        consultationStatus: "COMPLETED",
      });

      await expect(
        startDoctorConsultation(db, userId, clinicId, appointmentId)
      ).rejects.toThrow("Cannot restart a completed consultation.");
    });

    it("SEC-02: Rejects modifying or completing e-prescription when prescription is already COMPLETED", async () => {
      const db = createClinicalDbMock({
        role: "DOCTOR",
        existingConsultation: true,
        consultationStatus: "IN_PROGRESS",
        existingPrescription: true,
        prescriptionStatus: "COMPLETED",
      });

      await expect(
        saveOrCompleteDoctorConsultation(db, userId, clinicId, {
          clinicId,
          appointmentId,
          assessment: "Bronchitis",
          finalize: false,
        })
      ).rejects.toThrow("Cannot modify a finalized e-prescription.");
    });

    it("SEC-02: Rejects recording or editing vitals when consultation is already COMPLETED", async () => {
      const db = createClinicalDbMock({
        role: "STAFF",
        existingConsultation: true,
        consultationStatus: "COMPLETED",
      });

      await expect(
        recordAppointmentVitals(db, staffUserId, clinicId, appointmentId, {
          temperature: 99.1,
          heart_rate: 80,
        })
      ).rejects.toThrow("Cannot record or edit vitals for a completed consultation.");
    });

    it("SEC-02: Rejects recording or editing vitals when appointment is already COMPLETED", async () => {
      const db = createClinicalDbMock({
        role: "STAFF",
        appointmentStatus: "COMPLETED",
      });

      await expect(
        recordAppointmentVitals(db, staffUserId, clinicId, appointmentId, {
          temperature: 98.6,
        })
      ).rejects.toThrow("Cannot record or edit vitals for a completed appointment.");
    });

    it("SEC-02: Permits valid pre-completion triage vitals entry when appointment is CHECKED_IN", async () => {
      const db = createClinicalDbMock({
        role: "STAFF",
        appointmentStatus: "CHECKED_IN",
        existingConsultation: false,
      });

      const vitals = await recordAppointmentVitals(db, staffUserId, clinicId, appointmentId, {
        temperature: 98.6,
        heart_rate: 75,
        blood_pressure_systolic: 120,
        blood_pressure_diastolic: 80,
      });

      expect(vitals).toBeDefined();
      expect(vitals.id).toBeDefined();
    });

    it("SEC-02: Permits valid doctor consultation in-progress edits and final status transition to COMPLETED", async () => {
      const db = createClinicalDbMock({
        role: "DOCTOR",
        existingConsultation: true,
        consultationStatus: "IN_PROGRESS",
        existingPrescription: true,
        prescriptionStatus: "ACTIVE",
      });

      const res = await saveOrCompleteDoctorConsultation(db, userId, clinicId, {
        clinicId,
        appointmentId,
        assessment: "Acute Bronchitis Finalized",
        finalize: true,
      });

      expect(res.consultation).toBeDefined();
      expect(res.prescription).toBeDefined();
    });

    it("SEC-06: Unauthenticated or unauthorized role is rejected before clinical operations", async () => {
      const db = createClinicalDbMock({
        role: "PATIENT", // Patients cannot access doctor consultation workspace
      });

      await expect(
        getAppointmentClinicalContext(db, userId, clinicId, appointmentId)
      ).rejects.toThrow("Access is unavailable for this clinic.");
    });
  });
});
