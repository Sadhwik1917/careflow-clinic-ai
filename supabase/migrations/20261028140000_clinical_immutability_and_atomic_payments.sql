-- Migration: 20261028140000_clinical_immutability_and_atomic_payments.sql
-- Description:
-- 1. SEC-02: Enforce PostgreSQL-level immutability triggers on consultations, prescriptions,
--    prescription_items, and vitals to prevent post-completion modifications via direct PostgREST calls.
-- 2. SEC-04: Implement atomic record_invoice_payment RPC with row-level locking (SELECT ... FOR UPDATE),
--    caller authorization, balance calculation, idempotency checks, and all-or-nothing rollback.

-- ============================================================================
-- 1. SEC-02: Database-Level Clinical Immutability Enforcements
-- ============================================================================

CREATE OR REPLACE FUNCTION private.enforce_clinical_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  -- Platform administrators are exempt for verified platform maintenance
  IF private.is_platform_admin() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- 1. Consultations Immutability
  IF TG_TABLE_NAME = 'consultations' THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.status = 'COMPLETED'::public.consultation_status THEN
        RAISE EXCEPTION 'Cannot modify a completed consultation. Clinical records are finalized upon completion.'
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
      IF OLD.status = 'COMPLETED'::public.consultation_status THEN
        RAISE EXCEPTION 'Cannot delete a completed consultation.'
          USING ERRCODE = '42501';
      END IF;
      RETURN OLD;
    END IF;

  -- 2. Prescriptions Immutability
  ELSIF TG_TABLE_NAME = 'prescriptions' THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.status = 'COMPLETED'::public.prescription_status THEN
        RAISE EXCEPTION 'Cannot modify a finalized e-prescription.'
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
      IF OLD.status = 'COMPLETED'::public.prescription_status THEN
        RAISE EXCEPTION 'Cannot delete a finalized e-prescription.'
          USING ERRCODE = '42501';
      END IF;
      RETURN OLD;
    END IF;

  -- 3. Prescription Items Immutability
  ELSIF TG_TABLE_NAME = 'prescription_items' THEN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      IF EXISTS (
        SELECT 1 FROM public.prescriptions p
        WHERE p.id = NEW.prescription_id AND p.status = 'COMPLETED'::public.prescription_status
      ) THEN
        RAISE EXCEPTION 'Cannot modify prescription items for a finalized e-prescription.'
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
      IF EXISTS (
        SELECT 1 FROM public.prescriptions p
        WHERE p.id = OLD.prescription_id AND p.status = 'COMPLETED'::public.prescription_status
      ) THEN
        RAISE EXCEPTION 'Cannot delete prescription items for a finalized e-prescription.'
          USING ERRCODE = '42501';
      END IF;
      RETURN OLD;
    END IF;

  -- 4. Vitals Immutability
  ELSIF TG_TABLE_NAME = 'vitals' THEN
    IF TG_OP = 'INSERT' THEN
      -- Prevent inserting vitals for a consultation that is already completed
      IF NEW.consultation_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.consultations c
        WHERE c.id = NEW.consultation_id AND c.status = 'COMPLETED'::public.consultation_status
      ) THEN
        RAISE EXCEPTION 'Cannot record vitals for a completed consultation.'
          USING ERRCODE = '42501';
      END IF;

      -- Prevent inserting vitals for an appointment that is already completed
      IF NEW.appointment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = NEW.appointment_id AND a.status = 'COMPLETED'::public.appointment_status
      ) THEN
        RAISE EXCEPTION 'Cannot record vitals for a completed appointment.'
          USING ERRCODE = '42501';
      END IF;

      RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
      -- Check if associated consultation is already completed
      IF OLD.consultation_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.consultations c
        WHERE c.id = OLD.consultation_id AND c.status = 'COMPLETED'::public.consultation_status
      ) THEN
        RAISE EXCEPTION 'Cannot modify or delete vitals for a completed consultation.'
          USING ERRCODE = '42501';
      END IF;

      -- Check if associated appointment is already completed
      IF OLD.appointment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = OLD.appointment_id AND a.status = 'COMPLETED'::public.appointment_status
      ) THEN
        RAISE EXCEPTION 'Cannot modify or delete vitals for a completed appointment.'
          USING ERRCODE = '42501';
      END IF;

      -- Check if target consultation or appointment is already completed
      IF NEW.consultation_id IS NOT NULL AND NEW.consultation_id IS DISTINCT FROM OLD.consultation_id AND EXISTS (
        SELECT 1 FROM public.consultations c
        WHERE c.id = NEW.consultation_id AND c.status = 'COMPLETED'::public.consultation_status
      ) THEN
        RAISE EXCEPTION 'Cannot link vitals to a completed consultation.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.appointment_id IS NOT NULL AND NEW.appointment_id IS DISTINCT FROM OLD.appointment_id AND EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = NEW.appointment_id AND a.status = 'COMPLETED'::public.appointment_status
      ) THEN
        RAISE EXCEPTION 'Cannot link vitals to a completed appointment.'
          USING ERRCODE = '42501';
      END IF;

      RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
      IF OLD.consultation_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.consultations c
        WHERE c.id = OLD.consultation_id AND c.status = 'COMPLETED'::public.consultation_status
      ) THEN
        RAISE EXCEPTION 'Cannot modify or delete vitals for a completed consultation.'
          USING ERRCODE = '42501';
      END IF;

      IF OLD.appointment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = OLD.appointment_id AND a.status = 'COMPLETED'::public.appointment_status
      ) THEN
        RAISE EXCEPTION 'Cannot modify or delete vitals for a completed appointment.'
          USING ERRCODE = '42501';
      END IF;

      RETURN OLD;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION private.enforce_clinical_immutability() FROM PUBLIC, anon, authenticated;

-- Attach Triggers to Tables
DROP TRIGGER IF EXISTS trg_consultations_immutability ON public.consultations;
CREATE TRIGGER trg_consultations_immutability
  BEFORE UPDATE OR DELETE ON public.consultations
  FOR EACH ROW EXECUTE FUNCTION private.enforce_clinical_immutability();

DROP TRIGGER IF EXISTS trg_prescriptions_immutability ON public.prescriptions;
CREATE TRIGGER trg_prescriptions_immutability
  BEFORE UPDATE OR DELETE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION private.enforce_clinical_immutability();

DROP TRIGGER IF EXISTS trg_prescription_items_immutability ON public.prescription_items;
CREATE TRIGGER trg_prescription_items_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.prescription_items
  FOR EACH ROW EXECUTE FUNCTION private.enforce_clinical_immutability();

DROP TRIGGER IF EXISTS trg_vitals_immutability ON public.vitals;
CREATE TRIGGER trg_vitals_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.vitals
  FOR EACH ROW EXECUTE FUNCTION private.enforce_clinical_immutability();


-- ============================================================================
-- 2. SEC-04: Atomic Payment Recording and Balance Calculation RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_clinic_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method,
  p_reference text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_role public.member_role;
  v_inv public.invoices%ROWTYPE;
  v_existing_payment public.payments%ROWTYPE;
  v_new_payment public.payments%ROWTYPE;
  v_updated_inv public.invoices%ROWTYPE;
  v_new_paid numeric;
  v_new_due numeric;
  v_new_status public.invoice_status;
BEGIN
  -- 1. Caller Authentication
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not signed in.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user AND status = 'ACTIVE' AND platform_role = 'USER'
  ) THEN
    RAISE EXCEPTION 'Active user profile required.' USING ERRCODE = '42501';
  END IF;

  -- 2. Clinic Operational Status Check
  IF NOT public.clinic_is_operational(p_clinic_id) THEN
    RAISE EXCEPTION 'Clinic is not currently operational.' USING ERRCODE = '42501';
  END IF;

  -- 3. Membership & Role Verification (Only OWNER or STAFF can record payments)
  SELECT cm.role INTO v_role
  FROM public.clinic_members cm
  WHERE cm.clinic_id = p_clinic_id
    AND cm.user_id = v_user
    AND cm.status = 'ACTIVE'::public.member_status;

  IF NOT FOUND OR v_role NOT IN ('OWNER'::public.member_role, 'STAFF'::public.member_role) THEN
    RAISE EXCEPTION 'Access is unavailable for this clinic.' USING ERRCODE = '42501';
  END IF;

  -- 4. Row-Level Lock on Invoice (Serialises all concurrent payments on this invoice)
  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_inv.status IN ('PAID'::public.invoice_status, 'CANCELLED'::public.invoice_status) THEN
    RAISE EXCEPTION 'Invoice has already been finalized or cancelled.' USING ERRCODE = '22023';
  END IF;

  -- 5. Amount Validation
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.' USING ERRCODE = '22023';
  END IF;

  IF p_amount > v_inv.amount_due THEN
    RAISE EXCEPTION 'Payment cannot exceed the outstanding balance of ₹%.' , v_inv.amount_due
      USING ERRCODE = '22023';
  END IF;

  -- 6. Idempotency Check (Retry resilience against timeouts)
  IF p_reference IS NOT NULL AND btrim(p_reference) <> '' THEN
    SELECT * INTO v_existing_payment
    FROM public.payments
    WHERE clinic_id = p_clinic_id
      AND invoice_id = p_invoice_id
      AND transaction_reference = btrim(p_reference)
      AND status = 'SUCCESS'::public.payment_status;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'payment', to_jsonb(v_existing_payment),
        'invoice', to_jsonb(v_inv)
      );
    END IF;
  END IF;

  -- 7. Atomic Insert Payment Record
  INSERT INTO public.payments (
    clinic_id,
    invoice_id,
    patient_id,
    amount,
    payment_method,
    paid_at,
    status,
    transaction_reference,
    recorded_by
  ) VALUES (
    p_clinic_id,
    p_invoice_id,
    v_inv.patient_id,
    p_amount,
    p_payment_method,
    now(),
    'SUCCESS'::public.payment_status,
    nullif(btrim(p_reference), ''),
    v_user
  )
  RETURNING * INTO v_new_payment;

  -- 8. Atomic Update Invoice Balances
  v_new_paid := v_inv.amount_paid + p_amount;
  v_new_due := GREATEST(0, v_inv.total_amount - v_new_paid);
  v_new_status := CASE WHEN v_new_due = 0 THEN 'PAID'::public.invoice_status ELSE 'PARTIALLY_PAID'::public.invoice_status END;

  UPDATE public.invoices
  SET amount_paid = v_new_paid,
      amount_due = v_new_due,
      status = v_new_status,
      updated_at = now()
  WHERE id = p_invoice_id
  RETURNING * INTO v_updated_inv;

  -- 9. Atomic Audit Log
  INSERT INTO public.audit_logs (
    clinic_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    p_clinic_id,
    v_user,
    'INVOICE_PAYMENT_RECORDED',
    'payments',
    v_new_payment.id,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'amount', p_amount,
      'method', p_payment_method,
      'new_status', v_new_status
    )
  );

  RETURN jsonb_build_object(
    'payment', to_jsonb(v_new_payment),
    'invoice', to_jsonb(v_updated_inv)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, uuid, numeric, public.payment_method, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, uuid, numeric, public.payment_method, text) TO authenticated;
