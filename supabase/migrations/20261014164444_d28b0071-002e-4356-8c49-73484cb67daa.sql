REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.handle_new_user(), private.protect_clinic_status(), private.protect_platform_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_clinic_action(uuid,text,text), public.clinic_ai_enabled(uuid), public.clinic_is_operational(uuid),
  public.create_additional_clinic(text,text,text,text,text,text,text,text,text,text,text,text),
  public.create_first_clinic(text,text,text,text,text,text,text,text,text,numeric,numeric,text,text,text),
  public.owner_clinic_allowance(), public.register_clinic_document(uuid,uuid,text,text), public.remove_clinic_document(uuid),
  public.review_clinic_document(uuid,document_review_status,text), public.review_clinic_verification(uuid,verification_status,text),
  public.submit_clinic_verification(uuid) FROM service_role, PUBLIC, anon;