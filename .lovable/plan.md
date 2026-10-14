# Database function permissions audit

## What the audit found

Every database action the app calls was checked against who is allowed to run it.

Correct today (kept as is):
- Admin actions (suspend / revoke / lift suspension, reviewing applications and documents) can be started by any signed-in user, but each one checks inside that the caller is the platform admin and refuses otherwise. The browser needs to call them, so the permission stays.
- Owner actions (create clinic, add clinic, upload/remove documents, submit verification) check that the caller is the clinic owner.
- Plan/AI checks (is the clinic operational, does the plan include AI, how many clinics are allowed) only answer for the caller's own clinics, or for the admin.
- Trial and payment steps (start mandated trial, cancel trial, confirm mandate) can only be run by the app's server and the signed Razorpay webhook, not from the browser. Correct.
- The old direct "start trial" action has no outside access at all. Correct.

Unnecessary access to remove:
1. The automatic "updated at" timestamp helper can be run by anyone, including signed-out visitors. It is only meant to run on its own when records change.
2. Three automatic background checks (new-user profile creation, the clinic-status guard and the admin-role guard) are still open to everyone by default. They only need to run on their own.
3. The app's server key can run eleven owner/admin actions it never uses. These actions depend on a signed-in person, so the server key has no reason to run them.

## Changes (one database update)

- Turn off outside access to the timestamp helper and the three background checks. They keep working on their own as before.
- Remove the unused server-key access from the owner/admin actions.
- Keep signed-in access to every action the app's pages call, and keep server-key access to the three trial/payment steps.
- Nothing else changes: same rules inside each action, same access rules for data, Razorpay Live Mode, prices and every page untouched.

## Verification

- Practice run that is rolled back first: confirm signed-out visitors and signed-in non-admins are still refused admin actions, the admin can still suspend / lift / review, owners can still submit, and the timestamp and guard checks still fire on updates.
- Then apply for real, re-read the permissions list, run the security scan and the tests.
- Remaining scan warnings for "signed-in users can run protected actions" are expected: those actions must be callable from the browser and each one checks the caller. I will mark them as reviewed with that reason. Leaked-password protection stays a setting for you to turn on.

## Technical details

```text
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.handle_new_user(), private.protect_clinic_status(),
  private.protect_platform_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_clinic_action, clinic_ai_enabled, clinic_is_operational,
  create_additional_clinic, create_first_clinic, owner_clinic_allowance, register_clinic_document,
  remove_clinic_document, review_clinic_document, review_clinic_verification,
  submit_clinic_verification FROM service_role;
-- also REVOKE ... FROM PUBLIC, anon on all public SECURITY DEFINER functions (defensive)
-- kept: authenticated on the above; service_role on begin_mandated_trial,
--       cancel_clinic_trial, confirm_trial_mandate
```
Triggers run as the table owner, so revoking EXECUTE does not stop them.
