<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Frontend architecture
- Plan-choice labels use configured scope prices and a temporary enrollment selection, reverting to the active plan when dismissed; this keeps pricing presentation separate from subscription actions.
- Authenticated header branding uses the selected verified membership's clinic display name; missing-name links are owner-only and retain normal dashboard access gates.
- Keep shared navigation and page metadata in `src/lib/navigation.ts`; role selection is presentation-only and must never be treated as authorization.
- Render the application shell inside each role area layout (`_authenticated/{admin,clinic,doctor,staff,patient}.tsx`), keeping public and auth pages outside it and each navigation destination a separate leaf route.
- Role area guards resolve access only from the signed-in user's `profiles` and `clinic_members` rows via `src/lib/access.ts`; they are navigation aids, RLS is the security boundary, and a stored clinic id is honoured only if it matches a verified membership.
- Express healthcare colors through semantic CSS tokens and reuse shadcn primitives for interaction, so future modules share accessible visual foundations.
- Workspace pages still show disconnected states and null statistics until each module is built, because no fabricated clinic records are allowed.
- Clinics are created only through the database function `create_first_clinic`, which derives the owner from the session and enforces eligibility; never insert clinics or OWNER memberships from the client, because the owner-protection trigger only trusts that function.
- Clinic verification status lives only in `clinic_verifications`/`verification_events` and changes only through the submit/review database functions; owner area pages stay locked by `ownerGateRedirect` and restrictive RLS until `clinic_is_operational`, because owners can edit their own clinic row.
- Razorpay subscriptions are created only by the `createClinicSubscription` server function, which reads plan price and Razorpay plan id from `plans` and stores rows as PENDING_PAYMENT, because client values are untrusted and only verified payment (future webhook) may make a subscription ACTIVE.
- Subscriptions become ACTIVE only via the signed Razorpay webhook (`/api/public/razorpay-webhook`, deduped by event id in `razorpay_webhook_events`); the browser checkout callback only verifies the signature, because client callbacks are untrusted.
- Price and Razorpay plan per scope come from `plans` via `pricingFor` (Max AI multi uses `multi_price`/`razorpay_multi_plan_id`); a verified webhook activation supersedes the clinic's other open plans, so upgrades never leave two active plans.
- Trials require a Razorpay mandate: `startClinicTrial` creates a subscription with start_at = trial end and `begin_mandated_trial` records it PENDING_PAYMENT; only the signed `subscription.authenticated` webhook (`confirm_trial_mandate`) starts the trial, because browser callbacks are untrusted and Razorpay then charges automatically at trial end.
- A trial is consumed permanently by a row in server-only, append-only `trial_consumptions` (unique per owner, clinic and normalised registration key), written only by `confirm_trial_mandate` under transaction advisory locks; eligibility never derives from subscription status, so cancellation or expiry can't restore it.
