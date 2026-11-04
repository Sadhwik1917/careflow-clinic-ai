import { queryOptions } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";
import {
  getClinicDoctor,
  getInvitationPreview,
  getMyDoctorProfileFn,
  getMyStaffProfileFn,
  listClinicDoctors,
  listClinicInvitations,
  listClinicStaff,
} from "./team.functions";
import type { DoctorFilters, StaffFilters } from "./team";

export const doctorsQuery = (userId: string, clinicId: string, filters: DoctorFilters) => queryOptions({ queryKey: ["doctors", userId, clinicId, filters], queryFn: () => listClinicDoctors({ data: { clinicId, filters } }) });
export const doctorQuery = (userId: string, clinicId: string, doctorId: string) => queryOptions({ queryKey: ["doctor", userId, clinicId, doctorId], queryFn: async () => { const d = await getClinicDoctor({ data: { clinicId, doctorId } }); if (!d) throw notFound(); return d; } });
export const staffQuery = (userId: string, clinicId: string, filters: StaffFilters) => queryOptions({ queryKey: ["staff", userId, clinicId, filters], queryFn: () => listClinicStaff({ data: { clinicId, filters } }) });
export const invitationsQuery = (userId: string, clinicId: string) => queryOptions({ queryKey: ["invitations", userId, clinicId], queryFn: () => listClinicInvitations({ data: { clinicId } }) });
export const invitationPreviewQuery = (token: string, userEmail?: string | null) =>
  queryOptions({
    queryKey: ["invitation-preview", token, userEmail ?? ""],
    queryFn: () => getInvitationPreview({ data: { token } }),
    staleTime: 30_000,
  });

export const doctorSelfProfileQuery = (clinicId: string) =>
  queryOptions({
    queryKey: ["doctor-self-profile", clinicId],
    queryFn: () => getMyDoctorProfileFn({ data: { clinicId } }),
    staleTime: 60_000,
  });

export const staffSelfProfileQuery = (clinicId: string) =>
  queryOptions({
    queryKey: ["staff-self-profile", clinicId],
    queryFn: () => getMyStaffProfileFn({ data: { clinicId } }),
    staleTime: 60_000,
  });


