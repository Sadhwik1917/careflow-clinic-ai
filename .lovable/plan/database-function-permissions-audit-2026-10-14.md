# Database function permissions audit

## What the audit found

Every database action the app calls was checked against who is allowed to run it.

Correct today (kept as is):
- Admin actions (suspend / revoke / lift suspension, reviewing applications and documents) can be called by any signed-in user, but each one checks that the caller is the platform admin and refuses everyone else. The browser needs to call them.
- Owner actions (create or add a clinic, upload or remove documents, submit for verification) check that the caller is the clinic owner.
- Plan and AI checks only answer for the caller's own clinics, or for the admin.
- The trial and payment steps can only be run by the app's server and the signed Razorpay webhook.
- The old "start trial" action has no outside access.

Unnecessary access to remove:
1. The automatic "updated at" timestamp helper can be run by anyone, including signed-out visitors.
2. Three automatic background checks (creating a profile for new users, the clinic-status guard, the admin-role guard) are open to everyone by default.
3. The app's server key can run eleven owner and admin actions it never uses. These actions need a signed-in person, so the server key never needs them.

Confirmed before writing the change (Safeguard A):
- Each function has exactly one version (signature), so no other version is affected by mistake. The change names each one by its full signature.
- All are owned by the main database account. The four automatic checks run when data changes, no matter who can call them directly.

## Order of work

1. Re-read permissions and signatures right before running (done once already; repeated in step 2).
2. Practice run that is always undone (Safeguard B), checking:
   - a new user still gets a profile,
   - editing a clinic still updates its "updated at" time,
   - a non-admin still can't change a clinic's status,
   - a normal user still can't make themselves admin,
   - signed-out and non-admin users are still refused admin actions; the admin can still suspend, lift and review; owners can still submit.
3. Apply for real only if every check passes.
4. Re-read permissions, run the security scan and the tests.
5. Leaked-password protection: you turn it on in the Supabase sign-in settings (link provided).

Not touched: Razorpay Live Mode, prices, subscription behaviour, data access rules, the rules inside each action, any page.

Expected leftover scan warnings ("signed-in users can run protected actions"): those actions must be callable from the browser and each checks the caller, so I'll mark them as reviewed with that reason.

## Technical details

```text
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.handle_new_user(), private.protect_clinic_status(),
  private.protect_platform_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION
  public.admin_clinic_action(uuid,text,text),
  public.clinic_ai_enabled(uuid),
  public.clinic_is_operational(uuid),
  public.create_additional_clinic(text,text,text,text,text,text,text,text,text,text,text,text),
  public.create_first_clinic(text,text,text,text,text,text,text,text,text,numeric,numeric,text,text,text),
  public.owner_clinic_allowance(),
  public.register_clinic_document(uuid,uuid,text,text),
  public.remove_clinic_document(uuid),
  public.review_clinic_document(uuid,document_review_status,text),
  public.review_clinic_verification(uuid,verification_status,text),
  public.submit_clinic_verification(uuid)
  FROM service_role, PUBLIC, anon;
-- kept: authenticated on those 11; service_role on begin_mandated_trial,
--       cancel_clinic_trial, confirm_trial_mandate
```
Practice run: the same statements plus test inserts and updates inside BEGIN ... ROLLBACK, run as the authenticated role with simulated user claims and as the auth admin for the new-user insert.
