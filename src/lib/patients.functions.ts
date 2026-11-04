import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { patientFiltersSchema, patientFieldsSchema, registrationSchema } from "./patients";

const clinic = z.object({ clinicId: z.string().uuid() });
const identity = clinic.extend({ patientId: z.string().uuid() });

export const listClinicPatients = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(i => clinic.extend({ filters: patientFiltersSchema }).strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./patients.server");
    await s.assertPatientOwner(context.supabase, context.userId, data.clinicId);
    return s.readPatients(context.supabase, data.clinicId, data.filters);
  });

export const getClinicPatient = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(i => identity.strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./patients.server");
    await s.assertPatientOwner(context.supabase, context.userId, data.clinicId);
    return s.readPatient(context.supabase, data.clinicId, data.patientId);
  });

export const registerClinicPatient = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(i => clinic.extend({ fields: z.unknown().refine(v => registrationSchema.safeParse(v).success, "Invalid patient registration.") }).strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./patients.server");
    await s.assertPatientOwner(context.supabase, context.userId, data.clinicId);
    return s.insertPatient(context.supabase, data.clinicId, data.fields);
  });

export const updateClinicPatient = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(i => identity.extend({ updatedAt: z.string().datetime({ offset: true }), fields: z.unknown().refine(v => patientFieldsSchema.safeParse(v).success, "Invalid patient changes.") }).strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./patients.server");
    await s.assertPatientOwner(context.supabase, context.userId, data.clinicId);
    return s.editPatient(context.supabase, data.clinicId, data.patientId, data.updatedAt, data.fields);
  });

export const listDoctorPatients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => clinic.extend({ filters: patientFiltersSchema }).strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./patients.server");
    const doc = await s.assertDoctorPatientAccess(context.supabase, context.userId, data.clinicId);
    return s.readDoctorPatients(context.supabase, data.clinicId, doc.id, data.filters);
  });

export const getDoctorPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => identity.strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./patients.server");
    const doc = await s.assertDoctorPatientAccess(context.supabase, context.userId, data.clinicId);
    return s.readDoctorPatient(context.supabase, data.clinicId, doc.id, data.patientId);
  });

export const listStaffPatients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => clinic.extend({ filters: patientFiltersSchema }).strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./patients.server");
    await s.assertPatientStaff(context.supabase, context.userId, data.clinicId);
    return s.readPatients(context.supabase, data.clinicId, data.filters);
  });

export const getStaffPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => identity.strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./patients.server");
    await s.assertPatientStaff(context.supabase, context.userId, data.clinicId);
    return s.readPatient(context.supabase, data.clinicId, data.patientId);
  });

export const registerStaffPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => clinic.extend({ fields: z.unknown().refine(v => registrationSchema.safeParse(v).success, "Invalid patient registration.") }).strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./patients.server");
    await s.assertPatientStaff(context.supabase, context.userId, data.clinicId);
    return s.insertPatient(context.supabase, data.clinicId, data.fields);
  });

export const updateStaffPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => identity.extend({ updatedAt: z.string().datetime({ offset: true }), fields: z.unknown().refine(v => patientFieldsSchema.safeParse(v).success, "Invalid patient changes.") }).strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./patients.server");
    await s.assertPatientStaff(context.supabase, context.userId, data.clinicId);
    return s.editPatient(context.supabase, data.clinicId, data.patientId, data.updatedAt, data.fields);
  });
