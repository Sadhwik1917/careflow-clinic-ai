# Clinic Verification: Revised Proposal (nothing applied)

## Privilege audit (read from the live database)
| Function | Runs with owner rights | anon can run | signed-in users can run | Notes |
|---|---|---|---|---|
| private.create_first_clinic(7×text) | yes | no | yes | replaced by the 14-input version below |
| public.create_first_clinic(7×text) | no (runs as caller) | no | yes | replaced |
| private.has_clinic_role / is_clinic_member / is_patient_for_clinic / is_platform_admin | yes | no | yes | needed by existing rules; unchanged |
| private.protect_clinic_owner / protect_clinic_owner_membership / validate_clinic_relationships / prevent_clinic_reassignment | yes/no | no | no | trigger-only; unchanged |
| **private.handle_new_user, private.protect_platform_role** | yes | PUBLIC default | yes | **Existing finding, not changed:** these are trigger functions, so Postgres refuses to run them directly ("trigger functions can only be called as triggers"), and anon has no access to `private` anyway. Low risk; I can lock them down separately if you approve. |
| public.set_updated_at | no | yes | yes | trigger-only; unchanged |

- **anon:** has no access to the `private` schema at all. Signed-in users do have access, which the existing security rules need.
- **New functions:** every new function has the default PUBLIC/anon run permission removed (section 10). The two trigger-only helpers can't be run by anyone. Only the helpers that security rules evaluate as the signed-in user (`verification_editable`, `clinic_is_operational`, `safe_uuid`) and the five actions are granted to signed-in users.
- **Each action checks the caller itself:** submit, register and remove require an active OWNER membership; reviews require an active PLATFORM_ADMIN. Since no one can be an admin through sign-up, nobody can review today.
- **Small leak (acceptable):** signed-in users can call `private.clinic_is_operational(any id)` and learn only true or false. The public wrapper returns false unless the caller is a member or admin.

## Direct-write audit
- **`clinic_verifications`, `verification_events`, `clinic_documents`:** these tables have **no add, edit or delete permission granted to anon or signed-in users at all**. That's on top of row security having no write rules. Only the owner-rights functions write to them.
- **Verification history:** edits, deletes and table wipes are refused by a trigger, even for the service role. A clinic with history can't be deleted out from under it (`ON DELETE RESTRICT`).
- **Subscription tables:** `clinic_subscriptions`, `subscription_clinics`, `trial_events` and `platform_payments` are unchanged and still read-only. `clinic_is_operational` reads only these and `clinic_verifications`.
- **Missing record = not approved:** the check looks for `status = 'APPROVED'`, so if there is no record the answer is false.

## Documents: one current document per requirement
- Enforced by `UNIQUE (clinic_id, requirement_id)`. Replacing one is a single database step: `register_clinic_document` swaps the row and resets the review to PENDING.
- **Order of operations, so a failure never leaves the records wrong:**
  1. Upload the file to `{clinic}/{requirement}/{random}`. If this fails, nothing changes.
  2. Register it (one transaction). If this fails, the new file has no record; the owner can delete it, and the page clears unrecorded files the next time it loads.
  3. Delete the old file (path returned in step 2). If this fails, the old file has no record and is cleared the same way.
- **The records always point at an existing, valid file.** Reviewers only see recorded files. A recorded file **can't** be deleted from storage, and no file can be overwritten in place.
- **Submit checks** that each required document has a record, that its file still exists, and that the size and type still match. It also refuses while **any** document (required or optional) is marked NEEDS_REPLACEMENT. Approval is also refused while any document is flagged.
- **Details locked:** clinic details being reviewed are locked while the application is pending and after approval (admins exempt). Display name, phone, email and logo stay editable.

## Ownership column for each of the 11 operational tables (from the live schema)
| Table | Column linking it to a clinic |
|---|---|
| patients, appointments, queue_entries, consultations, vitals, prescriptions, invoices, payments, doctor_profiles | `clinic_id` (NOT NULL) |
| prescription_items | `prescription_id` → `prescriptions.clinic_id` |
| invoice_items | `invoice_id` → `invoices.clinic_id` |

The existing 44 rules on these tables are **not modified**. 33 restrictive rules are added; Postgres requires them *in addition to* the existing ones. Reading is unaffected. Admins are exempt.

## `create_first_clinic` and where the app calls it
- **Only call site:** `src/routes/_authenticated/setup-clinic.tsx:54` (`supabase.rpc("create_first_clinic", args)`).
- **Old version:** the 7-input versions in `public` and `private` are dropped. The new versions add 7 more inputs, all optional. Existing calls keep working unchanged.
- **Kept word for word:** the eligibility checks, the per-user lock, code generation and retries, and the trusted owner insert.
- **Added:** a check of the clinic type, the new fields, and a `DRAFT` verification record in the same transaction.

## Tests
- **Run so far: none against these changes.** I can't run any of this without applying it. The sandbox has no direct database access, and the read-only query tool refuses structure changes.
- **Option:** with your OK, I run the full SQL inside `BEGIN … ROLLBACK` as a dry run. Each check from the list below is simulated as an owner, an unrelated owner, and a signed-in non-admin, then rolled back. Nothing is kept.
- **Planned checks:**
  - Non-admin review → refused.
  - Direct add or edit on `clinic_verifications`, `clinic_documents`, `verification_events` and `clinic_subscriptions` → refused.
  - Edit or delete of an event → refused.
  - Submit with no required document → refused; with a flagged document → refused.
  - Resubmit after a rejection → earlier events kept.
  - Operational add on `patients` / `invoice_items` for a non-operational clinic → refused.
  - Owner B reading clinic A's documents → 0 rows.
  - `clinic_is_operational` with no record → false.
  - `create_first_clinic` still refuses an ineligible user.
- **Automated (Vitest), after approval:** submit checklist (required vs optional, GST never required by default), file type and size checks, status → allowed pages (including "no record"), plus the existing 22 tests.

## Full SQL
```sql
-- ===== 0. Clinic detail fields (optional) =====
ALTER TABLE public.clinics
  ADD COLUMN clinic_type text,
  ADD COLUMN postal_code text,
  ADD COLUMN latitude numeric(9,6) CHECK (latitude BETWEEN -90 AND 90),
  ADD COLUMN longitude numeric(9,6) CHECK (longitude BETWEEN -180 AND 180),
  ADD COLUMN registration_number text,
  ADD COLUMN representative_name text,
  ADD COLUMN representative_phone text;

CREATE TYPE public.verification_status AS ENUM ('DRAFT','PENDING_REVIEW','CHANGES_REQUESTED','APPROVED','REJECTED');
CREATE TYPE public.document_review_status AS ENUM ('PENDING','ACCEPTED','NEEDS_REPLACEMENT');

-- ===== 1. Provisional, admin-editable requirement list =====
CREATE TABLE public.document_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_type text NOT NULL,
  doc_key text NOT NULL,
  label text NOT NULL,
  description text,
  is_required boolean NOT NULL DEFAULT false,
  allowed_mime_types text[] NOT NULL DEFAULT ARRAY['application/pdf','image/jpeg','image/png'],
  max_size_bytes integer NOT NULL DEFAULT 10485760 CHECK (max_size_bytes BETWEEN 1 AND 10485760),
  provisional boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_type, doc_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_requirements TO authenticated;
GRANT ALL ON public.document_requirements TO service_role;
ALTER TABLE public.document_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY doc_req_select ON public.document_requirements FOR SELECT TO authenticated USING (is_active OR private.is_platform_admin());
CREATE POLICY doc_req_admin_insert ON public.document_requirements FOR INSERT TO authenticated WITH CHECK (private.is_platform_admin());
CREATE POLICY doc_req_admin_update ON public.document_requirements FOR UPDATE TO authenticated USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());
CREATE POLICY doc_req_admin_delete ON public.document_requirements FOR DELETE TO authenticated USING (private.is_platform_admin());
CREATE TRIGGER set_document_requirements_updated_at BEFORE UPDATE ON public.document_requirements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2. Current verification state: read-only to every app role =====
CREATE TABLE public.clinic_verifications (
  clinic_id uuid PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  status public.verification_status NOT NULL DEFAULT 'DRAFT',
  cycle integer NOT NULL DEFAULT 0,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid REFERENCES public.profiles(id),
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.clinic_verifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.clinic_verifications TO authenticated;      -- no INSERT/UPDATE/DELETE grant at all
GRANT ALL ON public.clinic_verifications TO service_role;
ALTER TABLE public.clinic_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY clinic_verifications_select ON public.clinic_verifications FOR SELECT TO authenticated
  USING (private.has_clinic_role(clinic_id, ARRAY['OWNER'::public.member_role]) OR private.is_platform_admin());
CREATE TRIGGER set_clinic_verifications_updated_at BEFORE UPDATE ON public.clinic_verifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 3. Append-only decision history =====
CREATE TABLE public.verification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,   -- history can't be cascaded away
  cycle integer NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('SUBMITTED','APPROVED','CHANGES_REQUESTED','REJECTED')),
  from_status public.verification_status,
  to_status public.verification_status NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES public.profiles(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.verification_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.verification_events TO authenticated;
GRANT SELECT, INSERT ON public.verification_events TO service_role;
ALTER TABLE public.verification_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY verification_events_select ON public.verification_events FOR SELECT TO authenticated
  USING (private.has_clinic_role(clinic_id, ARRAY['OWNER'::public.member_role]) OR private.is_platform_admin());
CREATE FUNCTION private.block_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Verification history is append-only' USING ERRCODE = '42501'; END $$;
CREATE TRIGGER verification_events_append_only BEFORE UPDATE OR DELETE ON public.verification_events
  FOR EACH ROW EXECUTE FUNCTION private.block_event_mutation();
CREATE TRIGGER verification_events_no_truncate BEFORE TRUNCATE ON public.verification_events
  FOR EACH STATEMENT EXECUTE FUNCTION private.block_event_mutation();

-- ===== 4. Documents: exactly ONE current document per (clinic, requirement) =====
CREATE TABLE public.clinic_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES public.document_requirements(id),
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
  review_status public.document_review_status NOT NULL DEFAULT 'PENDING',
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, requirement_id)
);
REVOKE ALL ON public.clinic_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.clinic_documents TO authenticated;          -- rows written only by trusted functions
GRANT ALL ON public.clinic_documents TO service_role;
ALTER TABLE public.clinic_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY clinic_documents_select ON public.clinic_documents FOR SELECT TO authenticated
  USING (private.has_clinic_role(clinic_id, ARRAY['OWNER'::public.member_role]) OR private.is_platform_admin());
CREATE TRIGGER set_clinic_documents_updated_at BEFORE UPDATE ON public.clinic_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 5. Private helpers =====
CREATE FUNCTION private.verification_editable(p_clinic uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.clinic_verifications v
                 WHERE v.clinic_id = p_clinic AND v.status IN ('DRAFT','CHANGES_REQUESTED','REJECTED'));
$$;
CREATE FUNCTION private.clinic_is_operational(p_clinic uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.clinic_verifications v WHERE v.clinic_id = p_clinic AND v.status = 'APPROVED')
     AND EXISTS (SELECT 1 FROM public.subscription_clinics sc
                 JOIN public.clinic_subscriptions s ON s.id = sc.subscription_id
                 WHERE sc.clinic_id = p_clinic
                   AND (s.status = 'ACTIVE' OR (s.status = 'TRIAL_ACTIVE' AND s.trial_end_date > now())));
$$;
CREATE FUNCTION private.safe_uuid(p text) RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN RETURN p::uuid; EXCEPTION WHEN others THEN RETURN NULL; END $$;

-- ===== 6. Lock reviewed clinic fields while PENDING_REVIEW (owners; admins exempt) =====
CREATE FUNCTION private.lock_clinic_during_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT private.is_platform_admin()
     AND EXISTS (SELECT 1 FROM public.clinic_verifications v WHERE v.clinic_id = NEW.id AND v.status IN ('PENDING_REVIEW','APPROVED'))
     AND (NEW.name, NEW.clinic_type, NEW.address, NEW.city, NEW.state, NEW.postal_code, NEW.registration_number,
          NEW.representative_name, NEW.representative_phone, NEW.latitude, NEW.longitude)
         IS DISTINCT FROM
         (OLD.name, OLD.clinic_type, OLD.address, OLD.city, OLD.state, OLD.postal_code, OLD.registration_number,
          OLD.representative_name, OLD.representative_phone, OLD.latitude, OLD.longitude)
  THEN RAISE EXCEPTION 'Verified clinic details are locked while under review or after approval' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lock_clinic_during_review BEFORE UPDATE ON public.clinics FOR EACH ROW EXECUTE FUNCTION private.lock_clinic_during_review();

-- ===== 7. create_first_clinic: new signature (replaces the 7-arg one; only call site is setup-clinic.tsx) =====
DROP FUNCTION public.create_first_clinic(text,text,text,text,text,text,text);
DROP FUNCTION private.create_first_clinic(text,text,text,text,text,text,text);
CREATE FUNCTION private.create_first_clinic(
  p_display_name text, p_name text, p_phone text DEFAULT NULL, p_email text DEFAULT NULL, p_address text DEFAULT NULL,
  p_city text DEFAULT NULL, p_state text DEFAULT NULL, p_clinic_type text DEFAULT NULL, p_postal_code text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL, p_longitude numeric DEFAULT NULL, p_registration_number text DEFAULT NULL,
  p_representative_name text DEFAULT NULL, p_representative_phone text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_user uuid := auth.uid(); v_clinic uuid; v_code text; v_attempt int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('careflow.first_clinic:' || v_user::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'Active profile required' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.clinic_members WHERE user_id = v_user AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'Not eligible: account already has active clinic access' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.clinics WHERE owner_user_id = v_user) THEN
    RAISE EXCEPTION 'Not eligible: account already owns a clinic' USING ERRCODE = '42501'; END IF;
  p_display_name := btrim(coalesce(p_display_name, ''));
  p_name := btrim(coalesce(p_name, ''));
  IF char_length(p_display_name) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Clinic display name must be 1-60 characters' USING ERRCODE = '22023'; END IF;
  IF char_length(p_name) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Clinic name must be 2-120 characters' USING ERRCODE = '22023'; END IF;
  IF p_clinic_type IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.document_requirements WHERE clinic_type = p_clinic_type AND is_active) THEN
    RAISE EXCEPTION 'Unknown clinic type' USING ERRCODE = '22023'; END IF;
  LOOP
    v_attempt := v_attempt + 1;
    v_code := 'CF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    BEGIN
      INSERT INTO public.clinics (owner_user_id, name, display_name, clinic_code, phone, email, address, city, state,
        clinic_type, postal_code, latitude, longitude, registration_number, representative_name, representative_phone)
      VALUES (v_user, p_name, p_display_name, v_code, nullif(btrim(p_phone), ''), nullif(btrim(p_email), ''),
        nullif(btrim(p_address), ''), nullif(btrim(p_city), ''), nullif(btrim(p_state), ''),
        p_clinic_type, nullif(btrim(p_postal_code), ''), p_latitude, p_longitude, nullif(btrim(p_registration_number), ''),
        nullif(btrim(p_representative_name), ''), nullif(btrim(p_representative_phone), ''))
      RETURNING id INTO v_clinic;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN RAISE EXCEPTION 'Could not generate a unique clinic code'; END IF;
    END;
  END LOOP;
  PERFORM set_config('careflow.trusted_owner_insert', v_clinic::text, true);
  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, joined_at) VALUES (v_clinic, v_user, 'OWNER', 'ACTIVE', now());
  PERFORM set_config('careflow.trusted_owner_insert', '', true);
  INSERT INTO public.clinic_verifications (clinic_id) VALUES (v_clinic);          -- new: DRAFT, same transaction
  RETURN v_clinic;
END $function$;
CREATE FUNCTION public.create_first_clinic(
  p_display_name text, p_name text, p_phone text DEFAULT NULL, p_email text DEFAULT NULL, p_address text DEFAULT NULL,
  p_city text DEFAULT NULL, p_state text DEFAULT NULL, p_clinic_type text DEFAULT NULL, p_postal_code text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL, p_longitude numeric DEFAULT NULL, p_registration_number text DEFAULT NULL,
  p_representative_name text DEFAULT NULL, p_representative_phone text DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.create_first_clinic(p_display_name, p_name, p_phone, p_email, p_address, p_city, p_state, p_clinic_type,
    p_postal_code, p_latitude, p_longitude, p_registration_number, p_representative_name, p_representative_phone);
$$;
INSERT INTO public.clinic_verifications (clinic_id) SELECT id FROM public.clinics ON CONFLICT DO NOTHING;  -- backfill (0 rows today)

-- ===== 8. Trusted document functions =====
-- Path convention enforced: {clinic_id}/{requirement_id}/{random}.{ext}
CREATE FUNCTION public.register_clinic_document(p_clinic uuid, p_requirement uuid, p_path text, p_file_name text)
RETURNS text  -- returns the PREVIOUS storage path when this replaced a document (client deletes that object), else NULL
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_req public.document_requirements; v_size bigint; v_mime text; v_old text;
BEGIN
  IF NOT private.has_clinic_role(p_clinic, ARRAY['OWNER'::public.member_role]) THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.clinic_verifications WHERE clinic_id = p_clinic FOR UPDATE;   -- serialise with submit/review
  IF NOT private.verification_editable(p_clinic) THEN RAISE EXCEPTION 'Documents are locked for this application' USING ERRCODE='42501'; END IF;
  SELECT r.* INTO v_req FROM public.document_requirements r JOIN public.clinics c ON c.id = p_clinic
   WHERE r.id = p_requirement AND r.is_active AND r.clinic_type = c.clinic_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown document type for this clinic' USING ERRCODE='22023'; END IF;
  IF split_part(p_path, '/', 1) <> p_clinic::text OR split_part(p_path, '/', 2) <> p_requirement::text OR split_part(p_path, '/', 4) <> '' THEN
    RAISE EXCEPTION 'Invalid document path' USING ERRCODE='22023'; END IF;
  SELECT (o.metadata->>'size')::bigint, o.metadata->>'mimetype' INTO v_size, v_mime
    FROM storage.objects o WHERE o.bucket_id = 'clinic-verification' AND o.name = p_path AND o.owner_id = (SELECT auth.uid())::text;
  IF NOT FOUND OR v_size IS NULL THEN RAISE EXCEPTION 'Uploaded file not found' USING ERRCODE='22023'; END IF;
  IF v_size > v_req.max_size_bytes THEN RAISE EXCEPTION 'File too large' USING ERRCODE='22023'; END IF;
  IF NOT (v_mime = ANY (v_req.allowed_mime_types)) THEN RAISE EXCEPTION 'File type not allowed' USING ERRCODE='22023'; END IF;
  SELECT storage_path INTO v_old FROM public.clinic_documents WHERE clinic_id = p_clinic AND requirement_id = p_requirement FOR UPDATE;
  INSERT INTO public.clinic_documents (clinic_id, requirement_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  VALUES (p_clinic, p_requirement, p_path, left(btrim(coalesce(p_file_name,'document')), 200), v_mime, v_size, (SELECT auth.uid()))
  ON CONFLICT (clinic_id, requirement_id) DO UPDATE
    SET storage_path = EXCLUDED.storage_path, file_name = EXCLUDED.file_name, mime_type = EXCLUDED.mime_type,
        size_bytes = EXCLUDED.size_bytes, uploaded_by = EXCLUDED.uploaded_by, review_status = 'PENDING', review_note = NULL;
  RETURN v_old;
END $$;

CREATE FUNCTION public.remove_clinic_document(p_document uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_doc public.clinic_documents;
BEGIN
  SELECT * INTO v_doc FROM public.clinic_documents WHERE id = p_document;
  IF NOT FOUND OR NOT private.has_clinic_role(v_doc.clinic_id, ARRAY['OWNER'::public.member_role]) THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.clinic_verifications WHERE clinic_id = v_doc.clinic_id FOR UPDATE;
  IF NOT private.verification_editable(v_doc.clinic_id) THEN RAISE EXCEPTION 'Documents are locked for this application' USING ERRCODE='42501'; END IF;
  DELETE FROM public.clinic_documents WHERE id = p_document;
  RETURN v_doc.storage_path;
END $$;

CREATE FUNCTION public.review_clinic_document(p_document uuid, p_status public.document_review_status, p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_clinic uuid;
BEGIN
  IF NOT private.is_platform_admin() THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  SELECT d.clinic_id INTO v_clinic FROM public.clinic_documents d WHERE d.id = p_document;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_verifications WHERE clinic_id = v_clinic AND status = 'PENDING_REVIEW') THEN
    RAISE EXCEPTION 'Only documents in a pending application can be reviewed' USING ERRCODE='42501'; END IF;
  IF p_status = 'NEEDS_REPLACEMENT' AND nullif(btrim(p_note), '') IS NULL THEN RAISE EXCEPTION 'A note is required' USING ERRCODE='22023'; END IF;
  UPDATE public.clinic_documents SET review_status = p_status, review_note = nullif(btrim(p_note), '') WHERE id = p_document;
END $$;

-- ===== 9. Submit (owner) / review (admin) =====
CREATE FUNCTION public.submit_clinic_verification(p_clinic uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.clinic_verifications; c public.clinics;
BEGIN
  IF NOT private.has_clinic_role(p_clinic, ARRAY['OWNER'::public.member_role]) THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM public.clinic_verifications WHERE clinic_id = p_clinic FOR UPDATE;
  IF NOT FOUND OR v.status NOT IN ('DRAFT','CHANGES_REQUESTED','REJECTED') THEN
    RAISE EXCEPTION 'Application cannot be submitted in its current state' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.clinics WHERE id = p_clinic;
  IF c.clinic_type IS NULL OR btrim(coalesce(c.address,'')) = '' OR btrim(coalesce(c.city,'')) = ''
     OR btrim(coalesce(c.state,'')) = '' OR btrim(coalesce(c.representative_name,'')) = '' THEN
    RAISE EXCEPTION 'Missing required clinic details' USING ERRCODE='22023'; END IF;
  -- every active required requirement must have a current document whose file still exists and still matches the rules
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
  -- any document flagged NEEDS_REPLACEMENT (required or optional) must be replaced or removed first
  IF EXISTS (SELECT 1 FROM public.clinic_documents d WHERE d.clinic_id = p_clinic AND d.review_status = 'NEEDS_REPLACEMENT') THEN
    RAISE EXCEPTION 'Some documents still need to be replaced' USING ERRCODE='22023'; END IF;
  UPDATE public.clinic_verifications
     SET status = 'PENDING_REVIEW', cycle = v.cycle + 1, submitted_at = now(), decided_at = NULL, decided_by = NULL, decision_reason = NULL
   WHERE clinic_id = p_clinic;      -- current-state row only; earlier decisions remain in verification_events
  INSERT INTO public.verification_events (clinic_id, cycle, event_type, from_status, to_status, actor_user_id)
  VALUES (p_clinic, v.cycle + 1, 'SUBMITTED', v.status, 'PENDING_REVIEW', (SELECT auth.uid()));
END $$;

CREATE FUNCTION public.review_clinic_verification(p_clinic uuid, p_decision public.verification_status, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.clinic_verifications; r text := nullif(btrim(p_reason), '');
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT private.is_platform_admin() THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF p_decision NOT IN ('APPROVED','CHANGES_REQUESTED','REJECTED') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
  IF p_decision <> 'APPROVED' AND r IS NULL THEN RAISE EXCEPTION 'A reason is required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v FROM public.clinic_verifications WHERE clinic_id = p_clinic FOR UPDATE;
  IF NOT FOUND OR v.status <> 'PENDING_REVIEW' THEN RAISE EXCEPTION 'Only pending applications can be reviewed' USING ERRCODE='42501'; END IF;
  IF p_decision = 'APPROVED' AND EXISTS (SELECT 1 FROM public.clinic_documents d WHERE d.clinic_id = p_clinic AND d.review_status = 'NEEDS_REPLACEMENT') THEN
    RAISE EXCEPTION 'Cannot approve while documents are flagged for replacement' USING ERRCODE='22023'; END IF;
  UPDATE public.clinic_verifications SET status = p_decision, decided_at = now(), decided_by = (SELECT auth.uid()), decision_reason = r
   WHERE clinic_id = p_clinic;
  INSERT INTO public.verification_events (clinic_id, cycle, event_type, from_status, to_status, actor_user_id, reason)
  VALUES (p_clinic, v.cycle, p_decision::text, 'PENDING_REVIEW', p_decision, (SELECT auth.uid()), r);
END $$;

-- public read-only wrapper for the app's gate (members/admins only; others get false)
CREATE FUNCTION public.clinic_is_operational(p_clinic uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT (private.is_clinic_member(p_clinic) OR private.is_platform_admin()) AND private.clinic_is_operational(p_clinic);
$$;

-- ===== 10. EXECUTE privileges (Postgres grants EXECUTE to PUBLIC by default — revoke everywhere) =====
REVOKE ALL ON FUNCTION private.block_event_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.lock_clinic_during_review() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.safe_uuid(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.verification_editable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.clinic_is_operational(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.create_first_clinic(text,text,text,text,text,text,text,text,text,numeric,numeric,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_first_clinic(text,text,text,text,text,text,text,text,text,numeric,numeric,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_clinic_document(uuid,uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_clinic_document(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_clinic_document(uuid,public.document_review_status,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_clinic_verification(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_clinic_verification(uuid,public.verification_status,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clinic_is_operational(uuid) FROM PUBLIC, anon;
-- authenticated needs the helpers because RLS/Storage policies evaluate as the caller (same as existing has_clinic_role)
GRANT EXECUTE ON FUNCTION private.safe_uuid(text), private.verification_editable(uuid), private.clinic_is_operational(uuid),
  private.create_first_clinic(text,text,text,text,text,text,text,text,text,numeric,numeric,text,text,text),
  public.create_first_clinic(text,text,text,text,text,text,text,text,text,numeric,numeric,text,text,text),
  public.register_clinic_document(uuid,uuid,text,text), public.remove_clinic_document(uuid),
  public.review_clinic_document(uuid,public.document_review_status,text), public.submit_clinic_verification(uuid),
  public.review_clinic_verification(uuid,public.verification_status,text), public.clinic_is_operational(uuid)
  TO authenticated;

-- ===== 11. Operational gate: ADDITIONAL restrictive policies (existing 44 policies untouched) =====
CREATE POLICY patients_operational_insert ON public.patients AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(patients.clinic_id));
CREATE POLICY patients_operational_update ON public.patients AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(patients.clinic_id)) WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(patients.clinic_id));
CREATE POLICY patients_operational_delete ON public.patients AS RESTRICTIVE FOR DELETE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(patients.clinic_id));
CREATE POLICY appointments_operational_insert ON public.appointments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(appointments.clinic_id));
CREATE POLICY appointments_operational_update ON public.appointments AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(appointments.clinic_id)) WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(appointments.clinic_id));
CREATE POLICY appointments_operational_delete ON public.appointments AS RESTRICTIVE FOR DELETE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(appointments.clinic_id));
CREATE POLICY queue_entries_operational_insert ON public.queue_entries AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(queue_entries.clinic_id));
CREATE POLICY queue_entries_operational_update ON public.queue_entries AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(queue_entries.clinic_id)) WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(queue_entries.clinic_id));
CREATE POLICY queue_entries_operational_delete ON public.queue_entries AS RESTRICTIVE FOR DELETE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(queue_entries.clinic_id));
CREATE POLICY consultations_operational_insert ON public.consultations AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(consultations.clinic_id));
CREATE POLICY consultations_operational_update ON public.consultations AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(consultations.clinic_id)) WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(consultations.clinic_id));
CREATE POLICY consultations_operational_delete ON public.consultations AS RESTRICTIVE FOR DELETE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(consultations.clinic_id));
CREATE POLICY vitals_operational_insert ON public.vitals AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(vitals.clinic_id));
CREATE POLICY vitals_operational_update ON public.vitals AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(vitals.clinic_id)) WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(vitals.clinic_id));
CREATE POLICY vitals_operational_delete ON public.vitals AS RESTRICTIVE FOR DELETE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(vitals.clinic_id));
CREATE POLICY prescriptions_operational_insert ON public.prescriptions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(prescriptions.clinic_id));
CREATE POLICY prescriptions_operational_update ON public.prescriptions AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(prescriptions.clinic_id)) WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(prescriptions.clinic_id));
CREATE POLICY prescriptions_operational_delete ON public.prescriptions AS RESTRICTIVE FOR DELETE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(prescriptions.clinic_id));
CREATE POLICY invoices_operational_insert ON public.invoices AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(invoices.clinic_id));
CREATE POLICY invoices_operational_update ON public.invoices AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(invoices.clinic_id)) WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(invoices.clinic_id));
CREATE POLICY invoices_operational_delete ON public.invoices AS RESTRICTIVE FOR DELETE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(invoices.clinic_id));
CREATE POLICY payments_operational_insert ON public.payments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(payments.clinic_id));
CREATE POLICY payments_operational_update ON public.payments AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(payments.clinic_id)) WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(payments.clinic_id));
CREATE POLICY payments_operational_delete ON public.payments AS RESTRICTIVE FOR DELETE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(payments.clinic_id));
CREATE POLICY doctor_profiles_operational_insert ON public.doctor_profiles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(doctor_profiles.clinic_id));
CREATE POLICY doctor_profiles_operational_update ON public.doctor_profiles AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(doctor_profiles.clinic_id)) WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(doctor_profiles.clinic_id));
CREATE POLICY doctor_profiles_operational_delete ON public.doctor_profiles AS RESTRICTIVE FOR DELETE TO authenticated USING (private.is_platform_admin() OR private.clinic_is_operational(doctor_profiles.clinic_id));
CREATE POLICY prescription_items_operational_insert ON public.prescription_items AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.is_platform_admin() OR EXISTS (SELECT 1 FROM public.prescriptions par WHERE par.id = prescription_items.prescription_id AND private.clinic_is_operational(par.clinic_id)));
CREATE POLICY prescription_items_operational_update ON public.prescription_items AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.is_platform_admin() OR EXISTS (SELECT 1 FROM public.prescriptions par WHERE par.id = prescription_items.prescription_id AND private.clinic_is_operational(par.clinic_id))) WITH CHECK (private.is_platform_admin() OR EXISTS (SELECT 1 FROM public.prescriptions par WHERE par.id = prescription_items.prescription_id AND private.clinic_is_operational(par.clinic_id)));
CREATE POLICY prescription_items_operational_delete ON public.prescription_items AS RESTRICTIVE FOR DELETE TO authenticated USING (private.is_platform_admin() OR EXISTS (SELECT 1 FROM public.prescriptions par WHERE par.id = prescription_items.prescription_id AND private.clinic_is_operational(par.clinic_id)));
CREATE POLICY invoice_items_operational_insert ON public.invoice_items AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.is_platform_admin() OR EXISTS (SELECT 1 FROM public.invoices par WHERE par.id = invoice_items.invoice_id AND private.clinic_is_operational(par.clinic_id)));
CREATE POLICY invoice_items_operational_update ON public.invoice_items AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.is_platform_admin() OR EXISTS (SELECT 1 FROM public.invoices par WHERE par.id = invoice_items.invoice_id AND private.clinic_is_operational(par.clinic_id))) WITH CHECK (private.is_platform_admin() OR EXISTS (SELECT 1 FROM public.invoices par WHERE par.id = invoice_items.invoice_id AND private.clinic_is_operational(par.clinic_id)));
CREATE POLICY invoice_items_operational_delete ON public.invoice_items AS RESTRICTIVE FOR DELETE TO authenticated USING (private.is_platform_admin() OR EXISTS (SELECT 1 FROM public.invoices par WHERE par.id = invoice_items.invoice_id AND private.clinic_is_operational(par.clinic_id)));

-- ===== 12. Provisional starter list =====
INSERT INTO public.document_requirements (clinic_type, doc_key, label, description, is_required, sort_order)
SELECT t, k, l, d, req, s FROM unnest(ARRAY['GENERAL','SPECIALTY','DENTAL','DIAGNOSTIC','OTHER']) t
CROSS JOIN (VALUES
  ('ESTABLISHMENT_REGISTRATION','Clinical establishment registration or licence','Provisional – confirm against local rules.', true, 1),
  ('GST_CERTIFICATE','GST registration certificate (if registered)','Optional. Only if your clinic is GST-registered.', false, 2),
  ('TRADE_LICENCE','Trade / local establishment licence (if applicable)','Optional. Depends on your local authority.', false, 3),
  ('OTHER_SUPPORTING','Other supporting document','Optional.', false, 4)
) AS x(k, l, d, req, s);

-- ===== 13. Storage policies (bucket 'clinic-verification' created first via tool: private, 10 MB, pdf/jpeg/png) =====
CREATE POLICY cv_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'clinic-verification' AND (
    private.is_platform_admin()
    OR private.has_clinic_role(private.safe_uuid((storage.foldername(name))[1]), ARRAY['OWNER'::public.member_role])));
CREATE POLICY cv_owner_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'clinic-verification'
  AND array_length(storage.foldername(name), 1) = 2
  AND private.has_clinic_role(private.safe_uuid((storage.foldername(name))[1]), ARRAY['OWNER'::public.member_role])
  AND private.verification_editable(private.safe_uuid((storage.foldername(name))[1]))
  AND EXISTS (SELECT 1 FROM public.document_requirements r JOIN public.clinics c ON c.clinic_type = r.clinic_type
              WHERE c.id = private.safe_uuid((storage.foldername(name))[1])
                AND r.id = private.safe_uuid((storage.foldername(name))[2]) AND r.is_active));
CREATE POLICY cv_owner_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'clinic-verification'
  AND private.has_clinic_role(private.safe_uuid((storage.foldername(name))[1]), ARRAY['OWNER'::public.member_role])
  AND private.verification_editable(private.safe_uuid((storage.foldername(name))[1]))
  AND NOT EXISTS (SELECT 1 FROM public.clinic_documents d WHERE d.storage_path = name));   -- registered files can't be deleted
-- No UPDATE policy: files are never overwritten in place (upsert disabled), so a reviewed file can't silently change.
```
