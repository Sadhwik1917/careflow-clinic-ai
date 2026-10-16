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
- Semantic color tokens; interactions reuse shadcn + reduced-motion `motion-primitives`, Radix owns focus/dismissal; verify Kokonut/bklit/v0 sources before adapting; no speculative deps.
- Admin Subscriptions are read-only via the caller's RLS client (paged); no admin cancellation — the provider authorizes owners only. Plan-choice labels use configured prices and revert on dismiss.
- Authenticated header branding uses the selected verified membership's clinic display name; missing-name links are owner-only.
- Keep shared navigation and page metadata in `src/lib/navigation.ts`; role selection is presentation-only, never authorization.
- Render the app shell inside each role area layout (`_authenticated/{admin,clinic,doctor,staff,patient}.tsx`); public/auth pages stay outside; each navigation destination is its own leaf route.
- Role guards resolve access only from the user's `profiles`/`clinic_members` rows via `src/lib/access.ts`; they are navigation aids — RLS is the security boundary; a stored clinic id counts only if it matches a verified membership.
- Unbuilt modules show disconnected states — fabricated records aren't allowed.
- Clinics are created only through the database function `create_first_clinic`, which derives the owner from the session and checks eligibility; never insert clinics or OWNER memberships from the client; the owner-protection trigger only trusts that function.
- Clinic verification status lives only in `clinic_verifications`/`verification_events`, changing only through the submit/review database functions; owner pages stay locked by `ownerGateRedirect` and RLS until `clinic_is_operational` — owners can edit their own clinic row.
- Razorpay subscriptions are created only by `createClinicSubscription` (PENDING_PAYMENT) and become ACTIVE only via the signed, event-id-deduped webhook `/api/public/razorpay-webhook`; the checkout callback only verifies the signature — client callbacks are untrusted.
- Price and Razorpay plan per scope come from `plans` via `pricingFor` (Max AI multi uses `multi_price`/`razorpay_multi_plan_id`); a verified webhook activation supersedes the clinic's other open plans — upgrades never leave two active plans.
- Trials start only via the signed `subscription.authenticated` webhook (`confirm_trial_mandate` after `begin_mandated_trial` records PENDING_PAYMENT), writing the append-only, advisory-locked `trial_consumptions` row (unique per owner/clinic/registration key); eligibility never derives from subscription status — browser callbacks are untrusted and cancellation must not restore a trial.
- Clinic suspension/revocation goes only through `admin_clinic_action` (clinics.status is trigger-protected and checked by `clinic_is_operational`); reinstate only lifts suspensions, revoked clinics re-verify — history stays append-only.
- AI and multi-clinic entitlements come from plan fields via `clinic_ai_enabled` / `create_additional_clinic` (locks the subscription row, links new clinics to the existing multi subscription); every AI server function (options whitelisted in `src/lib/assistant.ts`) runs through `meteredAi` — hiding UI is not enforcement. Exception: platform admins use the assistant unmetered in `askAssistant` — no admin subscription exists and no clinic's credits may be consumed.
- Suspended/revoked clinics are blocked in the owner layout (`clinic-restriction.ts` + `RestrictionGate`, fresh read per navigation) except the verification page; resubmitting never restores access.
- Admin Users reads via the caller's RLS client; only email lookup uses the service-role auth API (emails live in auth.users).
- Clinic activity history merges `verification_events` (primary) with `audit_logs` via `src/lib/clinic-activity.ts`, skipping CLINIC_* audit rows duplicating admin events (admin_clinic_action writes both).
- Six-monthly reverification is enforced only by hourly pg_cron `private.run_reverification_maintenance` and `submit_clinic_verification` — browser checks can't enforce deadlines.
- Notifications are inserted only by trusted database code (verification_events trigger, cron jobs); clients only read own rows and set is_read; bell uses Realtime + polling fallback — notices can't be forged.
- Post-approval document replacements go only through `submit_document_update`/`review_document_update` (`clinic_document_updates` keeps old/new paths); they never change clinic/verification status and are off during open reverification.
- Subdirectories may have their own `AGENTS.md`; read it before editing files there.
- RAG uses separate hidden stores and caller-checking `rag_*` actions via the user's RLS client; admins never get clinic chunks, clinic users never confidential. Assistant retrieval runs inside `meteredAi`, derives scope from the profile, fails closed, validates source metadata.
- Knowledge documents carry an approval status; clinic shared search returns only APPROVED, every upsert resets to PENDING, only the admin-only audited `rag_review_document` changes status — new content must never become clinic-visible automatically.
