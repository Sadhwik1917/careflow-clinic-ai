CREATE TABLE public.clinic_reverifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  basis_approved_at timestamptz NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz NOT NULL,
  reminder_sent_at timestamptz,
  responded_at timestamptz,
  status text NOT NULL DEFAULT 'OPEN',
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX clinic_reverifications_one_open ON public.clinic_reverifications (clinic_id) WHERE status IN ('OPEN','RESPONDED');
CREATE INDEX clinic_reverifications_clinic ON public.clinic_reverifications (clinic_id, requested_at DESC);
GRANT SELECT ON public.clinic_reverifications TO authenticated;
GRANT ALL ON public.clinic_reverifications TO service_role;
ALTER TABLE public.clinic_reverifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY clinic_reverifications_select ON public.clinic_reverifications FOR SELECT TO authenticated
  USING (private.has_clinic_role(clinic_id, ARRAY['OWNER'::public.member_role]) OR private.is_platform_admin());
CREATE TRIGGER set_clinic_reverifications_updated_at BEFORE UPDATE ON public.clinic_reverifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- System-recorded events (scheduled enforcement) have no human actor.
ALTER TABLE public.verification_events ALTER COLUMN actor_user_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION private.verification_editable(p_clinic uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.clinic_verifications v WHERE v.clinic_id = p_clinic
    AND (v.status IN ('DRAFT','CHANGES_REQUESTED','REJECTED')
         OR (v.status = 'APPROVED' AND EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = p_clinic AND c.status = 'SUSPENDED'))
         OR (v.status = 'APPROVED' AND EXISTS (SELECT 1 FROM public.clinic_reverifications r WHERE r.clinic_id = p_clinic AND r.status = 'OPEN'))));
$$;

-- A timely reverification response keeps the clinic running while the admin reviews it.
CREATE OR REPLACE FUNCTION private.clinic_is_operational(p_clinic uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = p_clinic AND c.status = 'ACTIVE')
     AND EXISTS (SELECT 1 FROM public.clinic_verifications v WHERE v.clinic_id = p_clinic AND (v.status = 'APPROVED'
           OR (v.status = 'PENDING_REVIEW' AND EXISTS (SELECT 1 FROM public.clinic_reverifications r WHERE r.clinic_id = p_clinic AND r.status = 'RESPONDED'))))
     AND EXISTS (SELECT 1 FROM public.subscription_clinics sc JOIN public.clinic_subscriptions s ON s.id = sc.subscription_id
                 WHERE sc.clinic_id = p_clinic AND (s.status = 'ACTIVE' OR (s.status = 'TRIAL_ACTIVE' AND s.trial_end_date > now())));
$$;

-- Suspends one overdue reverification. Same trusted path as admin_clinic_action SUSPEND (status flag, event, audit).
CREATE OR REPLACE FUNCTION private.enforce_reverification(p_rev uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE r public.clinic_reverifications; c public.clinics; v public.clinic_verifications;
  msg text := 'Required documents for the six-monthly reverification were not submitted by the deadline.';
BEGIN
  SELECT * INTO r FROM public.clinic_reverifications WHERE id = p_rev AND status = 'OPEN' AND deadline_at <= now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO c FROM public.clinics WHERE id = r.clinic_id FOR UPDATE;
  SELECT * INTO v FROM public.clinic_verifications WHERE clinic_id = r.clinic_id FOR UPDATE;
  IF c.status <> 'ACTIVE' OR v.status IS DISTINCT FROM 'APPROVED' THEN
    UPDATE public.clinic_reverifications SET status = 'CLOSED', closed_at = now() WHERE id = p_rev;
    RETURN false;
  END IF;
  PERFORM set_config('careflow.trusted_status_change', c.id::text, true);
  UPDATE public.clinics SET status = 'SUSPENDED' WHERE id = c.id;
  PERFORM set_config('careflow.trusted_status_change', '', true);
  INSERT INTO public.verification_events (clinic_id, cycle, event_type, from_status, to_status, actor_user_id, reason)
    VALUES (c.id, v.cycle, 'SUSPENDED', 'APPROVED', 'APPROVED', NULL, msg);
  INSERT INTO public.audit_logs (clinic_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (c.id, NULL, 'CLINIC_SUSPEND', 'clinic', c.id, jsonb_build_object('reason', msg, 'previous_clinic_status', c.status, 'source', 'reverification_deadline', 'reverification_id', p_rev));
  UPDATE public.clinic_reverifications SET status = 'SUSPENDED', closed_at = now() WHERE id = p_rev;
  INSERT INTO public.notifications (recipient_user_id, clinic_id, type, title, message, related_entity_type, related_entity_id)
    VALUES (c.owner_user_id, c.id, 'REVERIFICATION_SUSPENDED', 'Clinic suspended: reverification overdue',
      msg || ' Upload them and resubmit at https://careflow-clinic-ai.lovable.app/clinic/verification. Access returns after the administrator approves and lifts the suspension.',
      'clinic_reverification', p_rev);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION private.run_reverification_maintenance() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE rid uuid;
BEGIN
  -- 1. Close requests resolved by any later decision, or by an admin suspension of an unanswered request.
  UPDATE public.clinic_reverifications r
     SET status = CASE WHEN v.status = 'APPROVED' AND v.decided_at > r.requested_at THEN 'COMPLETED' ELSE 'CLOSED' END, closed_at = now()
    FROM public.clinic_verifications v, public.clinics c
   WHERE v.clinic_id = r.clinic_id AND c.id = r.clinic_id AND r.status IN ('OPEN','RESPONDED')
     AND (v.decided_at > r.requested_at OR (r.status = 'OPEN' AND c.status <> 'ACTIVE'));

  -- 2. Enforce deadlines.
  FOR rid IN SELECT id FROM public.clinic_reverifications WHERE status = 'OPEN' AND deadline_at <= now() LOOP
    PERFORM private.enforce_reverification(rid);
  END LOOP;

  -- 3. Three-day reminder, once.
  WITH rem AS (
    UPDATE public.clinic_reverifications SET reminder_sent_at = now()
     WHERE status = 'OPEN' AND reminder_sent_at IS NULL AND deadline_at > now() AND deadline_at <= now() + interval '3 days'
    RETURNING id, clinic_id, deadline_at)
  INSERT INTO public.notifications (recipient_user_id, clinic_id, type, title, message, related_entity_type, related_entity_id)
  SELECT c.owner_user_id, c.id, 'REVERIFICATION_REMINDER', 'Reminder: reverification documents due soon',
         'Submit your clinic''s reverification documents by ' || to_char(rem.deadline_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') || ' IST or the clinic will be suspended. Upload them at https://careflow-clinic-ai.lovable.app/clinic/verification.',
         'clinic_reverification', rem.id
    FROM rem JOIN public.clinics c ON c.id = rem.clinic_id;

  -- 4. New requests: approved, active clinics approved 6+ months ago with no request in the last 6 months.
  WITH ins AS (
    INSERT INTO public.clinic_reverifications (clinic_id, basis_approved_at, requested_at, deadline_at)
    SELECT v.clinic_id, v.decided_at, now(), now() + interval '7 days'
      FROM public.clinic_verifications v JOIN public.clinics c ON c.id = v.clinic_id
     WHERE v.status = 'APPROVED' AND c.status = 'ACTIVE' AND v.decided_at IS NOT NULL AND v.decided_at <= now() - interval '6 months'
       AND NOT EXISTS (SELECT 1 FROM public.clinic_reverifications r WHERE r.clinic_id = v.clinic_id
                        AND (r.status IN ('OPEN','RESPONDED') OR r.requested_at > now() - interval '6 months'))
    ON CONFLICT DO NOTHING
    RETURNING id, clinic_id, deadline_at),
  ev AS (
    INSERT INTO public.verification_events (clinic_id, cycle, event_type, from_status, to_status, actor_user_id, reason)
    SELECT ins.clinic_id, v.cycle, 'REVERIFICATION_REQUESTED', 'APPROVED', 'APPROVED', NULL,
           'Six-monthly document reverification due by ' || to_char(ins.deadline_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') || ' IST'
      FROM ins JOIN public.clinic_verifications v ON v.clinic_id = ins.clinic_id)
  INSERT INTO public.notifications (recipient_user_id, clinic_id, type, title, message, related_entity_type, related_entity_id)
  SELECT c.owner_user_id, c.id, 'REVERIFICATION_DUE', 'Document reverification due',
         'Your clinic''s six-monthly document reverification is due. Upload the required documents and resubmit by ' || to_char(ins.deadline_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') || ' IST at https://careflow-clinic-ai.lovable.app/clinic/verification, or the clinic will be suspended.',
         'clinic_reverification', ins.id
    FROM ins JOIN public.clinics c ON c.id = ins.clinic_id;
END $$;

REVOKE ALL ON FUNCTION private.enforce_reverification(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.run_reverification_maintenance() FROM PUBLIC, anon, authenticated;

-- Submission: overdue requests are enforced first; a timely response needs fresh required documents.
CREATE OR REPLACE FUNCTION public.submit_clinic_verification(p_clinic uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v public.clinic_verifications; c public.clinics; rv public.clinic_reverifications; has_rv boolean := false;
BEGIN
  IF NOT private.has_clinic_role(p_clinic, ARRAY['OWNER'::public.member_role]) THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM public.clinic_verifications WHERE clinic_id = p_clinic FOR UPDATE;
  SELECT * INTO rv FROM public.clinic_reverifications WHERE clinic_id = p_clinic AND status = 'OPEN' FOR UPDATE;
  IF FOUND THEN
    IF rv.deadline_at <= now() THEN PERFORM private.enforce_reverification(rv.id); ELSE has_rv := true; END IF;
  END IF;
  IF v.clinic_id IS NULL OR NOT private.verification_editable(p_clinic) THEN
    RAISE EXCEPTION 'Application cannot be submitted in its current state' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.clinics WHERE id = p_clinic;
  IF c.clinic_type IS NULL OR btrim(coalesce(c.address,'')) = '' OR btrim(coalesce(c.city,'')) = ''
     OR btrim(coalesce(c.state,'')) = '' OR btrim(coalesce(c.representative_name,'')) = '' THEN
    RAISE EXCEPTION 'Missing required clinic details' USING ERRCODE='22023'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.document_requirements r
    WHERE r.clinic_type = c.clinic_type AND r.is_active AND r.is_required
      AND NOT EXISTS (
        SELECT 1 FROM public.clinic_documents d
        JOIN storage.objects o ON o.bucket_id = 'clinic-verification' AND o.name = d.storage_path
        WHERE d.clinic_id = p_clinic AND d.requirement_id = r.id
          AND (o.metadata->>'size')::bigint <= r.max_size_bytes
          AND (o.metadata->>'mimetype') = ANY (r.allowed_mime_types)))
  THEN RAISE EXCEPTION 'Required documents are missing or invalid' USING ERRCODE='22023'; END IF;
  IF has_rv AND EXISTS (
    SELECT 1 FROM public.document_requirements r
    WHERE r.clinic_type = c.clinic_type AND r.is_active AND r.is_required
      AND NOT EXISTS (SELECT 1 FROM public.clinic_documents d WHERE d.clinic_id = p_clinic AND d.requirement_id = r.id
                       AND greatest(d.created_at, d.updated_at) >= rv.requested_at))
  THEN RAISE EXCEPTION 'Required documents must be uploaded again for reverification' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.clinic_documents d WHERE d.clinic_id = p_clinic AND d.review_status = 'NEEDS_REPLACEMENT') THEN
    RAISE EXCEPTION 'Some documents still need to be replaced' USING ERRCODE='22023'; END IF;
  UPDATE public.clinic_verifications
     SET status = 'PENDING_REVIEW', cycle = v.cycle + 1, submitted_at = now(), decided_at = NULL, decided_by = NULL, decision_reason = NULL
   WHERE clinic_id = p_clinic;
  INSERT INTO public.verification_events (clinic_id, cycle, event_type, from_status, to_status, actor_user_id)
  VALUES (p_clinic, v.cycle + 1, 'SUBMITTED', v.status, 'PENDING_REVIEW', (SELECT auth.uid()));
  IF has_rv THEN UPDATE public.clinic_reverifications SET status = 'RESPONDED', responded_at = now() WHERE id = rv.id; END IF;
END $$;
REVOKE ALL ON FUNCTION public.submit_clinic_verification(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.submit_clinic_verification(uuid) TO authenticated;

SELECT cron.schedule('careflow-reverification', '17 * * * *', $$SELECT private.run_reverification_maintenance();$$);