# Subscription dialog UX and trial misuse protection

## Current state (checked)
- Trial history today is `trial_events`. There is 1 activated trial (`TRIAL_STARTED`), later cancelled.
- Eligibility checks owner and clinic id only, in two places:
  - `begin_mandated_trial`, at enrollment;
  - `confirm_trial_mandate`, at the verified webhook.
- A new account with a new clinic record for the same real clinic is **not** detected.
- `confirm_trial_mandate` does not lock owner or clinic history. Two pending enrollments for different clinics of one owner could, in theory, both activate if their webhooks arrive at the same time.
- Your approved clinic has **no registration number** on record.
- No paid-plan cancellation action exists yet. Only the Razorpay cancel helper (`cancelAtRazorpay`) does.

## A. Dialog behaviour
- **Close button:** add an accessible × (labelled "Close") to the enrollment dialog, which covers both full-plan and trial confirmation. It only closes the dialog and is disabled while a request is in flight.
- **Cancel:** before checkout, it closes the dialog without calling the server.
- **Closing during authorization:** if the Razorpay window is closed while authorization is pending, the notice says the authorization is "not completed yet". It does not say "cancelled".
  - The server-side pending row is kept, so a late verified confirmation still applies.
  - Abandoned rows are closed by the existing daily job.
- **Active trial:** the plan card keeps "Cancel Free Trial", using the existing flow.
- **Active paid plan:** the plan card gets a new "Cancel Subscription" button with a confirmation step. The confirmation says access ends now and shows the next billing date when known.
  - It runs through a new server action, `cancelClinicSubscription`, that reuses the existing `cancelAtRazorpay` helper. Razorpay is cancelled first; if Razorpay refuses, nothing changes.
  - The status then becomes `CANCELLED`. A later Razorpay cancelled notification is already treated as a no-op.

## B. Trial eligibility rule (server-enforced)
A free trial can be **activated at most once** per:
1. owner account (any clinic), and
2. clinic record, and
3. clinic registration number (case and spacing insensitive).

Rules:
- A clinic without a registration number cannot start a trial. The dialog asks the owner to add it in clinic settings, with a "contact support" note. Paid plans are unaffected.
- Only a verified activation (signed `subscription.authenticated` webhook → `confirm_trial_mandate`) consumes a trial. Pending, abandoned or failed authorizations do not.
- Cancellation, expiry, failed billing or account changes never restore eligibility, because the consumed record is permanent.

## Migration (minimal, explained before applying)
1. **New table `trial_consumptions`**, append-only, server-only:
   - One row per activated trial: subscription, clinic, owner, normalised registration key, time.
   - Unique indexes on owner, on clinic, and on registration key. These make a duplicate activation impossible even under concurrent webhooks.
   - Access: RLS enabled, no policies (no browser access), `service_role` only.
   - Backfill: the existing activated trial is added, so its owner and clinic stay consumed.
2. **`begin_mandated_trial`**:
   - Requires a registration number (raises `TRIAL_REGISTRATION_REQUIRED`).
   - Rejects if owner, clinic or registration key is already in `trial_consumptions`.
   - Takes a transaction lock on owner and registration key, so repeated clicks or parallel requests serialise.
3. **`confirm_trial_mandate`**:
   - Takes the same locks and re-checks all three keys.
   - Inserts the `trial_consumptions` row in the same transaction as `TRIAL_ACTIVE` and the `TRIAL_STARTED` event.
   - Unique violations or a prior consumption return `TRIAL_ALREADY_USED`. The webhook already cancels such a subscription at Razorpay.
4. **Audit:** eligibility denials and trial activations are written to `audit_logs`: action, clinic, user, reason code. No payment data.

No change to plans, prices, 21-day timing, consent, RLS on existing tables, or access gates. No real data is reset or edited, apart from the one-row backfill of the existing activated trial into `trial_consumptions`.

## Tests
- Pure rules:
  - registration-key normalisation;
  - eligibility decision (same owner, new owner with same clinic or registration, pending does not count, cancelled or expired still counts);
  - error messages.
- Dialog:
  - × and Cancel close without calling enroll or trial functions (React Testing Library);
  - trial button is disabled without consent.
- Cancel flows: trial uses `cancelClinicTrial`; paid uses `cancelClinicSubscription`; the Razorpay-refusal path leaves the status unchanged.
- Database dry run (rolled back):
  - second activation for same owner, same clinic, or same registration key is refused;
  - duplicate webhook confirmation returns `IGNORED`;
  - unique index blocks a concurrent duplicate;
  - paid enrollment is still allowed for a non-trial-eligible owner.
- Full suite and type check.

## Limitations to report
- Owners can still edit the registration number after approval, so the key is only as reliable as that field.
- Email, IP and device signals are deliberately not used.

## Technical details
- Files:
  - migration;
  - `src/components/careflow/enroll-dialog.tsx`;
  - `src/routes/_authenticated/clinic.plans.tsx`;
  - `src/lib/subscriptions.functions.ts`;
  - `src/lib/subscription-rules.ts`;
  - new and updated tests.
