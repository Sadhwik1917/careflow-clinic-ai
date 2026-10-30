-- Migration: Add clinic_gmail_connections table for multi-tenant Gmail OAuth storage
-- Enables persistent storage of encrypted refresh tokens for Gmail API delivery across serverless instances.

CREATE TABLE IF NOT EXISTS public.clinic_gmail_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  sender_email text NOT NULL,
  encrypted_refresh_token text NOT NULL,
  iv text NOT NULL,
  tag text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_gmail_connections_clinic_id_unique UNIQUE (clinic_id)
);

-- Enable Row Level Security
ALTER TABLE public.clinic_gmail_connections ENABLE ROW LEVEL SECURITY;

-- Allow authenticated clinic OWNER members to view their clinic's Gmail connection status
CREATE POLICY "Clinic owners can view clinic Gmail connection"
  ON public.clinic_gmail_connections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_members cm
      WHERE cm.clinic_id = clinic_gmail_connections.clinic_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'OWNER'
        AND cm.status = 'ACTIVE'
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_clinic_gmail_connections_clinic_id ON public.clinic_gmail_connections(clinic_id);

