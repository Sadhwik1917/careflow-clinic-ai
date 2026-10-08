# Clinic Verification and Approval: Plan for Approval

## What already exists (inspected)
- **Clinic creation:** `create_first_clinic` safely creates the clinic and its owner together. I'll keep it and add the new fields to it.
- **Admin role:** `profiles.platform_role = PLATFORM_ADMIN`, checked by `private.is_platform_admin()`. There are no admin accounts yet; we'll set one up later, as you chose.
- **Plans and subscriptions:** the tables exist, but there are 0 plans. Owners can only read their subscription; no one can create one from the app. There is no payment provider.
- **Documents and storage:** there are no storage buckets and no verification or document tables.
- **Security gap:** right now an owner can edit every field of their own clinic. So the verification status must **not** be stored on the clinic, or owners could approve themselves. It goes in a separate table that only trusted database steps can write to.
- **Routing:** right now a new owner goes straight to the clinic dashboard. This has to be locked until approval and enrollment.

## Database changes (one migration, for your approval)
1. **New fields on `clinics`, all optional:** `clinic_type`, `postal_code`, `latitude`, `longitude`, `registration_number`, `representative_name`, `representative_phone`.
2. **`document_requirements`** (an editable list): clinic type, document key, label, required yes/no, allowed file types, maximum size, active yes/no. Everyone signed in can read it. Only admins can change it. It starts with a **draft list, clearly labelled as one**: a registration/licence (required) plus GST certificate, trade licence and other documents (optional), for the types General clinic, Specialty clinic, Dental, Diagnostic and Other.
3. **`clinic_verifications`** (one per clinic): status `DRAFT`, `PENDING_REVIEW`, `CHANGES_REQUESTED`, `APPROVED` or `REJECTED`, plus the submission time, the reviewer, the decision time and the reason. The owner and admins can read it. **Nobody can write to it directly.** It is created as `DRAFT` together with the clinic. If no record exists, the clinic is treated as not approved.
4. **`clinic_documents`**: clinic, requirement, storage path, file name, size, type, review status and note. Owners can add or delete their own clinic's files only while the status is `DRAFT` or `CHANGES_REQUESTED`. Admins can read all documents and update their review notes.
5. **`verification_events`**: a permanent history of every submission and decision (who, what, when, why). Owners and admins can read it. No one can edit it.
6. **Trusted steps:**
   - `submit_clinic_verification(clinic)`: owner only, and only when the status is DRAFT, CHANGES_REQUESTED or REJECTED (rejected clinics can reapply). It checks the required details and that every required document is uploaded, and locks so a double submit doesn't count twice.
   - `review_clinic_verification(clinic, decision, reason)`: admins only. A reason is required for changes requested and rejected. It works only on applications that are pending review.
   - `clinic_is_operational(clinic)`: true only if the clinic is approved and has an active or trial subscription linked to it.
7. **Private storage bucket `clinic-verification`** (max 10 MB, never public). Files are saved under `{clinic_id}/...`. Owners can read and upload files in their own clinic's folder; uploads are allowed only while editing is allowed. Admins can read everything. Doctors, staff, patients and other clinics' owners have no access. Admins view documents through short-lived signed links.
8. **Locking clinic operations at the database level:** add the condition `clinic_is_operational(clinic_id)` to the add, edit and delete rules on patients, appointments, queue, consultations, vitals, prescriptions, invoices, payments and doctor profiles. Admins are not affected. Reading is unchanged.

## Screens
- **Setup form:** adds clinic type, postal code, optional map coordinates, registration number and representative details.
- **New `/clinic/verification` page** (owner): the status banner, a document checklist with required and optional marked, upload with progress and file type/size checks, replace or remove while editing is allowed, the reviewer's reason, and Submit or Resubmit with a confirmation.
- **New `/clinic/plans` page:** before approval it explains why it's locked. After approval it lists the active plans and clearly says "Online payment and enrollment aren't available yet". It never fakes a subscription.
- **Clinic guard:** if the clinic isn't operational, the owner is sent to the verification page or the plans page. Only those pages, settings and sign out stay available. Navigation hides operational pages, but the database rules above are the real lock.
- **Admin `/admin/verifications`:** a queue with filters for status, name, state and date. **`/admin/verifications/$clinicId`:** clinic details, the documents (signed preview links), per-document notes, the history, and Approve, Request changes or Reject with a confirmation and a required reason.

## Tests
- **Automated:** submission checks, required vs optional documents, the status → page-access rules, and the existing tests.
- **Database checks via SQL:** a signed-out or owner-only attempt to call review fails; a direct write to verification is refused; storage rules are listed.
- **Not possible without real accounts:** real uploads, admin review and enrollment. These will be reported as untested.

## Out of scope / open
- **Payment provider and actual enrollment:** stops at choosing a plan, as you chose.
- **First platform admin:** set up later, as you chose.
- **Starter document list:** a draft; admins should check it against the actual rules where each clinic operates.
- **No AI review.**
