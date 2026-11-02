import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  vitalsInputSchema,
  saveConsultationSchema,
  recordPaymentSchema,
  updateInvoiceBillingSchema,
  createDirectInvoiceSchema,
} from "./clinical";

const clinicIdSchema = z.object({ clinicId: z.string().uuid() });

// -------------------------------------------------------------
// Vitals & Clinical Context
// -------------------------------------------------------------

export const recordAppointmentVitalsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        appointmentId: z.string().uuid(),
        vitals: vitalsInputSchema,
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./clinical.server");
    return s.recordAppointmentVitals(
      context.supabase,
      context.userId,
      data.clinicId,
      data.appointmentId,
      data.vitals
    );
  });

export const getAppointmentClinicalContextFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        appointmentId: z.string().uuid(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./clinical.server");
    return s.getAppointmentClinicalContext(
      context.supabase,
      context.userId,
      data.clinicId,
      data.appointmentId
    );
  });

// -------------------------------------------------------------
// Doctor Consultation & e-Prescription
// -------------------------------------------------------------

export const startDoctorConsultationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        appointmentId: z.string().uuid(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./clinical.server");
    return s.startDoctorConsultation(
      context.supabase,
      context.userId,
      data.clinicId,
      data.appointmentId
    );
  });

export const saveOrCompleteConsultationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => saveConsultationSchema.parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./clinical.server");
    return s.saveOrCompleteDoctorConsultation(
      context.supabase,
      context.userId,
      data.clinicId,
      data
    );
  });

export const listDoctorPrescriptionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        doctorProfileId: z.string().uuid().optional(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./clinical.server");
    return s.listDoctorPrescriptions(
      context.supabase,
      context.userId,
      data.clinicId,
      data.doctorProfileId
    );
  });

export const listPatientPrescriptionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        clinicId: z.string().uuid().optional(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./clinical.server");
    return s.listPatientPrescriptions(
      context.supabase,
      context.userId,
      data.clinicId
    );
  });

// -------------------------------------------------------------
// Billing & Invoices
// -------------------------------------------------------------

export const listClinicInvoicesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        statusFilter: z.string().optional(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./clinical.server");
    return s.listClinicInvoices(
      context.supabase,
      context.userId,
      data.clinicId,
      data.statusFilter
    );
  });

export const recordInvoicePaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => recordPaymentSchema.parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./clinical.server");
    return s.recordInvoicePayment(
      context.supabase,
      context.userId,
      data.clinicId,
      data
    );
  });

export const updateInvoiceBillingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => updateInvoiceBillingSchema.parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./clinical.server");
    return s.updateInvoiceBilling(
      context.supabase,
      context.userId,
      data.clinicId,
      data
    );
  });

export const createDirectInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => createDirectInvoiceSchema.parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./clinical.server");
    return s.createDirectInvoice(
      context.supabase,
      context.userId,
      data.clinicId,
      data
    );
  });

// -------------------------------------------------------------
// Patient Portal Server Functions
// -------------------------------------------------------------

export const listPatientAppointmentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        clinicId: z.string().uuid().optional(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./clinical.server");
    return s.listPatientAppointments(
      context.supabase,
      context.userId,
      data.clinicId
    );
  });

export const getPatientProfileSummaryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await import("./clinical.server");
    return s.getPatientProfileSummary(
      context.supabase,
      context.userId
    );
  });

export const listPatientInvoicesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        clinicId: z.string().uuid().optional(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./clinical.server");
    return s.listPatientInvoices(
      context.supabase,
      context.userId,
      data.clinicId
    );
  });

export const listPatientPaymentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        clinicId: z.string().uuid().optional(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./clinical.server");
    return s.listPatientPayments(
      context.supabase,
      context.userId,
      data.clinicId
    );
  });
