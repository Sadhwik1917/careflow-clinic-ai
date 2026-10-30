import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type AttendanceRow = Database["public"]["Tables"]["clinic_attendance"]["Row"];
export type AttendanceStatus = "PRESENT" | "ABSENT";
export type AttendanceDisplayStatus = AttendanceStatus | "UNRECORDED";

export interface AttendanceRecord extends AttendanceRow {
  display_name?: string | null;
}

export interface AttendanceMemberItem {
  id: string; // doctor_profile_id or clinic_member_id
  user_id: string;
  role: "DOCTOR" | "STAFF";
  display_name: string;
  specialization?: string | null;
  date: string;
  status: AttendanceDisplayStatus;
  reason: string | null;
  attendance_id: string | null;
  recorded_by: string | null;
  updated_at: string | null;
}

export interface AttendanceCounts {
  total: number;
  present: number;
  absent: number;
  unrecorded: number;
}

export interface AttendanceSummary {
  date: string;
  timezone: string;
  doctors: AttendanceCounts;
  staff: AttendanceCounts;
  doctorRows: AttendanceMemberItem[];
  staffRows: AttendanceMemberItem[];
}

export interface AttendanceDayTrend {
  date: string;
  doctorsPresent: number;
  doctorsAbsent: number;
  staffPresent: number;
  staffAbsent: number;
}

export interface AttendanceAnalyticsResult {
  range: "today" | "7d" | "30d" | "custom";
  startDate: string;
  endDate: string;
  totalDays: number;
  doctors: {
    totalMembers: number;
    totalPresentCount: number;
    totalAbsentCount: number;
  };
  staff: {
    totalMembers: number;
    totalPresentCount: number;
    totalAbsentCount: number;
  };
  dailyTrends: AttendanceDayTrend[];
  latestSummary: AttendanceSummary;
}

export const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const markDoctorAbsentSchema = z.object({
  clinicId: z.string().uuid(),
  doctorProfileId: z.string().uuid(),
  date: z.string().regex(dateRegex, "Date must be formatted as YYYY-MM-DD"),
  reason: z.string().trim().max(500, "Reason cannot exceed 500 characters").optional().default("Unplanned absence / emergency leave"),
});

export type MarkDoctorAbsentInput = z.infer<typeof markDoctorAbsentSchema>;

export const recordAttendanceSchema = z.object({
  clinicId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["DOCTOR", "STAFF"]),
  date: z.string().regex(dateRegex, "Date must be formatted as YYYY-MM-DD"),
  status: z.enum(["PRESENT", "ABSENT"]),
  reason: z.string().trim().max(500, "Reason cannot exceed 500 characters").nullish(),
});

export type RecordAttendanceInput = z.infer<typeof recordAttendanceSchema>;

export const attendanceQuerySchema = z.object({
  clinicId: z.string().uuid(),
  date: z.string().regex(dateRegex).optional(),
});

export const ATTENDANCE_RANGES = ["today", "7d", "30d", "custom"] as const;
export type AttendanceRange = (typeof ATTENDANCE_RANGES)[number];

export const attendanceAnalyticsSchema = z.object({
  clinicId: z.string().uuid(),
  range: z.enum(ATTENDANCE_RANGES).default("today"),
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
});

