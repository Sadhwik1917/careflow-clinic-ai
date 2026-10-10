# Verify Razorpay subscription backend (test mode)

The Razorpay test credentials are now saved. This plan verifies the subscription-creation backend that was already built, without enabling any real payment flow.

## Steps

1. **Confirm the server function can read the secrets**
   - Check that `createClinicSubscription` reads `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` at runtime (server-side only, never exposed to the browser).

2. **Create a real test-mode subscription**
   - Sign in to the preview as the approved clinic owner.
   - Call `createClinicSubscription` for one plan (e.g. Single Clinic — No AI).
   - Confirm Razorpay Test Mode returns a subscription id and the database row is stored as `PENDING_PAYMENT` with the correct plan and clinic.

3. **Verify the safety gates still hold**
   - The new subscription does NOT make the clinic operational or unlock clinic operations.
   - A second call for the same clinic is refused (no duplicate active/pending subscription).
   - A non-owner or unapproved clinic is refused.

4. **Run the checks**
   - Type check, build, and the existing test suite (including the subscription-rules tests).

## Explicitly out of scope

- No webhook / payment confirmation (subscriptions stay `PENDING_PAYMENT`).
- No checkout UI, no trial activation, no live-mode keys.
- No changes to verification, auth, RLS, or access gates.

## Technical details

- Files touched only if a fix is needed: `src/lib/subscriptions.functions.ts`, `src/lib/subscription-rules.ts`, `src/test/subscription-rules.test.ts`.
- Razorpay calls use the saved test-mode keys via basic auth from the server function; keys never reach client code.
