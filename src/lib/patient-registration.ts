import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).transform(v => v || null);

const phone = z
  .string()
  .trim()
  .max(25)
  .transform(v => v.replace(/[\s().-]/g, ""))
  .refine(v => !v || /^\+?[0-9]{7,15}$/.test(v), "Enter a valid phone number (7–15 digits).")
  .transform(v => v || null);

const dob = z
  .string()
  .refine(v => {
    if (!v) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return (
      Number.isFinite(d.getTime()) &&
      d.toISOString().slice(0, 10) === v &&
      v <= new Date().toISOString().slice(0, 10)
    );
  }, "Enter a valid date of birth that is not in the future.")
  .transform(v => v || null);

export const selfRegistrationSchema = z
  .object({
    clinicId: z.string().uuid("Invalid clinic identifier."),
    first_name: z.string().trim().min(1, "First name is required.").max(100, "First name cannot exceed 100 characters."),
    last_name: optionalText(100),
    email: z
      .string()
      .trim()
      .min(1, "Email address is required for portal activation.")
      .email("Enter a valid email address.")
      .max(255)
      .transform(v => v.toLowerCase()),
    phone: phone,
    date_of_birth: dob,
    gender: optionalText(40),
    address: optionalText(1000),
    emergency_contact_name: optionalText(100),
    emergency_contact_phone: phone,
    notes: optionalText(5000),
    consent: z.boolean().refine(v => v === true, "You must consent to register as a patient."),
  })
  .strict();

export type SelfRegistrationInput = z.infer<typeof selfRegistrationSchema>;

export const resendActivationSchema = z
  .object({
    clinicId: z.string().uuid("Invalid clinic identifier."),
    email: z
      .string()
      .trim()
      .min(1, "Email address is required.")
      .email("Enter a valid email address.")
      .max(255)
      .transform(v => v.toLowerCase()),
  })
  .strict();

export type ResendActivationInput = z.infer<typeof resendActivationSchema>;

export interface PublicClinicInfo {
  clinicId: string;
  name: string;
  displayName: string;
  address: string | null;
  city: string | null;
  phone: string | null;
}

export type RegistrationResult =
  | {
      status: "CREATED_INVITED";
      patientNumber: string;
      email: string;
      message: string;
    }
  | {
      status: "CREATED_EXISTING_USER";
      patientNumber: string;
      email: string;
      message: string;
    }
  | {
      status: "CREATED_INVITE_PENDING";
      patientNumber: string;
      email: string;
      message: string;
    }
  | {
      status: "EXISTS_LINKED";
      email: string;
      message: string;
    }
  | {
      status: "EXISTS_PENDING";
      email: string;
      message: string;
    };

