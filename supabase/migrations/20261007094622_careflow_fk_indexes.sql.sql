CREATE INDEX IF NOT EXISTS idx_clinic_invitations_invited_by
ON public.clinic_invitations (invited_by);

CREATE INDEX IF NOT EXISTS idx_trial_events_clinic_id
ON public.trial_events (clinic_id);

CREATE INDEX IF NOT EXISTS idx_appointments_created_by
ON public.appointments (created_by);

CREATE INDEX IF NOT EXISTS idx_queue_entries_appointment_id
ON public.queue_entries (appointment_id);

CREATE INDEX IF NOT EXISTS idx_queue_entries_doctor_profile_id
ON public.queue_entries (doctor_profile_id);

CREATE INDEX IF NOT EXISTS idx_queue_entries_patient_id
ON public.queue_entries (patient_id);

CREATE INDEX IF NOT EXISTS idx_consultations_appointment_id
ON public.consultations (appointment_id);

CREATE INDEX IF NOT EXISTS idx_consultations_clinic_id
ON public.consultations (clinic_id);

CREATE INDEX IF NOT EXISTS idx_vitals_appointment_id
ON public.vitals (appointment_id);

CREATE INDEX IF NOT EXISTS idx_vitals_clinic_id
ON public.vitals (clinic_id);

CREATE INDEX IF NOT EXISTS idx_vitals_consultation_id
ON public.vitals (consultation_id);

CREATE INDEX IF NOT EXISTS idx_vitals_recorded_by
ON public.vitals (recorded_by);

CREATE INDEX IF NOT EXISTS idx_prescriptions_clinic_id
ON public.prescriptions (clinic_id);

CREATE INDEX IF NOT EXISTS idx_prescriptions_consultation_id
ON public.prescriptions (consultation_id);

CREATE INDEX IF NOT EXISTS idx_prescription_items_prescription_id
ON public.prescription_items (prescription_id);

CREATE INDEX IF NOT EXISTS idx_invoices_appointment_id
ON public.invoices (appointment_id);

CREATE INDEX IF NOT EXISTS idx_invoices_created_by
ON public.invoices (created_by);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id
ON public.invoice_items (invoice_id);

CREATE INDEX IF NOT EXISTS idx_payments_clinic_id
ON public.payments (clinic_id);

CREATE INDEX IF NOT EXISTS idx_payments_recorded_by
ON public.payments (recorded_by);

CREATE INDEX IF NOT EXISTS idx_notifications_clinic_id
ON public.notifications (clinic_id);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id
ON public.ai_usage (user_id);