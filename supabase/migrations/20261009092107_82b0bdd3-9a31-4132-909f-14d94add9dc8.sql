DROP POLICY cv_owner_insert ON storage.objects;
CREATE POLICY cv_owner_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'clinic-verification'
  AND array_length(storage.foldername(name), 1) = 2
  AND private.has_clinic_role(private.safe_uuid((storage.foldername(name))[1]), ARRAY['OWNER'::public.member_role])
  AND private.verification_editable(private.safe_uuid((storage.foldername(name))[1]))
  AND EXISTS (SELECT 1 FROM public.document_requirements r JOIN public.clinics c ON c.clinic_type = r.clinic_type
    WHERE c.id = private.safe_uuid((storage.foldername(objects.name))[1])
      AND r.id = private.safe_uuid((storage.foldername(objects.name))[2]) AND r.is_active)
);