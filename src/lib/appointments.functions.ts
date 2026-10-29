import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  appointmentFiltersSchema,
  clinicDateOpenStatusSchema,
  clinicWorkingHoursSchema,
  consultPatientSchema,
  createAppointmentSchema,
  doctorDailyAvailabilitySchema,
  doctorLeaveRequestSchema,
  doctorLeaveReviewSchema,
} from "./appointments";
import { doctorFiltersSchema } from "./team";

const clinicIdSchema = z.object({ clinicId: z.string().uuid() });

export const listClinicAppointments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema.extend({ filters: appointmentFiltersSchema }).strict().parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    await s.assertClinicMemberWithRoles(context.supabase, context.userId, data.clinicId, [
      "OWNER",
      "STAFF",
      "DOCTOR",
    ]);
    return s.readAppointments(context.supabase, data.clinicId, data.filters);
  });

export const getClinicAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema.extend({ appointmentId: z.string().uuid() }).strict().parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    await s.assertClinicMemberWithRoles(context.supabase, context.userId, data.clinicId, [
      "OWNER",
      "STAFF",
      "DOCTOR",
    ]);
    return s.readAppointment(context.supabase, data.clinicId, data.appointmentId);
  });

export const getDoctorAvailabilitySlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        doctorProfileId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        requestedSlotStart: z.string().datetime({ offset: true }).optional(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    await s.assertClinicMemberWithRoles(context.supabase, context.userId, data.clinicId, [
      "OWNER",
      "STAFF",
      "DOCTOR",
    ]);
    return s.readDoctorAvailability(
      context.supabase,
      data.clinicId,
      data.doctorProfileId,
      data.date,
      data.requestedSlotStart
    );
  });

export const createClinicAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({ appointment: createAppointmentSchema.omit({ clinic_id: true }) })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    await s.assertClinicMemberWithRoles(context.supabase, context.userId, data.clinicId, [
      "OWNER",
      "STAFF",
    ]);
    return s.createAppointment(context.supabase, context.userId, data.clinicId, {
      ...data.appointment,
      clinic_id: data.clinicId,
    });
  });

export const rescheduleClinicAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        appointmentId: z.string().uuid(),
        scheduledStart: z.string().datetime({ offset: true }),
        scheduledEnd: z.string().datetime({ offset: true }),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    await s.assertClinicMemberWithRoles(context.supabase, context.userId, data.clinicId, [
      "OWNER",
      "STAFF",
    ]);
    return s.rescheduleAppointment(
      context.supabase,
      context.userId,
      data.clinicId,
      data.appointmentId,
      data.scheduledStart,
      data.scheduledEnd
    );
  });

export const cancelClinicAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        appointmentId: z.string().uuid(),
        reason: z.string().trim().max(500).optional().nullable(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    await s.assertClinicMemberWithRoles(context.supabase, context.userId, data.clinicId, [
      "OWNER",
      "STAFF",
    ]);
    return s.cancelAppointment(
      context.supabase,
      context.userId,
      data.clinicId,
      data.appointmentId,
      data.reason
    );
  });

export const checkInClinicPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema.extend({ appointmentId: z.string().uuid() }).strict().parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    await s.assertClinicMemberWithRoles(context.supabase, context.userId, data.clinicId, [
      "OWNER",
      "STAFF",
    ]);
    return s.checkInPatient(context.supabase, context.userId, data.clinicId, data.appointmentId);
  });

export const listClinicQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        doctorProfileId: z.string().uuid().optional(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    const { role } = await s.assertClinicMemberWithRoles(
      context.supabase,
      context.userId,
      data.clinicId,
      ["OWNER", "STAFF", "DOCTOR"]
    );

    let docId = data.doctorProfileId;
    if (role === "DOCTOR") {
      const doc = await s.getCallerDoctorProfile(context.supabase, context.userId, data.clinicId);
      if (!doc) throw new Error("Doctor profile not found.");
      docId = doc.id;
    }

    return s.readQueueEntries(context.supabase, data.clinicId, data.date, docId);
  });

export const transitionClinicQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        queueEntryId: z.string().uuid(),
        newStatus: z.enum([
          "WAITING",
          "CALLED",
          "IN_CONSULTATION",
          "COMPLETED",
          "SKIPPED",
          "CANCELLED",
        ]),
        clinicalNotes: z.string().max(5000).optional().nullable(),
        assessment: z.string().max(2000).optional().nullable(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    await s.assertClinicMemberWithRoles(context.supabase, context.userId, data.clinicId, [
      "OWNER",
      "STAFF",
      "DOCTOR",
    ]);

    return s.transitionQueueEntry(
      context.supabase,
      context.userId,
      data.clinicId,
      data.queueEntryId,
      data.newStatus,
      {
        clinical_notes: data.clinicalNotes,
        assessment: data.assessment,
      }
    );
  });

export const callNextClinicPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        doctorProfileId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    const { role } = await s.assertClinicMemberWithRoles(
      context.supabase,
      context.userId,
      data.clinicId,
      ["OWNER", "STAFF", "DOCTOR"]
    );

    let docId = data.doctorProfileId;
    if (role === "DOCTOR") {
      const doc = await s.getCallerDoctorProfile(context.supabase, context.userId, data.clinicId);
      if (!doc) throw new Error("Doctor profile not found.");
      docId = doc.id;
    }

    return s.callNextPatient(context.supabase, context.userId, data.clinicId, docId, data.date);
  });

export const consultClinicPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        doctorProfileId: z.string().uuid(),
        queueEntryId: z.string().uuid(),
        clinicalNotes: z.string().max(5000).optional().nullable(),
        assessment: z.string().max(2000).optional().nullable(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    const { role } = await s.assertClinicMemberWithRoles(
      context.supabase,
      context.userId,
      data.clinicId,
      ["OWNER", "STAFF", "DOCTOR"]
    );

    let docId = data.doctorProfileId;
    if (role === "DOCTOR") {
      const doc = await s.getCallerDoctorProfile(context.supabase, context.userId, data.clinicId);
      if (!doc) throw new Error("Doctor profile not found.");
      docId = doc.id;
    }

    return s.consultActivePatient(
      context.supabase,
      context.userId,
      data.clinicId,
      docId,
      data.queueEntryId,
      {
        clinical_notes: data.clinicalNotes,
        assessment: data.assessment,
      }
    );
  });

export const getClinicHoursSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => clinicIdSchema.strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    await s.assertClinicMemberWithRoles(context.supabase, context.userId, data.clinicId, [
      "OWNER",
      "STAFF",
      "DOCTOR",
    ]);
    return s.getClinicMetadata(context.supabase, data.clinicId);
  });

export const updateClinicHoursSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        config: clinicWorkingHoursSchema.omit({ clinic_id: true }),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    await s.assertClinicMemberWithRoles(context.supabase, context.userId, data.clinicId, [
      "OWNER",
    ]);
    return s.updateClinicWorkingHours(
      context.supabase,
      context.userId,
      data.clinicId,
      data.config
    );
  });

export const setClinicDateOpen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        isOpen: z.boolean(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    await s.assertClinicMemberWithRoles(context.supabase, context.userId, data.clinicId, [
      "OWNER",
    ]);
    return s.setClinicDateOpenStatus(
      context.supabase,
      context.userId,
      data.clinicId,
      data.date,
      data.isOpen
    );
  });

export const setDoctorDailyAvailabilityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        doctorProfileId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        status: z.enum(["AVAILABLE", "BUSY"]),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    const { role } = await s.assertClinicMemberWithRoles(
      context.supabase,
      context.userId,
      data.clinicId,
      ["OWNER", "DOCTOR"]
    );

    let docId = data.doctorProfileId;
    if (role === "DOCTOR") {
      const doc = await s.getCallerDoctorProfile(context.supabase, context.userId, data.clinicId);
      if (!doc) throw new Error("Doctor profile not found.");
      docId = doc.id;
    }

    return s.setDoctorDailyAvailability(
      context.supabase,
      context.userId,
      data.clinicId,
      docId,
      data.date,
      data.status
    );
  });

export const requestDoctorLeaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        doctorProfileId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.string().trim().max(500).optional().nullable(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    const { role } = await s.assertClinicMemberWithRoles(
      context.supabase,
      context.userId,
      data.clinicId,
      ["OWNER", "DOCTOR"]
    );

    let docId = data.doctorProfileId;
    if (role === "DOCTOR") {
      const doc = await s.getCallerDoctorProfile(context.supabase, context.userId, data.clinicId);
      if (!doc) throw new Error("Doctor profile not found.");
      docId = doc.id;
    }

    return s.requestDoctorLeave(
      context.supabase,
      context.userId,
      data.clinicId,
      docId,
      data.date,
      data.reason
    );
  });

export const reviewDoctorLeaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        doctorProfileId: z.string().uuid(),
        leaveId: z.string().uuid(),
        action: z.enum(["APPROVE", "REJECT"]),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    await s.assertClinicMemberWithRoles(context.supabase, context.userId, data.clinicId, [
      "OWNER",
    ]);

    return s.reviewDoctorLeave(
      context.supabase,
      context.userId,
      data.clinicId,
      data.doctorProfileId,
      data.leaveId,
      data.action
    );
  });

export const getAffectedAppointmentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        doctorProfileId: z.string().uuid().optional(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    await s.assertClinicMemberWithRoles(context.supabase, context.userId, data.clinicId, [
      "OWNER",
      "STAFF",
      "DOCTOR",
    ]);

    return s.getAffectedAppointments(
      context.supabase,
      data.clinicId,
      data.date,
      data.doctorProfileId
    );
  });

export const getClinicDoctorLeavesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => clinicIdSchema.strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    await s.assertClinicMemberWithRoles(context.supabase, context.userId, data.clinicId, [
      "OWNER",
    ]);
    return s.listClinicDoctorLeaves(context.supabase, data.clinicId);
  });

export const getMyDoctorProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => clinicIdSchema.strict().parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    await s.assertClinicMemberWithRoles(context.supabase, context.userId, data.clinicId, [
      "DOCTOR",
    ]);
    return s.getCallerDoctorProfile(context.supabase, context.userId, data.clinicId);
  });

export const reassignClinicQueueDoctor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        queueEntryId: z.string().uuid(),
        newDoctorProfileId: z.string().uuid(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    await s.assertClinicMemberWithRoles(context.supabase, context.userId, data.clinicId, [
      "OWNER",
      "STAFF",
    ]);
    return s.reassignQueueDoctor(
      context.supabase,
      context.userId,
      data.clinicId,
      data.queueEntryId,
      data.newDoctorProfileId
    );
  });

export const listClinicQueueDoctors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    clinicIdSchema
      .extend({
        filters: doctorFiltersSchema.optional(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const s = await import("./appointments.server");
    await s.assertClinicMemberWithRoles(context.supabase, context.userId, data.clinicId, [
      "OWNER",
      "STAFF",
      "DOCTOR",
    ]);
    return s.readClinicOperationalDoctors(context.supabase, data.clinicId, data.filters);
  });


