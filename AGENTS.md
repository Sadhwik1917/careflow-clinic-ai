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
- Semantic color tokens; new interactions reuse shadcn + reduced-motion `motion-primitives`, Radix owns focus/dismissal; verify Kokonut/bklit/v0 sources before adapting, no speculative deps, so animation never replaces accessibility.
- Admin Subscriptions: read-only authed server functions, caller's RLS client, paged projected queries; no admin cancellation because the provider workflow authorizes owners only.
- Plan-choice labels use configured prices and a temporary selection reverted on dismiss, keeping display separate from subscription actions.
- Authenticated header branding uses the selected verified membership's clinic display name; missing-name links are owner-only and retain normal dashboard access gates.
- Keep shared navigation and page metadata in `src/lib/navigation.ts`; role selection is presentation-only and must never be treated as authorization.
- Render the application shell inside each role area layout (`_authenticated/{admin,clinic,doctor,staff,patient}.tsx`), keeping public and auth pages outside it and each navigation destination a separate leaf route.
- Role area guards resolve access only from the signed-in user's `profiles` and `clinic_members` rows via `src/lib/access.ts`; they are navigation aids, RLS is the security boundary, and a stored clinic id is honoured only if it matches a verified membership.
- Unbuilt modules show disconnected states, because fabricated records aren't allowed.
- Clinics are created only through the database function `create_first_clinic`, which derives the owner from the session and enforces eligibility; never insert clinics or OWNER memberships from the client, because the owner-protection trigger only trusts that function.
- Clinic verification status lives only in `clinic_verifications`/`verification_events` and changes only through the submit/review database functions; owner area pages stay locked by `ownerGateRedirect` and restrictive RLS until `clinic_is_operational`, because owners can edit their own clinic row.
- Razorpay subscriptions are created only by `createClinicSubscription` (PENDING_PAYMENT) and become ACTIVE only via the signed, event-id-deduped webhook `/api/public/razorpay-webhook`; the checkout callback only verifies the signature, because client callbacks are untrusted.
- Price and Razorpay plan per scope come from `plans` via `pricingFor` (Max AI multi uses `multi_price`/`razorpay_multi_plan_id`); a verified webhook activation supersedes the clinic's other open plans, so upgrades never leave two active plans.
- Trials require a Razorpay mandate: `begin_mandated_trial` records PENDING_PAYMENT and only the signed `subscription.authenticated` webhook (`confirm_trial_mandate`) starts the trial, because browser callbacks are untrusted.
- A trial is consumed permanently by an append-only `trial_consumptions` row (unique per owner, clinic, registration key) written only by `confirm_trial_mandate` under advisory locks; eligibility never derives from subscription status, so cancellation can't restore it.
- Clinic suspension/revocation goes only through `admin_clinic_action` (clinics.status is trigger-protected and checked by `clinic_is_operational`); reinstate only lifts suspensions, revoked clinics re-verify, because history must stay append-only.
- AI and multi-clinic entitlements come from plan fields via `clinic_ai_enabled` / `create_additional_clinic` (locks the subscription row, links new clinics to the existing multi subscription); every AI server function (e.g. `askAssistant`, options whitelisted in `src/lib/assistant.ts`) must run through `meteredAi`, because hiding UI is not enforcement.
- Suspended or revoked clinics are blocked in the owner area layout (`clinic-restriction.ts` + `RestrictionGate`, fresh read every navigation); only the verification page stays reachable, and resubmitting never restores access without admin approval/reinstatement.
- Admin Users reads via the caller's RLS client after the admin check; only email lookup uses the service-role auth API, because emails live in auth.users.
- Clinic activity history merges `verification_events` (primary) with `audit_logs` via `src/lib/clinic-activity.ts`, skipping CLINIC_* audit rows that duplicate admin events, because admin_clinic_action writes both.
- Six-monthly reverification is enforced only by hourly pg_cron `private.run_reverification_maintenance` and `submit_clinic_verification`, because browser checks can't enforce deadlines.
- Notifications are inserted only by trusted database code (verification_events trigger, cron jobs); clients only read own rows and set is_read; bell uses Realtime + polling fallback, so notices can't be forged.
- Post-approval document replacements go only through `submit_document_update`/`review_document_update` (`clinic_document_updates` keeps old/new paths); they never change clinic/verification status and are off during open reverification, which has its own enforced workflow.
- Subdirectories may have their own `AGENTS.md`; read it before changing files there.
- RAG knowledge lives in the unexposed `rag` schema with one chunk table per domain (SHAREABLE/CONFIDENTIAL/CLINIC); only `rag_search_*`/`rag_upsert_document`/`rag_delete_document` touch it, each checking the caller (admins never reach clinic chunks, clinic users never reach confidential), and server code must call them with the caller's RLS client via `src/lib/rag.server.ts`, because isolation must hold before retrieval, not in prompts.
