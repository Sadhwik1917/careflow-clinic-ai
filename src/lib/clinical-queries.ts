import { queryOptions } from "@tanstack/react-query";
import {
  getAppointmentClinicalContextFn,
  listDoctorPrescriptionsFn,
  listPatientPrescriptionsFn,
  listClinicInvoicesFn,
  listPatientAppointmentsFn,
  getPatientProfileSummaryFn,
  listPatientInvoicesFn,
} from "./clinical.functions";

export const appointmentClinicalContextQuery = (
  clinicId: string,
  appointmentId: string
) =>
  queryOptions({
    queryKey: ["clinical-context", clinicId, appointmentId],
    queryFn: () =>
      getAppointmentClinicalContextFn({
        data: { clinicId, appointmentId },
      }),
    staleTime: 5_000,
  });

export const doctorPrescriptionsQuery = (
  clinicId: string,
  doctorProfileId?: string
) =>
  queryOptions({
    queryKey: ["doctor-prescriptions", clinicId, doctorProfileId ?? "all"],
    queryFn: () =>
      listDoctorPrescriptionsFn({
        data: { clinicId, doctorProfileId },
      }),
    staleTime: 15_000,
  });

export const patientPrescriptionsQuery = (clinicId?: string) =>
  queryOptions({
    queryKey: ["patient-prescriptions", clinicId ?? "all"],
    queryFn: () =>
      listPatientPrescriptionsFn({
        data: { clinicId },
      }),
    staleTime: 15_000,
  });

export const clinicInvoicesQuery = (
  clinicId: string,
  statusFilter?: string
) =>
  queryOptions({
    queryKey: ["clinic-invoices", clinicId, statusFilter ?? "ALL"],
    queryFn: () =>
      listClinicInvoicesFn({
        data: { clinicId, statusFilter },
      }),
    staleTime: 10_000,
  });

export const patientAppointmentsQuery = (clinicId?: string) =>
  queryOptions({
    queryKey: ["patient-appointments", clinicId ?? "all"],
    queryFn: () =>
      listPatientAppointmentsFn({
        data: { clinicId },
      }),
    staleTime: 15_000,
  });

export const patientProfileSummaryQuery = (userId: string) =>
  queryOptions({
    queryKey: ["patient-profile-summary", userId],
    queryFn: () => getPatientProfileSummaryFn(),
    staleTime: 30_000,
  });

export const patientInvoicesQuery = (clinicId?: string) =>
  queryOptions({
    queryKey: ["patient-invoices", clinicId ?? "all"],
    queryFn: () =>
      listPatientInvoicesFn({
        data: { clinicId },
      }),
    staleTime: 15_000,
  });

