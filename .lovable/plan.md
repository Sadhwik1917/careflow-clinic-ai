# Fix free-trial enrollment failure

## Root cause (confirmed from server logs and the database)

The failure happens **before Razorpay checkout opens**, in the step that saves the trial enrollment.

1. Clicking Start Free Trial runs `startClinicTrial`. It creates the Razorpay subscription (first charge in 21 days), which works.
2. It then calls the database function `begin_mandated_trial` to save the enrollment as awaiting authorization.
3. The database rejects that insert. Server log, 4 times between 11:22 and 11:29 UTC:
   `new row for relation "clinic_subscriptions" violates check constraint "clinic_subscriptions_check"`
4. That rule requires every `TRIAL` row to have both `trial_start_date` and `trial_end_date`. `begin_mandated_trial` sets only `trial_end_date`, because the trial start was meant to be recorded later, when the authorization webhook arrives.
5. The server then cancels the Razorpay subscription it just created (no orphan is left). The unrecognised database error falls through to the generic "We couldn't update your trial" message.

No trial row, mandate or charge was created by these attempts.

## Fix

- **Database (one migration, function only; the existing check rule is kept):**
  - `begin_mandated_trial` sets `trial_start_date = now()` on the awaiting-authorization row.
  - `trial_end_date` is unchanged: it equals the Razorpay first charge, 21 days out.
  - The row stays `PENDING_PAYMENT` with mandate `PENDING`, so it grants no clinic access.
  - `confirm_trial_mandate` (signed webhook only) keeps overwriting `trial_start_date` with the time authorization is confirmed, and sets `TRIAL_ACTIVE`. No change there.
- **"Trial already used" check (`getClinicPlanState`):** it currently counts any owner row with `trial_start_date`. That would wrongly mark an abandoned, unauthorised enrollment as a used trial. Change it to count only:
  - real `TRIAL_STARTED` events (by clinic, or by the owner's subscriptions), or
  - rows with mandate `AUTHORIZED`.

  This mirrors the database's own eligibility rule.
- **Error message:**
  - Add a specific, safe message for an enrollment-save failure: "We couldn't save your trial enrollment. Nothing was charged; please try again."
  - Detailed database errors stay in server logs only.

## Unchanged

- 21-day timing and Razorpay `start_at`.
- Explicit consent checkbox.
- Cancellation rules.
- Webhook-only activation.
- Clinic access gates, RLS and existing records.
- No manual data edits.

## Tests

- **Regression (new):** check the exact enrollment-row values `begin_mandated_trial` would write against the DB check rule. Do this with a rolled-back database dry run that calls `begin_mandated_trial` for a real eligible clinic, then rolls back.
- **Unit test:** "trial used" logic ignores pending/abandoned enrollments and counts authorized or started trials.
- Then run the full suite and type check.

## Technical details

- Files:
  - new migration (`CREATE OR REPLACE FUNCTION public.begin_mandated_trial`)
  - `src/lib/subscriptions.functions.ts` (trialUsed query; error mapping for the save step)
  - `src/lib/subscription-rules.ts` (new message, pure `isTrialUsed` helper)
  - `src/test/trial-mandate.test.ts`
- The webhook handler and `confirm_trial_mandate` already match the schema and status values.

## How to retry afterwards (Test Mode)

1. Use an approved clinic owner account that has no current plan and has never used a trial.
2. Plans → choose a trial plan → tick consent → Start Free Trial.
3. Approve in Razorpay with a test card or UPI test handle.
4. Success only counts when:
   - the Razorpay dashboard shows the subscription as "authenticated", and
   - the plan card shows "Free trial", meaning the database moved to `TRIAL_ACTIVE` from the signed webhook.
