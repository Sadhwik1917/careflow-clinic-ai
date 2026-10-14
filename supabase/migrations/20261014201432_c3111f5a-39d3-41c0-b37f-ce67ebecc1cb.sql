CREATE UNIQUE INDEX IF NOT EXISTS notifications_admin_submission_once
  ON public.notifications (recipient_user_id, type, related_entity_id)
  WHERE type IN ('ADMIN_DOCUMENT_UPDATE_SUBMITTED','ADMIN_REVERIFICATION_SUBMITTED');

CREATE OR REPLACE FUNCTION private.notify_admins_document_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cname text; dlabel text;
BEGIN
  SELECT coalesce(nullif(display_name,''), name) INTO cname FROM public.clinics WHERE id = NEW.clinic_id;
  SELECT label INTO dlabel FROM public.document_requirements WHERE id = NEW.requirement_id;
  INSERT INTO public.notifications (recipient_user_id, clinic_id, type, title, message, related_entity_type, related_entity_id)
  SELECT p.id, NEW.clinic_id, 'ADMIN_DOCUMENT_UPDATE_SUBMITTED', 'Document update submitted',
         format('%s sent a replacement for %s on %s.', cname, coalesce(dlabel,'a document'),
                to_char(NEW.created_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH24:MI "IST"')),
         'clinic_document_update', NEW.id
  FROM public.profiles p WHERE p.platform_role = 'PLATFORM_ADMIN'
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.notify_admins_document_update() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER clinic_document_updates_notify_admins AFTER INSERT ON public.clinic_document_updates
  FOR EACH ROW EXECUTE FUNCTION private.notify_admins_document_update();

CREATE OR REPLACE FUNCTION private.notify_admins_reverification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cname text;
BEGIN
  SELECT coalesce(nullif(display_name,''), name) INTO cname FROM public.clinics WHERE id = NEW.clinic_id;
  INSERT INTO public.notifications (recipient_user_id, clinic_id, type, title, message, related_entity_type, related_entity_id)
  SELECT p.id, NEW.clinic_id, 'ADMIN_REVERIFICATION_SUBMITTED', 'Reverification submitted',
         format('%s resubmitted its documents (all required documents) for six-month reverification on %s.', cname,
                to_char(coalesce(NEW.responded_at, now()) AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH24:MI "IST"')),
         'clinic_reverification', NEW.id
  FROM public.profiles p WHERE p.platform_role = 'PLATFORM_ADMIN'
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.notify_admins_reverification() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER clinic_reverifications_notify_admins AFTER UPDATE OF status ON public.clinic_reverifications
  FOR EACH ROW WHEN (OLD.status = 'OPEN' AND NEW.status = 'RESPONDED')
  EXECUTE FUNCTION private.notify_admins_reverification();