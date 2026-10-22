import { queryOptions } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";
import { listClinicPatients, getClinicPatient } from "./patients.functions";
import type { PatientFilters } from "./patients";
export const patientsQuery = (userId: string, clinicId: string, filters: PatientFilters) => queryOptions({ queryKey: ["patients", userId, clinicId, filters], queryFn: () => listClinicPatients({ data: { clinicId, filters } }) });
export const patientQuery = (userId: string, clinicId: string, patientId: string) => queryOptions({ queryKey: ["patient", userId, clinicId, patientId], queryFn: async () => { const p = await getClinicPatient({ data: { clinicId, patientId } }); if (!p) throw notFound(); return p; } });