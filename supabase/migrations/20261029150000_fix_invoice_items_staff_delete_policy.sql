-- Migration: 20261029150000_fix_invoice_items_staff_delete_policy.sql
-- Description:
-- 1. Grant STAFF role permission to delete from invoice_items so authorized billing staff
--    can cleanly replace draft items without leaving orphaned price-less items in PostgreSQL.
-- 2. Grant DOCTOR role permission to SELECT from invoices so appointment consultation completion
--    can reliably detect existing generated invoices and avoid duplicate generation.

-- ============================================================================
-- 1. Fix invoice_items DELETE RLS policy for STAFF
-- ============================================================================

DROP POLICY IF EXISTS invoice_items_delete ON public.invoice_items;
CREATE POLICY invoice_items_delete ON public.invoice_items
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_id
      AND (
        private.has_clinic_role(i.clinic_id, ARRAY['OWNER','STAFF']::public.member_role[])
        OR private.is_platform_admin()
      )
  )
);

-- ============================================================================
-- 2. Allow DOCTOR role to read invoices for their clinic appointments
-- ============================================================================

DROP POLICY IF EXISTS invoices_select ON public.invoices;
CREATE POLICY invoices_select ON public.invoices
FOR SELECT TO authenticated
USING (
  private.has_clinic_role(
    clinic_id, ARRAY['OWNER','STAFF','DOCTOR']::public.member_role[]
  )
  OR private.is_patient_for_clinic(clinic_id, patient_id)
  OR private.is_platform_admin()
);
