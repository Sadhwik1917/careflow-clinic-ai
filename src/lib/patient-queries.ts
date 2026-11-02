import { queryOptions } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";
import {
  listClinicPatients,
  getClinicPatient,
  listDoctorPatients,
  getDoctorPatient,
  listStaffPatients,
  getStaffPatient,
} from "./patients.functions";
import type { PatientFilters } from "./patients";

export const patientsQuery = (userId: string, clinicId: string, filters: PatientFilters) =>
  queryOptions({
    queryKey: ["patients", userId, clinicId, filters],
    queryFn: () => listClinicPatients({ data: { clinicId, filters } }),
  });

export const patientQuery = (userId: string, clinicId: string, patientId: string) =>
  queryOptions({
    queryKey: ["patient", userId, clinicId, patientId],
    queryFn: async () => {
      const p = await getClinicPatient({ data: { clinicId, patientId } });
      if (!p) throw notFound();
      return p;
    },
  });

export const doctorPatientsQuery = (userId: string, clinicId: string, filters: PatientFilters) =>
  queryOptions({
    queryKey: ["doctor-patients", userId, clinicId, filters],
    queryFn: () => listDoctorPatients({ data: { clinicId, filters } }),
  });

export const doctorPatientQuery = (userId: string, clinicId: string, patientId: string) =>
  queryOptions({
    queryKey: ["doctor-patient", userId, clinicId, patientId],
    queryFn: async () => {
      const p = await getDoctorPatient({ data: { clinicId, patientId } });
      if (!p) throw notFound();
      return p;
    },
  });

export const staffPatientsQuery = (userId: string, clinicId: string, filters: PatientFilters) =>
  queryOptions({
    queryKey: ["staff-patients", userId, clinicId, filters],
    queryFn: () => listStaffPatients({ data: { clinicId, filters } }),
  });

export const staffPatientQuery = (userId: string, clinicId: string, patientId: string) =>
  queryOptions({
    queryKey: ["staff-patient", userId, clinicId, patientId],
    queryFn: async () => {
      const p = await getStaffPatient({ data: { clinicId, patientId } });
      if (!p) throw notFound();
      return p;
    },
  });
