import { queryOptions } from "@tanstack/react-query";
import {
  listClinicAppointments,
  getClinicAppointment,
  getDoctorAvailabilitySlots,
  listClinicQueue,
  getClinicHoursSettings,
  getAffectedAppointmentsFn,
  getClinicDoctorLeavesFn,
  getMyDoctorProfile,
} from "./appointments.functions";
import type { AppointmentFilters } from "./appointments";

export const appointmentsQuery = (
  userId: string,
  clinicId: string,
  filters: AppointmentFilters
) =>
  queryOptions({
    queryKey: ["appointments", clinicId, filters],
    queryFn: () => listClinicAppointments({ data: { clinicId, filters } }),
    staleTime: 30_000,
  });

export const appointmentQuery = (
  userId: string,
  clinicId: string,
  appointmentId: string
) =>
  queryOptions({
    queryKey: ["appointment", clinicId, appointmentId],
    queryFn: () => getClinicAppointment({ data: { clinicId, appointmentId } }),
    staleTime: 30_000,
  });

export const doctorAvailabilityQuery = (
  userId: string,
  clinicId: string,
  doctorProfileId: string,
  date: string,
  requestedSlotStart?: string
) =>
  queryOptions({
    queryKey: ["doctor-availability", clinicId, doctorProfileId, date, requestedSlotStart ?? ""],
    queryFn: () =>
      getDoctorAvailabilitySlots({
        data: {
          clinicId,
          doctorProfileId,
          date,
          requestedSlotStart,
        },
      }),
    staleTime: 10_000,
  });

export const queueEntriesQuery = (
  userId: string,
  clinicId: string,
  date: string,
  doctorProfileId?: string
) =>
  queryOptions({
    queryKey: ["queue-entries", clinicId, date, doctorProfileId ?? "all"],
    queryFn: () =>
      listClinicQueue({
        data: {
          clinicId,
          date,
          doctorProfileId,
        },
      }),
    staleTime: 10_000,
    refetchInterval: 15_000, // Automatic polling backup alongside Realtime
  });

export const clinicHoursQuery = (userId: string, clinicId: string) =>
  queryOptions({
    queryKey: ["clinic-hours", clinicId],
    queryFn: () => getClinicHoursSettings({ data: { clinicId } }),
    staleTime: 60_000,
  });

export const affectedAppointmentsQuery = (
  userId: string,
  clinicId: string,
  date: string,
  doctorProfileId?: string
) =>
  queryOptions({
    queryKey: ["affected-appointments", clinicId, date, doctorProfileId ?? "all"],
    queryFn: () =>
      getAffectedAppointmentsFn({
        data: {
          clinicId,
          date,
          doctorProfileId,
        },
      }),
    staleTime: 30_000,
  });

export const clinicDoctorLeavesQuery = (userId: string, clinicId: string) =>
  queryOptions({
    queryKey: ["clinic-doctor-leaves", clinicId],
    queryFn: () => getClinicDoctorLeavesFn({ data: { clinicId } }),
    staleTime: 30_000,
  });

export const myDoctorProfileQuery = (clinicId: string) =>
  queryOptions({
    queryKey: ["my-doctor-profile", clinicId],
    queryFn: () => getMyDoctorProfile({ data: { clinicId } }),
    staleTime: 60_000,
  });

