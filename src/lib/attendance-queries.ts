import { queryOptions } from "@tanstack/react-query";
import {
  getAttendanceForDateFn,
  getAttendanceAnalyticsFn,
} from "./attendance.functions";
import type { AttendanceRange } from "./attendance";

export const attendanceForDateQuery = (userId: string, clinicId: string, date?: string) =>
  queryOptions({
    queryKey: ["attendance-date", userId, clinicId, date ?? "today"],
    queryFn: () => getAttendanceForDateFn({ data: { clinicId, date } }),
    staleTime: 30_000,
  });

export const attendanceAnalyticsQuery = (
  userId: string,
  clinicId: string,
  range: AttendanceRange = "today",
  startDate?: string,
  endDate?: string
) =>
  queryOptions({
    queryKey: ["attendance-analytics", userId, clinicId, range, startDate ?? "", endDate ?? ""],
    queryFn: () =>
      getAttendanceAnalyticsFn({
        data: {
          clinicId,
          range,
          startDate,
          endDate,
        },
      }),
    staleTime: 30_000,
  });

