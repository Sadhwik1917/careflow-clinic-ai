-- ============================================================
-- Migration: 20261030110000_clinic_attendance.sql
-- Description: Clinic Attendance and Doctor Absence Management
-- Security:
--   - Tenant-scoped via clinic_id foreign key
--   - Strict uniqueness per (clinic_id, user_id, date) prevents duplicates
--   - RLS: SELECT permitted for active clinic members (OWNER, DOCTOR, STAFF) and platform admin
--   - RLS: INSERT, UPDATE, DELETE permitted strictly for clinic OWNER
-- ============================================================

CREATE TABLE IF NOT EXISTS public.clinic_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.member_role NOT NULL CHECK (role IN ('DOCTOR', 'STAFF')),
  date date NOT NULL,
  status text NOT NULL CHECK (status IN ('PRESENT', 'ABSENT')),
  reason text,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_clinic_attendance_member_date UNIQUE (clinic_id, user_id, date)
);

-- Indexes for efficient querying by clinic, date, and member
CREATE INDEX IF NOT EXISTS idx_clinic_attendance_clinic_date ON public.clinic_attendance (clinic_id, date);
CREATE INDEX IF NOT EXISTS idx_clinic_attendance_clinic_user ON public.clinic_attendance (clinic_id, user_id);

-- Updated_at trigger
DROP TRIGGER IF EXISTS tr_clinic_attendance_updated_at ON public.clinic_attendance;
CREATE TRIGGER tr_clinic_attendance_updated_at
  BEFORE UPDATE ON public.clinic_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Enable Row Level Security
ALTER TABLE public.clinic_attendance ENABLE ROW LEVEL SECURITY;

-- SELECT policy: clinic members (OWNER, DOCTOR, STAFF) or platform admin
DROP POLICY IF EXISTS "clinic_attendance_select" ON public.clinic_attendance;
CREATE POLICY "clinic_attendance_select"
  ON public.clinic_attendance
  FOR SELECT
  USING (
    private.has_clinic_role(clinic_id, ARRAY['OWNER', 'DOCTOR', 'STAFF']::public.member_role[])
    OR private.is_platform_admin()
  );

-- INSERT policy: only clinic OWNER
DROP POLICY IF EXISTS "clinic_attendance_insert" ON public.clinic_attendance;
CREATE POLICY "clinic_attendance_insert"
  ON public.clinic_attendance
  FOR INSERT
  WITH CHECK (
    private.has_clinic_role(clinic_id, ARRAY['OWNER']::public.member_role[])
  );

-- UPDATE policy: only clinic OWNER
DROP POLICY IF EXISTS "clinic_attendance_update" ON public.clinic_attendance;
CREATE POLICY "clinic_attendance_update"
  ON public.clinic_attendance
  FOR UPDATE
  USING (
    private.has_clinic_role(clinic_id, ARRAY['OWNER']::public.member_role[])
  )
  WITH CHECK (
    private.has_clinic_role(clinic_id, ARRAY['OWNER']::public.member_role[])
  );

-- DELETE policy: only clinic OWNER
DROP POLICY IF EXISTS "clinic_attendance_delete" ON public.clinic_attendance;
CREATE POLICY "clinic_attendance_delete"
  ON public.clinic_attendance
  FOR DELETE
  USING (
    private.has_clinic_role(clinic_id, ARRAY['OWNER']::public.member_role[])
  );

-- Permissions
GRANT ALL ON public.clinic_attendance TO authenticated, service_role;

