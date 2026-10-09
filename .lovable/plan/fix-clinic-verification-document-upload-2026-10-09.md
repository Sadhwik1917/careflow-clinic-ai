# Fix clinic verification document upload

## Root cause (confirmed)
- Bucket `clinic-verification` exists and is private. Upload path `<clinicId>/<requirementId>/<uuid>.pdf` matches what the policies expect.
- The preview's network log shows all 5 upload attempts (09:16 UTC) returned **400** from Storage. Folder listing (SELECT policy) returned 200, so the user is signed in and recognised as the owner.
- The Storage INSERT policy `cv_owner_insert` has a column-name clash. Inside its `EXISTS (... JOIN clinics c ...)` check, the unqualified `name` resolved to **`clinics.name`** (the clinic's name), not to the uploaded file's path. The stored policy reads `storage.foldername(c.name)`. That never matches a clinic id, so every upload is refused by the security rule. The UI then shows the generic "Upload failed" message.

## Fix
1. Database migration (the one change to a security rule, limited to the broken check): drop and recreate `cv_owner_insert` with the same rules, but qualify the path as `objects.name` inside the EXISTS. No other policies, tables or functions change.
2. In `src/routes/_authenticated/clinic.verification.tsx`, log upload, register, remove and submit errors with `console.error`. Logs include the step, the Storage status code and the error message only, with no file contents or clinic details.
3. In `src/lib/verification.ts`, add `uploadErrorMessage(error)`. It maps errors to clear messages:
   - security refusal or 403: "You can't upload documents for this clinic right now (application locked or not the owner)."
   - file too large or 413: the size-limit message
   - unsupported type: "Use a PDF, JPG or PNG file."
   - already exists or network failure: retry guidance
   - anything else: the generic message.
4. Add unit tests for `uploadErrorMessage`.

## Verification
- Before and after the migration, read back the policy definition to confirm it now says `objects.name`.
- Run the existing tests plus the new ones.
- Test an upload end to end in the browser as the owner account, then confirm the document row appears. If the session can't be minted, say clearly that the upload has not been tested.

## Technical details
New policy WITH CHECK, otherwise identical:
```text
bucket_id = 'clinic-verification'
AND array_length(storage.foldername(name),1) = 2
AND private.has_clinic_role(private.safe_uuid((storage.foldername(name))[1]), ARRAY['OWNER'::member_role])
AND private.verification_editable(private.safe_uuid((storage.foldername(name))[1]))
AND EXISTS (SELECT 1 FROM public.document_requirements r JOIN public.clinics c ON c.clinic_type = r.clinic_type
  WHERE c.id = private.safe_uuid((storage.foldername(objects.name))[1])
    AND r.id = private.safe_uuid((storage.foldername(objects.name))[2]) AND r.is_active)
```
