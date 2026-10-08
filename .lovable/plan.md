# Clinic Verification: Exact Changes for Review (nothing applied yet)

## Findings from inspection
- **Subscriptions can't be faked by owners.** `clinic_subscriptions`, `subscription_clinics`, `trial_events` and `platform_payments` only have read rules (owner or admin). With row security on and no add/edit rule, every direct write from the app is refused, including by admins. Nothing in this change adds a write rule to them.
- **Operational tables** (patients, appointments, queue_entries, consultations, vitals, prescriptions, prescription_items, invoices, invoice_items, payments, doctor_profiles) each have 4 role-based rules. **These will not be edited or replaced.** Instead, each table gets one extra *restrictive* rule for add, edit and delete. Postgres combines a restrictive rule with the existing ones using AND. So everything that's allowed today keeps the same role logic, plus one new condition: "the clinic is operational, or the user is a platform admin". Reading is untouched.
- **Clinics:** owners can currently edit every field. The verification status is therefore kept in a separate table that nobody can write to directly. While an application is under review, one trigger also locks the clinic details the reviewer is checking.
- **`create_first_clinic`:** the body stays the same apart from new optional fields and inserting a `DRAFT` verification record in the same transaction.

## Safeguards (your list)
| Requirement | How it is enforced |
|---|---|
| Keep the full history | `verification_events` can only be added to. A trigger refuses any edit or delete for everyone. Every submit and decision adds a new row. `clinic_verifications` holds only the *current* state and a `cycle` number that goes up with each resubmission. |
| Status changes only through trusted steps | `clinic_verifications` and `verification_events` have read-only rules and no write rules. They're changed only by `SECURITY DEFINER` functions, which check who the caller is themselves. |
| Missing record means not approved | `clinic_is_operational` looks for `status = 'APPROVED'`, so if there's no record it returns false. The page logic does the same (test included). |
| Gate uses trusted data only | It reads only `clinic_verifications` and `subscription_clinics` → `clinic_subscriptions` (status ACTIVE, or TRIAL_ACTIVE with a trial end date still in the future). Owners can't write to any of these. |
| Upload checks on the server | The bucket has a 10 MB limit and an allowed file-type list. Storage rules check the clinic folder, that the user is the owner, and that the status allows editing. `register_clinic_document` re-checks the stored file's real size and type against the requirement. Document rows can't be written directly. |
| Delete and replace depend on status | They're allowed only when the status is DRAFT, CHANGES_REQUESTED or REJECTED, both in storage and in `remove_clinic_document`. |
| Optional documents | Only rows marked `is_required = true` are needed to submit. GST and trade licence are seeded as optional, and the whole list is marked `provisional = true`. |
| Existing workflows | Creating a clinic and the owner membership are unaffected: those tables get no new rules. Admins get past every new restrictive rule. Nothing on reading changes. |

## Migration SQL
```sql
-- 1. Clinic detail fields (all optional)
ALTER TABLE public.clinics
  ADD COLUMN clinic_type text,
  ADD COLUMN postal_code text,
  ADD COLUMN latitude numeric(9,6),
  ADD COLUMN longitude numeric(9,6),
  ADD COLUMN registration_number text,
  ADD COLUMN representative_name text,
  ADD COLUMN representative_phone text;

-- 2. Status type
CREATE TYPE public.verification_status AS ENUM ('DRAFT','PENDING_REVIEW','CHANGES_REQUESTED','APPROVED','REJECTED');

-- 3. Editable, provisional requirement list
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

-- 4. Current verification state (one per clinic)
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
GRANT SELECT ON public.clinic_verifications TO authenticated;
GRANT ALL ON public.clinic_verifications TO service_role;
ALTER TABLE public.clinic_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY clinic_verifications_select ON public.clinic_verifications FOR SELECT TO authenticated
  USING (private.has_clinic_role(clinic_id, ARRAY['OWNER'::public.member_role]) OR private.is_platform_admin());
CREATE TRIGGER set_clinic_verifications_updated_at BEFORE UPDATE ON public.clinic_verifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Append-only history
CREATE TABLE public.verification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  cycle integer NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('SUBMITTED','APPROVED','CHANGES_REQUESTED','REJECTED')),
  from_status public.verification_status,
  to_status public.verification_status NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES public.profiles(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.verification_events TO authenticated;
GRANT SELECT, INSERT ON public.verification_events TO service_role;
ALTER TABLE public.verification_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY verification_events_select ON public.verification_events FOR SELECT TO authenticated
  USING (private.has_clinic_role(clinic_id, ARRAY['OWNER'::public.member_role]) OR private.is_platform_admin());
CREATE FUNCTION private.block_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Verification history is append-only' USING ERRCODE = '42501'; END $$;
CREATE TRIGGER verification_events_append_only BEFORE UPDATE OR DELETE ON public.verification_events
  FOR EACH ROW EXECUTE FUNCTION private.block_event_mutation();
-- (TRUNCATE also blocked)
CREATE TRIGGER verification_events_no_truncate BEFORE TRUNCATE ON public.verification_events
  FOR EACH STATEMENT EXECUTE FUNCTION private.block_event_mutation();

-- 6. Documents (rows written only by trusted functions)
CREATE TABLE public.clinic_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES public.document_requirements(id),
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
  review_status text NOT NULL DEFAULT 'PENDING' CHECK (review_status IN ('PENDING','ACCEPTED','NEEDS_REPLACEMENT')),
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.clinic_documents TO authenticated;
GRANT ALL ON public.clinic_documents TO service_role;
ALTER TABLE public.clinic_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY clinic_documents_select ON public.clinic_documents FOR SELECT TO authenticated
  USING (private.has_clinic_role(clinic_id, ARRAY['OWNER'::public.member_role]) OR private.is_platform_admin());
CREATE TRIGGER set_clinic_documents_updated_at BEFORE UPDATE ON public.clinic_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Helpers
CREATE FUNCTION private.verification_editable(p_clinic uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.clinic_verifications v WHERE v.clinic_id = p_clinic
                 AND v.status IN ('DRAFT','CHANGES_REQUESTED','REJECTED'));
$$;
CREATE FUNCTION private.clinic_is_operational(p_clinic uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.clinic_verifications v WHERE v.clinic_id = p_clinic AND v.status = 'APPROVED')
     AND EXISTS (SELECT 1 FROM public.subscription_clinics sc
                 JOIN public.clinic_subscriptions s ON s.id = sc.subscription_id
                 WHERE sc.clinic_id = p_clinic
                   AND (s.status = 'ACTIVE' OR (s.status = 'TRIAL_ACTIVE' AND s.trial_end_date > now())));
$$;
-- public wrapper for the app (read-only answer, no data leak beyond a boolean for members/admins)
CREATE FUNCTION public.clinic_is_operational(p_clinic uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (private.is_clinic_member(p_clinic) OR private.is_platform_admin()) AND private.clinic_is_operational(p_clinic);
$$;

-- 8. Lock reviewed clinic fields while PENDING_REVIEW (owners only; admins exempt)
CREATE FUNCTION private.lock_clinic_during_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT private.is_platform_admin()
     AND EXISTS (SELECT 1 FROM public.clinic_verifications v WHERE v.clinic_id = NEW.id AND v.status = 'PENDING_REVIEW')
     AND (NEW.name, NEW.display_name, NEW.clinic_type, NEW.address, NEW.city, NEW.state, NEW.postal_code,
          NEW.registration_number, NEW.representative_name, NEW.representative_phone, NEW.latitude, NEW.longitude)
         IS DISTINCT FROM
         (OLD.name, OLD.display_name, OLD.clinic_type, OLD.address, OLD.city, OLD.state, OLD.postal_code,
          OLD.registration_number, OLD.representative_name, OLD.representative_phone, OLD.latitude, OLD.longitude)
  THEN RAISE EXCEPTION 'Clinic details are locked while under review' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lock_clinic_during_review BEFORE UPDATE ON public.clinics FOR EACH ROW EXECUTE FUNCTION private.lock_clinic_during_review();

-- 9. create_first_clinic: same body + new optional fields + DRAFT verification row in same transaction
--    (public wrapper re-created with the extra optional params; old 7-arg signature dropped)
--    ... full body identical to the current one, with these additions:
--      INSERT INTO public.clinics (..., clinic_type, postal_code, latitude, longitude,
--                                  registration_number, representative_name, representative_phone)
--      INSERT INTO public.clinic_verifications (clinic_id) VALUES (v_clinic);
-- Backfill for any existing clinic (currently 0):
INSERT INTO public.clinic_verifications (clinic_id) SELECT id FROM public.clinics ON CONFLICT DO NOTHING;

-- 10. Trusted document functions
CREATE FUNCTION public.register_clinic_document(p_clinic uuid, p_requirement uuid, p_path text, p_file_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_req public.document_requirements; v_obj record; v_id uuid;
BEGIN
  IF NOT private.has_clinic_role(p_clinic, ARRAY['OWNER'::public.member_role]) THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF NOT private.verification_editable(p_clinic) THEN RAISE EXCEPTION 'Documents are locked for this application' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_req FROM public.document_requirements r JOIN public.clinics c ON c.id = p_clinic
    WHERE r.id = p_requirement AND r.is_active AND r.clinic_type = c.clinic_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown document type for this clinic' USING ERRCODE='22023'; END IF;
  IF split_part(p_path, '/', 1) <> p_clinic::text THEN RAISE EXCEPTION 'Invalid path' USING ERRCODE='22023'; END IF;
  SELECT (metadata->>'size')::bigint AS size, metadata->>'mimetype' AS mime INTO v_obj
    FROM storage.objects WHERE bucket_id = 'clinic-verification' AND name = p_path AND owner_id = (SELECT auth.uid())::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'Uploaded file not found' USING ERRCODE='22023'; END IF;
  IF v_obj.size > v_req.max_size_bytes THEN RAISE EXCEPTION 'File too large' USING ERRCODE='22023'; END IF;
  IF NOT (v_obj.mime = ANY (v_req.allowed_mime_types)) THEN RAISE EXCEPTION 'File type not allowed' USING ERRCODE='22023'; END IF;
  INSERT INTO public.clinic_documents (clinic_id, requirement_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  VALUES (p_clinic, p_requirement, p_path, left(btrim(p_file_name), 200), v_obj.mime, v_obj.size, (SELECT auth.uid()))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE FUNCTION public.remove_clinic_document(p_document uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_doc public.clinic_documents;
BEGIN
  SELECT * INTO v_doc FROM public.clinic_documents WHERE id = p_document;
  IF NOT FOUND OR NOT private.has_clinic_role(v_doc.clinic_id, ARRAY['OWNER'::public.member_role]) THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF NOT private.verification_editable(v_doc.clinic_id) THEN RAISE EXCEPTION 'Documents are locked for this application' USING ERRCODE='42501'; END IF;
  DELETE FROM public.clinic_documents WHERE id = p_document;
  RETURN v_doc.storage_path;  -- client then deletes the file; storage rule enforces the same status gate
END $$;

CREATE FUNCTION public.review_clinic_document(p_document uuid, p_status text, p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_platform_admin() THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('PENDING','ACCEPTED','NEEDS_REPLACEMENT') THEN RAISE EXCEPTION 'Invalid status' USING ERRCODE='22023'; END IF;
  UPDATE public.clinic_documents SET review_status = p_status, review_note = nullif(btrim(p_note), '') WHERE id = p_document;
END $$;

-- 11. Submit (owner) and review (admin)
CREATE FUNCTION public.submit_clinic_verification(p_clinic uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.clinic_verifications; c public.clinics;
BEGIN
  IF NOT private.has_clinic_role(p_clinic, ARRAY['OWNER'::public.member_role]) THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM public.clinic_verifications WHERE clinic_id = p_clinic FOR UPDATE;  -- serialises double submits
  IF NOT FOUND OR v.status NOT IN ('DRAFT','CHANGES_REQUESTED','REJECTED') THEN RAISE EXCEPTION 'Application cannot be submitted in its current state' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.clinics WHERE id = p_clinic;
  IF c.clinic_type IS NULL OR btrim(coalesce(c.address,'')) = '' OR btrim(coalesce(c.city,'')) = ''
     OR btrim(coalesce(c.state,'')) = '' OR btrim(coalesce(c.representative_name,'')) = '' THEN
    RAISE EXCEPTION 'Missing required clinic details' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.document_requirements r WHERE r.clinic_type = c.clinic_type AND r.is_active AND r.is_required
             AND NOT EXISTS (SELECT 1 FROM public.clinic_documents d WHERE d.clinic_id = p_clinic AND d.requirement_id = r.id)) THEN
    RAISE EXCEPTION 'Required documents are missing' USING ERRCODE='22023'; END IF;
  UPDATE public.clinic_verifications SET status = 'PENDING_REVIEW', cycle = v.cycle + 1, submitted_at = now(),
    decided_at = NULL, decided_by = NULL, decision_reason = NULL WHERE clinic_id = p_clinic;   -- current state only;
  INSERT INTO public.verification_events (clinic_id, cycle, event_type, from_status, to_status, actor_user_id)
  VALUES (p_clinic, v.cycle + 1, 'SUBMITTED', v.status, 'PENDING_REVIEW', (SELECT auth.uid()));  -- earlier decisions stay in events
END $$;

CREATE FUNCTION public.review_clinic_verification(p_clinic uuid, p_decision public.verification_status, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.clinic_verifications; r text := nullif(btrim(p_reason), '');
BEGIN
  IF NOT private.is_platform_admin() THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF p_decision NOT IN ('APPROVED','CHANGES_REQUESTED','REJECTED') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
  IF p_decision <> 'APPROVED' AND r IS NULL THEN RAISE EXCEPTION 'A reason is required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v FROM public.clinic_verifications WHERE clinic_id = p_clinic FOR UPDATE;
  IF NOT FOUND OR v.status <> 'PENDING_REVIEW' THEN RAISE EXCEPTION 'Only pending applications can be reviewed' USING ERRCODE='42501'; END IF;
  UPDATE public.clinic_verifications SET status = p_decision, decided_at = now(), decided_by = (SELECT auth.uid()), decision_reason = r
    WHERE clinic_id = p_clinic;
  INSERT INTO public.verification_events (clinic_id, cycle, event_type, from_status, to_status, actor_user_id, reason)
  VALUES (p_clinic, v.cycle, p_decision::text, 'PENDING_REVIEW', p_decision, (SELECT auth.uid()), r);
END $$;

REVOKE EXECUTE ON FUNCTION public.register_clinic_document, public.remove_clinic_document, public.review_clinic_document,
  public.submit_clinic_verification, public.review_clinic_verification, public.clinic_is_operational FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_clinic_document, public.remove_clinic_document, public.review_clinic_document,
  public.submit_clinic_verification, public.review_clinic_verification, public.clinic_is_operational TO authenticated;

-- 12. Operational gate: ADDITIONAL restrictive policies; existing policies untouched
--    For each T in (patients, appointments, queue_entries, consultations, vitals, prescriptions, invoices, payments, doctor_profiles):
CREATE POLICY T_operational_insert ON public.T AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(clinic_id));
CREATE POLICY T_operational_update ON public.T AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (private.is_platform_admin() OR private.clinic_is_operational(clinic_id))
  WITH CHECK (private.is_platform_admin() OR private.clinic_is_operational(clinic_id));
CREATE POLICY T_operational_delete ON public.T AS RESTRICTIVE FOR DELETE TO authenticated
  USING (private.is_platform_admin() OR private.clinic_is_operational(clinic_id));
--    prescription_items / invoice_items: same three, using the parent's clinic_id via EXISTS on prescriptions / invoices.

-- 13. Provisional starter list (types: GENERAL, SPECIALTY, DENTAL, DIAGNOSTIC, OTHER), all provisional = true:
--   ESTABLISHMENT_REGISTRATION  "Clinical establishment registration or licence"  required
--   GST_CERTIFICATE             "GST registration certificate (if registered)"    optional
--   TRADE_LICENCE               "Trade / local establishment licence (if applicable)" optional
--   OTHER_SUPPORTING            "Other supporting document"                        optional
```

## Storage
- **Bucket `clinic-verification`:** created with the bucket tool; private, 10 MB limit, only `application/pdf`, `image/jpeg` and `image/png` allowed.
```sql
CREATE POLICY cv_owner_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'clinic-verification' AND (
    private.is_platform_admin() OR
    private.has_clinic_role(((storage.foldername(name))[1])::uuid, ARRAY['OWNER'::public.member_role])));
CREATE POLICY cv_owner_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'clinic-verification'
  AND private.has_clinic_role(((storage.foldername(name))[1])::uuid, ARRAY['OWNER'::public.member_role])
  AND private.verification_editable(((storage.foldername(name))[1])::uuid));
CREATE POLICY cv_owner_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'clinic-verification' AND owner_id = (SELECT auth.uid())::text
  AND private.has_clinic_role(((storage.foldername(name))[1])::uuid, ARRAY['OWNER'::public.member_role])
  AND private.verification_editable(((storage.foldername(name))[1])::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.clinic_documents d WHERE d.storage_path = name)); -- must unregister first
-- No UPDATE policy: replacing a file means removing it and uploading a new one, so a submitted file can't be overwritten in place.
```
Admins view files through 5-minute signed links created in the browser using their own session (the read rule above allows it). No service key is used.

## Affected existing rules
- **Not changed:** every existing rule and trigger. Added: 33 restrictive rules (11 tables × add/edit/delete) and 1 new trigger on `clinics` (`lock_clinic_during_review`). `create_first_clinic` is re-created with extra optional inputs. Its eligibility checks, lock and trusted owner insert stay word for word.

## Planned tests
**Automated (Vitest):**
- The submit checklist flags missing required details and required documents, and ignores optional documents.
- GST is never required unless it's set as required.
- File type and size checks before upload.
- Status → allowed owner actions and pages: no record, DRAFT, PENDING, CHANGES_REQUESTED, APPROVED, REJECTED. "No record" counts as not approved.
- The clinic guard sends a non-operational clinic to the verification or plans page.
- Plans are hidden unless the status is APPROVED.
- All 22 existing tests still pass.

**Database checks (SQL, inside a rolled-back transaction with a simulated user):**
- A non-admin calling `review_clinic_verification` is refused.
- Direct add or edit on `clinic_verifications`, `verification_events` and `clinic_subscriptions` is refused.
- Editing or deleting `verification_events` is refused.
- Submit is refused if a required document is missing.
- Resubmitting after a rejection keeps the earlier events.
- `clinic_is_operational` is false with no record, and false when approved without a subscription.
- An operational add (patients) is refused for an owner whose clinic isn't operational.
- Owner B can't read clinic A's document rows or files.

**Untested with real accounts:** real uploads in a browser, admin review (there is no admin yet) and plan enrollment (no payment provider).

## Not included
No admin is set up, no payments, no simulated subscriptions, and no work on doctor, staff, patient, appointment or billing features.
