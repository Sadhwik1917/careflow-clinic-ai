import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type ConsultationRow = Database["public"]["Tables"]["consultations"]["Row"];
export type PrescriptionRow = Database["public"]["Tables"]["prescriptions"]["Row"];
export type PrescriptionItemRow = Database["public"]["Tables"]["prescription_items"]["Row"];
export type VitalsRow = Database["public"]["Tables"]["vitals"]["Row"];
export type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
export type InvoiceItemRow = Database["public"]["Tables"]["invoice_items"]["Row"];
export type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

export type ConsultationStatus = Database["public"]["Enums"]["consultation_status"];
export type PrescriptionStatus = Database["public"]["Enums"]["prescription_status"];
export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];

// -------------------------------------------------------------
// Vitals Schemas & Types
// -------------------------------------------------------------

export const vitalsInputSchema = z.object({
  systolic_bp: z.coerce.number().min(40).max(300).nullable().optional(),
  diastolic_bp: z.coerce.number().min(20).max(200).nullable().optional(),
  blood_pressure_systolic: z.coerce.number().min(40).max(300).nullable().optional(),
  blood_pressure_diastolic: z.coerce.number().min(20).max(200).nullable().optional(),
  heart_rate: z.coerce.number().min(20).max(250).nullable().optional(),
  temperature: z.coerce.number().min(70).max(120).nullable().optional(), // °F
  respiratory_rate: z.coerce.number().min(5).max(60).nullable().optional(),
  oxygen_saturation: z.coerce.number().min(50).max(100).nullable().optional(), // %
  height_cm: z.coerce.number().min(20).max(300).nullable().optional(), // cm
  weight_kg: z.coerce.number().min(1).max(500).nullable().optional(), // kg
  height: z.coerce.number().min(20).max(300).nullable().optional(),
  weight: z.coerce.number().min(1).max(500).nullable().optional(),
  notes: z.string().max(500).optional().nullable(),
});

export type VitalsInput = z.infer<typeof vitalsInputSchema>;

export interface VitalsWithAliases extends VitalsRow {
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  notes?: string | null;
}

// -------------------------------------------------------------
// Medication & Prescription Schemas & Types
// -------------------------------------------------------------

export const FREQUENCY_PRESETS = [
  { value: "1-0-1", label: "1-0-1 (Morning & Night)" },
  { value: "1-0-0", label: "1-0-0 (Morning only)" },
  { value: "0-1-0", label: "0-1-0 (Afternoon only)" },
  { value: "0-0-1", label: "0-0-1 (Night only)" },
  { value: "1-1-1", label: "1-1-1 (Thrice daily)" },
  { value: "1-1-0", label: "1-1-0 (Morning & Afternoon)" },
  { value: "0-1-1", label: "0-1-1 (Afternoon & Night)" },
  { value: "Once daily", label: "Once daily" },
  { value: "Twice daily", label: "Twice daily" },
  { value: "SOS", label: "SOS / As needed" },
] as const;

export const MEAL_TIMING_OPTIONS = [
  { value: "AFTER_MEAL", label: "After Meal" },
  { value: "BEFORE_MEAL", label: "Before Meal" },
  { value: "WITH_MEAL", label: "With Meal" },
  { value: "EMPTY_STOMACH", label: "Empty Stomach" },
] as const;

export const medicationItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().max(150).optional(),
  medicine_name: z.string().trim().max(150).optional(),
  dosage: z.string().trim().max(100).optional().nullable(),
  frequency: z.string().trim().min(1, "Frequency is required").max(50),
  duration: z.string().trim().max(50).optional().nullable(),
  meal_timing: z.string().optional().nullable(),
  instructions: z.string().trim().max(300).optional().nullable(),
  quantity: z.coerce.number().positive("Quantity must be greater than 0").optional().nullable(),
  unit_price: z.coerce.number().min(0, "Unit price cannot be negative").optional().nullable(),
  discount: z.coerce.number().min(0, "Discount cannot be negative").optional().nullable(),
}).refine((data) => Boolean(data.name || data.medicine_name), {
  message: "Medicine name is required",
});

export type MedicationItem = z.infer<typeof medicationItemSchema>;

export interface PrescriptionWithDetails extends PrescriptionRow {
  items: PrescriptionItemRow[];
  doctor?: {
    id: string;
    specialization: string;
    department: string | null;
    display_name?: string | null;
  } | null;
  patient?: {
    id: string;
    patient_number: string;
    first_name: string;
    last_name: string | null;
    date_of_birth: string | null;
    gender: string | null;
    phone: string | null;
  } | null;
  consultation?: (ConsultationRow & {
    vitals?: VitalsWithAliases | null;
  }) | null;
  vitals?: VitalsWithAliases | null;
}

// -------------------------------------------------------------
// Consultation Save / Complete Schemas & Types
// -------------------------------------------------------------

export const saveConsultationSchema = z.object({
  clinicId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  chief_complaint: z.string().trim().max(500).optional().nullable(),
  assessment: z.string().trim().max(1000).optional().nullable(),
  clinical_notes: z.string().trim().max(2000).optional().nullable(),
  follow_up_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  follow_up_notes: z.string().trim().max(500).optional().nullable(),
  prescription_instructions: z.string().trim().max(1000).optional().nullable(),
  medications: z.array(medicationItemSchema).default([]),
  finalize: z.boolean().default(false),
  isComplete: z.boolean().optional(),
});

export type SaveConsultationInput = z.infer<typeof saveConsultationSchema>;

export interface AppointmentClinicalContext {
  appointment: {
    id: string;
    clinic_id: string;
    patient_id: string;
    doctor_profile_id: string;
    status: string;
    scheduled_start: string;
    scheduled_end: string;
    reason: string | null;
    notes: string | null;
  };
  patient: {
    id: string;
    patient_number: string;
    first_name: string;
    last_name: string | null;
    date_of_birth: string | null;
    gender: string | null;
    phone: string | null;
    allergies?: string | null;
    notes?: string | null;
  };
  doctor: {
    id: string;
    specialization: string;
    department: string | null;
    display_name: string;
  };
  consultation: ConsultationRow;
  prescription: PrescriptionRow;
  medications: PrescriptionItemRow[];
  vitals: VitalsWithAliases | null;
  invoice: InvoiceRow | null;
}

// -------------------------------------------------------------
// Billing & Invoices Schemas & Types
// -------------------------------------------------------------

export const updateInvoiceItemInputSchema = z.object({
  id: z.string().optional(),
  description: z.string().trim().min(1, "Description is required").max(200),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  unit_price: z.coerce.number().min(0, "Unit price cannot be negative"),
  discount: z.coerce.number().min(0, "Discount cannot be negative").default(0),
});

export type UpdateInvoiceItemInput = z.infer<typeof updateInvoiceItemInputSchema>;

export const updateInvoiceBillingSchema = z.object({
  clinicId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  items: z.array(updateInvoiceItemInputSchema).min(1, "Invoice must contain at least one item"),
  discountType: z.enum(["FIXED", "PERCENTAGE"]).default("FIXED"),
  discountValue: z.coerce.number().min(0, "Discount cannot be negative").default(0),
  finalize: z.boolean().default(false),
  notes: z.string().trim().max(500).optional().nullable(),
});

export type UpdateInvoiceBillingInput = z.infer<typeof updateInvoiceBillingSchema>;

export const createDirectInvoiceSchema = z.object({
  clinicId: z.string().uuid(),
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional().nullable(),
  items: z.array(updateInvoiceItemInputSchema).min(1, "Invoice must contain at least one item"),
  discountType: z.enum(["FIXED", "PERCENTAGE"]).default("FIXED"),
  discountValue: z.coerce.number().min(0, "Discount cannot be negative").default(0),
  finalize: z.boolean().default(false),
  notes: z.string().trim().max(500).optional().nullable(),
});

export type CreateDirectInvoiceInput = z.infer<typeof createDirectInvoiceSchema>;

export const recordPaymentSchema = z.object({
  clinicId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  amount: z.coerce.number().positive("Payment amount must be greater than 0"),
  payment_method: z.enum(["CASH", "CARD", "UPI", "BANK_TRANSFER", "ONLINE", "OTHER"]),
  transaction_reference: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export * from "./billing-calculations";

export interface InvoiceWithDetails extends InvoiceRow {
  items: InvoiceItemRow[];
  payments: PaymentRow[];
  patient?: {
    id: string;
    patient_number: string;
    first_name: string;
    last_name: string | null;
    phone: string | null;
  } | null;
  appointment?: {
    id: string;
    scheduled_start: string;
    scheduled_end: string;
    appointment_type: string;
  } | null;
}

export interface PatientAppointmentWithDetails {
  id: string;
  clinic_id: string;
  patient_id: string;
  doctor_profile_id: string | null;
  scheduled_start: string;
  scheduled_end: string;
  appointment_type: string;
  status: string;
  reason: string | null;
  notes: string | null;
  created_at: string;
  clinic?: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
  } | null;
  doctor?: {
    id: string;
    specialization: string;
    department: string | null;
    display_name?: string | null;
  } | null;
}

export interface PatientProfileSummary {
  profile: {
    id: string;
    display_name: string | null;
    phone: string | null;
    status: string;
  };
  patientRecords: Array<{
    id: string;
    clinic_id: string;
    patient_number: string;
    first_name: string;
    last_name: string | null;
    date_of_birth: string | null;
    gender: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    clinic?: {
      id: string;
      name: string;
    } | null;
  }>;
}

// -------------------------------------------------------------
// Formatting Helpers
// -------------------------------------------------------------

export function formatFrequencyLabel(freq: string | null | undefined): string {
  if (!freq) return "As directed";
  const preset = FREQUENCY_PRESETS.find((p) => p.value === freq);
  return preset ? preset.label : freq;
}

export function formatMealTimingLabel(timing: string | null | undefined): string {
  if (!timing) return "";
  switch (timing) {
    case "AFTER_MEAL":
    case "After Meal":
      return "After Meal";
    case "BEFORE_MEAL":
    case "Before Meal":
      return "Before Meal";
    case "WITH_MEAL":
    case "With Meal":
      return "With Meal";
    case "EMPTY_STOMACH":
    case "Empty Stomach":
      return "Empty Stomach";
    default:
      return timing;
  }
}
