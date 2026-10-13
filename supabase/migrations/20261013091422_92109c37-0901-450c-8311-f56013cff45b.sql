CREATE TABLE public.trial_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.clinic_subscriptions(id) ON DELETE RESTRICT,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  registration_key text,
  needs_review boolean NOT NULL DEFAULT false,
  note text,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.trial_consumptions TO service_role;
ALTER TABLE public.trial_consumptions ENABLE ROW LEVEL SECURITY;
-- No policies: browsers can't read or write. Only service-role server code and the trusted functions below touch it.
CREATE UNIQUE INDEX trial_consumptions_owner_uq ON public.trial_consumptions (owner_user_id);
CREATE UNIQUE INDEX trial_consumptions_clinic_uq ON public.trial_consumptions (clinic_id);
CREATE UNIQUE INDEX trial_consumptions_reg_uq ON public.trial_consumptions (registration_key) WHERE registration_key IS NOT NULL;
CREATE UNIQUE INDEX trial_consumptions_sub_uq ON public.trial_consumptions (subscription_id);

-- Permanent record: never updated or deleted.
CREATE TRIGGER trial_consumptions_append_only BEFORE UPDATE OR DELETE ON public.trial_consumptions
  FOR EACH ROW EXECUTE FUNCTION private.block_event_mutation();

CREATE OR REPLACE FUNCTION private.registration_key(p text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT nullif(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), '')
$$;
REVOKE ALL ON FUNCTION private.registration_key(text) FROM PUBLIC, anon, authenticated;

-- Consistent, transaction-scoped lock order: owner, then registration key, then clinic.
CREATE OR REPLACE FUNCTION private.lock_trial_keys(p_owner uuid, p_reg text, p_clinic uuid) RETURNS void LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('trial:owner:' || p_owner::text, 0));
  IF p_reg IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('trial:reg:' || p_reg, 0)); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('trial:clinic:' || p_clinic::text, 0));
END $$;
REVOKE ALL ON FUNCTION private.lock_trial_keys(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- Backfill: existing activated trials keep their original owner/clinic/subscription; missing registration is flagged, never invented.
INSERT INTO public.trial_consumptions (subscription_id, clinic_id, owner_user_id, registration_key, needs_review, note, consumed_at)
SELECT DISTINCT ON (te.subscription_id) te.subscription_id, te.clinic_id, s.owner_user_id, private.registration_key(c.registration_number),
       private.registration_key(c.registration_number) IS NULL,
       CASE WHEN private.registration_key(c.registration_number) IS NULL THEN 'Backfilled: clinic had no registration number at backfill time' END,
       te.event_date
FROM public.trial_events te JOIN public.clinic_subscriptions s ON s.id = te.subscription_id JOIN public.clinics c ON c.id = te.clinic_id
WHERE te.event_type = 'TRIAL_STARTED'
ORDER BY te.subscription_id, te.event_date
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION private.trial_consumed(p_owner uuid, p_clinic uuid, p_reg text) RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.trial_consumptions t WHERE t.owner_user_id = p_owner OR t.clinic_id = p_clinic OR (p_reg IS NOT NULL AND t.registration_key = p_reg))
      OR EXISTS (SELECT 1 FROM public.trial_events te JOIN public.clinic_subscriptions s ON s.id = te.subscription_id
                 WHERE te.event_type = 'TRIAL_STARTED' AND (s.owner_user_id = p_owner OR te.clinic_id = p_clinic))
$$;
REVOKE ALL ON FUNCTION private.trial_consumed(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.begin_mandated_trial(p_user uuid, p_clinic uuid, p_plan uuid, p_scope text, p_provider_id text, p_trial_end timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_plan public.plans%ROWTYPE; v_scope text; v_amount numeric; v_id uuid; v_reg text;
BEGIN
  SELECT private.registration_key(registration_number) INTO v_reg FROM public.clinics WHERE id = p_clinic;
  PERFORM private.lock_trial_keys(p_user, v_reg, p_clinic);
  PERFORM 1 FROM public.profiles WHERE id = p_user FOR UPDATE;
  PERFORM 1 FROM public.clinics WHERE id = p_clinic FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_members WHERE clinic_id = p_clinic AND user_id = p_user AND role = 'OWNER' AND status = 'ACTIVE') THEN RAISE EXCEPTION 'TRIAL_NOT_OWNER'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_verifications WHERE clinic_id = p_clinic AND status = 'APPROVED') THEN RAISE EXCEPTION 'TRIAL_NOT_APPROVED'; END IF;
  SELECT private.registration_key(registration_number) INTO v_reg FROM public.clinics WHERE id = p_clinic;
  IF v_reg IS NULL THEN RAISE EXCEPTION 'TRIAL_REGISTRATION_REQUIRED'; END IF;
  SELECT * INTO v_plan FROM public.plans WHERE id = p_plan;
  IF NOT FOUND OR NOT v_plan.is_active OR NOT v_plan.trial_enabled THEN RAISE EXCEPTION 'TRIAL_PLAN_UNAVAILABLE'; END IF;
  IF v_plan.clinic_mode = 'SINGLE_OR_MULTI' THEN
    IF p_scope IS NULL OR p_scope NOT IN ('SINGLE','MULTI') THEN RAISE EXCEPTION 'TRIAL_SCOPE_REQUIRED'; END IF;
    v_scope := p_scope;
  ELSE
    IF p_scope IS NOT NULL AND p_scope <> v_plan.clinic_mode::text THEN RAISE EXCEPTION 'TRIAL_SCOPE_MISMATCH'; END IF;
    v_scope := v_plan.clinic_mode::text;
  END IF;
  IF p_trial_end < now() + interval '20 days 23 hours' OR p_trial_end > now() + interval '21 days 1 hour' THEN RAISE EXCEPTION 'TRIAL_BAD_TIMING'; END IF;
  IF EXISTS (SELECT 1 FROM public.subscription_clinics sc JOIN public.clinic_subscriptions s ON s.id = sc.subscription_id
             WHERE sc.clinic_id = p_clinic AND s.status IN ('PENDING_PAYMENT','ACTIVE','TRIAL_ACTIVE','PAST_DUE')) THEN RAISE EXCEPTION 'TRIAL_CLINIC_HAS_SUBSCRIPTION'; END IF;
  IF private.trial_consumed(p_user, p_clinic, v_reg) THEN RAISE EXCEPTION 'TRIAL_ALREADY_USED'; END IF;
  v_amount := CASE WHEN v_scope = 'MULTI' AND v_plan.multi_price IS NOT NULL THEN v_plan.multi_price ELSE v_plan.price END;
  INSERT INTO public.clinic_subscriptions (owner_user_id, plan_id, status, subscription_type, trial_start_date, trial_end_date, auto_renew,
      billing_cycle, amount, currency, clinic_scope, payment_provider, provider_subscription_id, mandate_status, next_billing_date)
    VALUES (p_user, p_plan, 'PENDING_PAYMENT', 'TRIAL', now(), p_trial_end, true, v_plan.billing_cycle, v_amount, v_plan.currency, v_scope,
      'razorpay', p_provider_id, 'PENDING', p_trial_end)
    RETURNING id INTO v_id;
  INSERT INTO public.subscription_clinics (subscription_id, clinic_id) VALUES (v_id, p_clinic);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_trial_mandate(p_provider_id text, p_mandate_ref text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_row public.clinic_subscriptions%ROWTYPE; v_clinic uuid; v_reg text;
BEGIN
  SELECT * INTO v_row FROM public.clinic_subscriptions WHERE provider_subscription_id = p_provider_id AND payment_provider = 'razorpay';
  IF NOT FOUND THEN RETURN 'UNKNOWN'; END IF;
  SELECT sc.clinic_id, private.registration_key(c.registration_number) INTO v_clinic, v_reg
    FROM public.subscription_clinics sc JOIN public.clinics c ON c.id = sc.clinic_id WHERE sc.subscription_id = v_row.id LIMIT 1;
  PERFORM private.lock_trial_keys(v_row.owner_user_id, v_reg, v_clinic);
  SELECT * INTO v_row FROM public.clinic_subscriptions WHERE id = v_row.id FOR UPDATE;
  IF v_row.subscription_type <> 'TRIAL' OR v_row.status <> 'PENDING_PAYMENT' OR v_row.mandate_status <> 'PENDING' THEN RETURN 'IGNORED'; END IF;
  IF v_reg IS NULL OR private.trial_consumed(v_row.owner_user_id, v_clinic, v_reg) THEN RETURN 'TRIAL_ALREADY_USED'; END IF;
  IF v_row.trial_end_date <= now() THEN RETURN 'TOO_LATE'; END IF;
  BEGIN
    INSERT INTO public.trial_consumptions (subscription_id, clinic_id, owner_user_id, registration_key)
      VALUES (v_row.id, v_clinic, v_row.owner_user_id, v_reg);
  EXCEPTION WHEN unique_violation THEN RETURN 'TRIAL_ALREADY_USED';
  END;
  UPDATE public.clinic_subscriptions SET status = 'TRIAL_ACTIVE', trial_start_date = now(), start_date = now(),
    mandate_status = 'AUTHORIZED', mandate_authorized_at = now(), payment_mandate_id = p_mandate_ref WHERE id = v_row.id;
  INSERT INTO public.trial_events (subscription_id, clinic_id, event_type, event_date, metadata)
    VALUES (v_row.id, v_clinic, 'TRIAL_STARTED', now(), jsonb_build_object('plan_id', v_row.plan_id, 'scope', v_row.clinic_scope, 'mandate', 'AUTHORIZED', 'first_charge_at', v_row.trial_end_date));
  INSERT INTO public.audit_logs (clinic_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (v_clinic, v_row.owner_user_id, 'TRIAL_ACTIVATED', 'clinic_subscription', v_row.id, '{}'::jsonb);
  RETURN 'STARTED';
END $$;

REVOKE ALL ON FUNCTION public.begin_mandated_trial(uuid, uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_trial_mandate(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_mandated_trial(uuid, uuid, uuid, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_trial_mandate(text, text) TO service_role;

-- Once a clinic is approved, only platform admins (or trusted server code) may change its registration number.
CREATE OR REPLACE FUNCTION private.lock_verified_registration() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF NEW.registration_number IS DISTINCT FROM OLD.registration_number
     AND private.registration_key(OLD.registration_number) IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.clinic_verifications v WHERE v.clinic_id = OLD.id AND v.status = 'APPROVED')
     AND (SELECT auth.uid()) IS NOT NULL AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'REGISTRATION_LOCKED' USING ERRCODE = '42501', HINT = 'Contact CAREFLOW support to change a verified registration number.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.lock_verified_registration() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER lock_verified_registration BEFORE UPDATE ON public.clinics FOR EACH ROW EXECUTE FUNCTION private.lock_verified_registration();