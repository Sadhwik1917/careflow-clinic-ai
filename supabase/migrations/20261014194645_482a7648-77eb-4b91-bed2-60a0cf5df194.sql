-- Clients may no longer create notifications; only trusted database workflows insert them.
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
REVOKE INSERT, DELETE ON public.notifications FROM anon, authenticated;

-- Notify the clinic owner of admin decisions recorded in verification history (system reverification events already notify).
CREATE OR REPLACE FUNCTION private.notify_verification_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE owner uuid; t text; m text;
BEGIN
  IF NEW.actor_user_id IS NULL THEN RETURN NEW; END IF;
  CASE NEW.event_type
    WHEN 'APPROVED' THEN t := 'Clinic verification approved'; m := 'Your clinic has been approved.';
    WHEN 'REJECTED' THEN t := 'Clinic verification rejected'; m := coalesce('Reason: ' || NEW.reason, 'Your application was rejected.');
    WHEN 'CHANGES_REQUESTED' THEN t := 'Changes requested on your application'; m := coalesce('Reason: ' || NEW.reason, 'Please update your application.');
    WHEN 'SUSPENDED' THEN t := 'Clinic suspended'; m := coalesce('Reason: ' || NEW.reason, 'Your clinic has been suspended.');
    WHEN 'REVOKED_AFTER_APPROVAL' THEN t := 'Clinic approval revoked'; m := coalesce('Reason: ' || NEW.reason, 'Your clinic approval was revoked.');
    WHEN 'REINSTATED' THEN t := 'Clinic suspension lifted'; m := 'Your clinic suspension has been lifted.';
    ELSE RETURN NEW;
  END CASE;
  SELECT owner_user_id INTO owner FROM public.clinics WHERE id = NEW.clinic_id;
  IF owner IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (recipient_user_id, clinic_id, type, title, message, related_entity_type, related_entity_id)
    VALUES (owner, NEW.clinic_id, 'VERIFICATION_' || NEW.event_type, t, left(m, 1000), 'verification_event', NEW.id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.notify_verification_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_verification_event ON public.verification_events;
CREATE TRIGGER notify_verification_event AFTER INSERT ON public.verification_events
  FOR EACH ROW EXECUTE FUNCTION private.notify_verification_event();

-- Live updates: Realtime respects the existing SELECT policy (recipient or platform admin).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;