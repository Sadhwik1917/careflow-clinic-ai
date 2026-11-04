import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  markDoctorAbsentSchema,
  recordAttendanceSchema,
  attendanceQuerySchema,
  attendanceAnalyticsSchema,
} from "./attendance";

/**
 * Owner marks doctor absent for a specific date (unplanned absence or emergency leave).
 */
export const markDoctorAbsentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => markDoctorAbsentSchema.parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./attendance.server");
    return s.markDoctorAbsent(context.supabase, context.userId, data);
  });

/**
 * Owner records or corrects attendance (Present or Absent) for doctor or staff.
 */
export const recordAttendanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => recordAttendanceSchema.parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./attendance.server");
    return s.recordAttendance(context.supabase, context.userId, data);
  });

/**
 * Reads attendance breakdown and honest counts for a specific date.
 */
export const getAttendanceForDateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => attendanceQuerySchema.parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./attendance.server");
    return s.readAttendanceForDate(context.supabase, context.userId, data.clinicId, data.date);
  });

/**
 * Reads attendance analytics across a date or date range.
 */
export const getAttendanceAnalyticsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => attendanceAnalyticsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const s = await import("./attendance.server");
    return s.readAttendanceAnalytics(
      context.supabase,
      context.userId,
      data.clinicId,
      data.range,
      data.startDate,
      data.endDate
    );
  });

