# CAREFLOW AI — Pre-UI Verification Report (read-only, nothing changed)

## 1. Project identity — VERIFIED
- `supabase/config.toml` has `project_id = "ztbjdiwmiwvoafytzqxh"`. The app's database address points at the same project, and both the database and sign-in service answered (HTTP 200).

## 2. Data state — VERIFIED
- 0 sign-in users, 0 clinics and 0 plans. The database is empty, so **no flow can be tested from real data yet**.
- Row-level security is **on for all 24 public tables**.

## 3. Tables and relationships — VERIFIED (from the live schema)
Every table has a `uuid id` primary key. Main relationships:

```text
auth.users 1-1 profiles (platform_role: PLATFORM_ADMIN | USER)
profiles 1-* clinics (owner_user_id)
clinics 1-* clinic_members (user_id -> profiles, role: OWNER|DOCTOR|STAFF|PATIENT)
clinics 1-* clinic_invitations, doctor_profiles (user_id -> profiles), patients (user_id optional)
patients -> appointments -> queue_entries / consultations / vitals / invoices
consultations -> prescriptions -> prescription_items
invoices -> invoice_items, payments
profiles -> clinic_subscriptions -> plans; subscription_clinics (subscription <-> clinic)
clinic_subscriptions -> platform_payments, trial_events
clinics/profiles -> ai_interactions, ai_usage, audit_logs, notifications
```

- Clinic onboarding fields exist on `clinics`: `onboarding_status` and `onboarding_step`.
- Trial and mandate fields exist on `clinic_subscriptions` and `plans`.

## 4. Database safeguards — VERIFIED
- `on_auth_user_created` runs `private.handle_new_user` (it probably creates the profile row; I haven't read the function body).
- Clinics can only be created through `create_clinic_with_owner(...)` (security definer). Direct inserts into `clinics` are blocked.
- Triggers prevent moving records to another clinic, check that linked records belong to the same clinic, protect the owner's membership and the clinic owner, block changes to `platform_role`, and keep `updated_at` current.
- Helper functions used by the security rules: `has_clinic_role`, `is_clinic_member`, `is_patient_for_clinic`, `is_platform_admin`.

## 5. Security rules summary — VERIFIED (from the policy list)
- **Read-only from the app (no insert/update/delete):** `clinic_subscriptions`, `platform_payments`, `subscription_clinics`, `trial_events`, `clinic_invitations`, `audit_logs`, `ai_usage`, `ai_interactions`. Writes must come from trusted server code.
- `profiles`: users can read and update only; no insert or delete. `notifications`: no delete.
- Appointments: OWNER and STAFF can create and edit, the assigned DOCTOR can edit, only OWNER can delete; patients can read their own.
- Consultations: OWNER, or a DOCTOR under a condition I haven't checked, can create.
- PLATFORM_ADMIN can bypass most rules.

## 6. Questions to test (need test users — not tested)
1. Does a new sign-up get a `profiles` row, and with which `platform_role`?
2. Can a newly signed-up user call `create_clinic_with_owner`, and does it add their OWNER membership?
3. Is a STAFF or DOCTOR user in clinic A blocked from all clinic B data?
4. Can a PATIENT user see only their own appointments, consultations and prescriptions?
5. Invitations have no write rules, so how are they meant to be created and accepted (server code, or a function that doesn't exist yet)?
6. Subscriptions and trials have no write rules, so which server process creates the trial at onboarding?
7. Is `plans` readable before sign-in (needed for a public pricing page)? Its read rule wasn't checked.
8. Can users change their own `profiles.status`?

## 7. Sign-in integration in the app — VERIFIED
- Already in the project: the Supabase browser client (`client.ts`), the trusted server client (`client.server.ts`), and the middleware that checks the signed-in user on server calls (`auth-middleware.ts`, using `getClaims`).
- **Not yet wired up:** the step in `src/start.ts` that sends the user's sign-in token with server calls, a sign-in page, a protected area for signed-in users, and an `onAuthStateChange` listener.
- Sign-in provider settings (email, Google, email confirmation) are **unverified**. They can't be read from here.

## 8. Comparison with requirements — BLOCKER
- The only CAREFLOW material in the project is the README, which repeats the first request. No Architecture v3 document, page-flow list, role matrix or plan definitions are present.
- **Assumption only:** the schema appears to support onboarding, roles, clinics, appointments, the patient queue, the clinical record, billing, subscriptions/trials and AI usage. I can't check it against Architecture v3 without that document.

## 9. Blockers before building screens
1. Architecture v3 requirements and page flows are not in the project.
2. There are no test users or data, so the security rules in section 6 can't be tested.
3. The trusted server step for trials/subscriptions and the process for invitations are undefined in the database.
4. Sign-in provider settings are unverified.

## Suggested next step (once you approve)
Share the Architecture v3 document. Then create test users through the normal sign-up screen, with your consent, and run the questions in section 6 before any UI work.
