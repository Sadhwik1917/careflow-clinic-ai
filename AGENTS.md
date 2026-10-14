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
- New interactions reuse shadcn primitives with the reduced-motion-aware `motion-primitives` wrappers; keep Radix responsible for focus, dismissal and keyboard behavior so animation never replaces accessibility.
- Admin Subscriptions uses authenticated read-only server functions with the caller's RLS client, paged subscription/history queries and projected fields only; admin cancellation is not exposed because the existing provider cancellation workflow authorizes owners only.
- Verify Kokonut, bklit and v0 source/dependencies before adapting any component, and add Anime.js only for justified decorative effects; this avoids speculative dependencies and a second visual language.
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
- Clinic suspension/revocation goes only through `admin_clinic_action` (clinics.status is trigger-protected and checked by `clinic_is_operational`); reinstate only lifts suspensions, revoked clinics re-verify, because history must stay append-only.
- AI and multi-clinic entitlements come from plan fields via `clinic_ai_enabled` / `create_additional_clinic` (locks the subscription row, links new clinics to the existing multi subscription); every AI server function must call `assertClinicAi`, because hiding UI is not enforcement.
- Suspended or revoked clinics are blocked in the owner area layout (`clinic-restriction.ts` + `RestrictionGate`, fresh read every navigation); only the verification page stays reachable, and resubmitting never restores access without admin approval/reinstatement.
- Admin Users reads profiles/memberships through the caller's RLS client after the admin check; only email lookup uses the service-role auth API, server-side and after that check, because emails live in auth.users.
- Clinic activity history merges `verification_events` (primary) with `audit_logs` via `src/lib/clinic-activity.ts`, skipping CLINIC_* audit rows that duplicate admin events, because admin_clinic_action writes both.
