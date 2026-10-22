CREATE OR REPLACE FUNCTION private.audit_patient_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE changed jsonb;
BEGIN
 IF TG_OP = 'UPDATE' THEN
  SELECT coalesce(jsonb_agg(n.key), '[]'::jsonb) INTO changed
  FROM jsonb_each(to_jsonb(NEW)) n
  WHERE n.key NOT IN ('updated_at','created_at') AND n.value IS DISTINCT FROM to_jsonb(OLD)->n.key;
  IF changed = '[]'::jsonb THEN RETURN NEW; END IF;
 ELSE changed := '[]'::jsonb;
 END IF;
 INSERT INTO public.audit_logs(clinic_id,user_id,action,entity_type,entity_id,metadata)
 VALUES(NEW.clinic_id,auth.uid(),CASE WHEN TG_OP='INSERT' THEN 'PATIENT_CREATED' ELSE 'PATIENT_UPDATED' END,'PATIENT',NEW.id,jsonb_build_object('changed_fields',changed));
 RETURN NEW;
END; $fn$;
REVOKE ALL ON FUNCTION private.audit_patient_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_patient_change AFTER INSERT OR UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION private.audit_patient_change();