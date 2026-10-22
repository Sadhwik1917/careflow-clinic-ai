import { queryOptions } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";
import { getClinicDoctor, listClinicDoctors, listClinicInvitations, listClinicStaff } from "./team.functions";
import type { DoctorFilters, StaffFilters } from "./team";

export const doctorsQuery = (userId: string, clinicId: string, filters: DoctorFilters) => queryOptions({ queryKey: ["doctors", userId, clinicId, filters], queryFn: () => listClinicDoctors({ data: { clinicId, filters } }) });
export const doctorQuery = (userId: string, clinicId: string, doctorId: string) => queryOptions({ queryKey: ["doctor", userId, clinicId, doctorId], queryFn: async () => { const d = await getClinicDoctor({ data: { clinicId, doctorId } }); if (!d) throw notFound(); return d; } });
export const staffQuery = (userId: string, clinicId: string, filters: StaffFilters) => queryOptions({ queryKey: ["staff", userId, clinicId, filters], queryFn: () => listClinicStaff({ data: { clinicId, filters } }) });
export const invitationsQuery = (userId: string, clinicId: string) => queryOptions({ queryKey: ["invitations", userId, clinicId], queryFn: () => listClinicInvitations({ data: { clinicId } }) });
