# Phase 1A
## Clinic Owner MVP — Patients
- [x] Connect directory, registration, profiles and permitted demographic editing through caller-scoped access; required atomic patient audit trigger added without altering RLS.
- [x] Verify validation, duplicate patient numbers, cross-clinic denial and full regression tests: 247 tests pass across 32 files.
- [ ] Signed-in registration-to-profile browser check — blocked: external Supabase has no available authenticated test session.

## Clinic Owner MVP — Doctors & Staff
- [x] Doctors directory + detail/edit via caller RLS client (whitelisted fields, optimistic concurrency with conflict reload feedback); names via owner-gated trusted lookup; profile update audit logging.
- [x] Staff roster + invitations via trusted DB functions & caller-scoped fallback (invite/cancel/status-only member changes; no role edits, self-demotion prevention, cancellation confirmation, audit logging).
- [x] Moved "Invite Members" from Staff roster to Clinic Dashboard with prominent action banner and owner validation.
- [x] Root-cause fix for invitation link failure: anonymous/incognito lookup via server function `getInvitationPreview` masking recipient email.
- [x] Clinic Gmail OAuth 2.0 email delivery: AES-256-GCM encrypted tokens, sender email matching check, Gmail API REST MIME message dispatch with responsive template, no Supabase Auth fallback.
- [x] Complete Doctor & Staff onboarding: role-specific fields (specialization, license, consultation fee, bio for doctors; display name for staff), atomic acceptance, and owner `MEMBER_JOINED` in-app notification.
- [x] Patient registration with QR code: scannable, mobile-accessible, printable/downloadable SVG QR code pointing to canonical registration URL with zero health data encoded.
- [x] Application-wide Sileo toast notifications: reusable helper in `src/lib/toast.ts`, single root toaster mount in `__root.tsx`, dark mode styling, wired across team, profile, QR, and auth actions.
- [x] Tests, type check, build: 338 tests pass across 38 files; tsc clean; production build OK.
- [ ] Live signed-in invitation redemption & doctor profile edit — blocked: requires applying migration 20261023180000_accept_clinic_invitation.sql, Google Cloud OAuth Web Client configuration, and external Supabase test credentials.

## Phase 3C.2 — Assistant secure retrieval
- [x] Connect existing assistant request to caller-authorized RAG inside existing metered flow.
- [x] Ground answers in untrusted reference content with verified source metadata and safe missing-evidence behavior.
- [x] Preserve attachments, commands, UI, accounting and domain isolation; 218 tests pass and compilation diagnostics are clean.
- [x] Approved-document filtering — approval status added (3C.2.1); clinic shared search returns only approved docs; upsert resets to pending; admin-only review action; verified live with test markers, cleaned up.
- [x] Admin assistant entitlement — platform admins use the assistant unmetered, never consuming clinic credits (3C.2.1). Doctor/staff UI access — blocked: no existing routes.
- [x] Live Fast-model verification — retried once with the real model id; responded successfully.
- [ ] Live document-to-assistant verification — requires a real approved document and an external Supabase user session.
- [ ] Admin assistant UI page — no admin route exists; server entitlement only.

## Phase 2A — Admin Subscriptions
- [x] Inspect real schema, RLS, payment lifecycle, and compatible UI libraries.
- [x] Implement searchable, filtered, paginated subscription records and read-only details/history.
- [x] Establish reusable accessible motion patterns without changing completed pages.
- [x] Run focused and regression tests, inspect preview diagnostics, report verification limitations.
- [ ] Signed-in real-data browser flow and desktop/mobile dialog checks — blocked: external unmanaged Supabase cannot supply a test session.

## Requested UI fixes
- [x] Remove enrollment Cancel and verify safe busy/close controls.
- [x] Compare plan choices by configured scope prices, returning to active-plan baseline on close.
- [x] Show selected clinic display name in the header with an owner-only missing-name link.
- [x] Run full tests and check preview diagnostics; report real-account verification limitations.
- [ ] Real-account dialog and clinic-switch/refresh checks — blocked: external unmanaged Supabase has no available browser session.

- [x] Inspect starter and Architecture v1.3 routes.
- [x] Establish healthcare design tokens and reusable feedback/statistics components.
- [x] Implement responsive shell and five role navigation configurations without authentication or workflows.
- [x] Verify navigation, mobile layout, tests, and build diagnostics; report changed files.
# Phase 1B
- [x] Login, signup, forgot/reset password, sign out, single auth listener.
- [x] Access resolution from profiles + clinic_members; role area guards, workspace picker, clinic selection.
- [x] Public pages: /, /pricing, /about, /contact.
- [ ] End-to-end signed-in test — blocked: no test accounts / memberships exist yet.
# Phase 1C
- [x] Secure first-clinic creation in the database (eligibility, unique code, display name, owner rule).
- [x] Clinic setup form and "CAREFLOW AI × [Clinic Display Name]" branding.
- [ ] Live signed-in clinic creation test — blocked: no test account exists yet.
# Phase 1D — Clinic verification
- [x] Review exact migration SQL, storage policies, affected rules, tests (awaiting approval).
- [x] Apply migration + private bucket; verification pages; admin review; plan gate.
- [ ] Live upload/review/enrollment tests — blocked: no admin, no accounts, no payment provider.
- [x] Revised proposal: privilege audit, one-document rule, exact 33 policies, stronger submit, new create_first_clinic signature (awaiting approval).
- [x] Final checks: deletion/history rule, revoke private operational helper, full rolled-back dry run (awaiting review).

## Subscription dialog UX & trial misuse protection
- [x] Dialog × close, context-aware cancel, paid "Cancel Subscription"
- [x] trial_consumptions (permanent keys, backfill flagged, xact locks, unique indexes, server-only)
- [x] Lock registration number after approval (admin-only changes)
- [x] Tests + type check + report

## Admin header and side panel branding
- [x] Admin header shows "Admin / <current page>" breadcrumb instead of the icon and wordmark.
- [x] Side panel keeps the icon and "CAREFLOW AI" wordmark for admin, like every other area.
- [x] Plans page no longer shows the Razorpay Test Mode note now that payments run live.
- [x] 98 tests and type check pass; admin area not opened signed in (external unmanaged Supabase).

## Pre-Phase 2 rectifications
- [x] Super rejection (suspend / revoke / reinstate-suspended-only) with audit + immediate enforcement
- [x] Admin clinic details page
- [x] AI access gated by plan ai_enabled (UI + DB check)
- [x] Add Clinic for multi-clinic plans, max_clinics enforced atomically
- [x] Rolled-back SQL dry run + tests + report

## Suspended / revoked clinic owner experience
- [x] Detect suspension / revocation with the admin's recorded reason
- [x] Full-screen blurred block with Re-verify Clinic, Switch clinic, Sign out
- [x] Suspended clinics can resubmit verification (stays suspended until reinstated)
- [x] Tests + rolled-back database check

## Phase 2C — Admin Analytics
- [x] Real count-based metrics, registration trends, status distribution, range filter, tests.
- [ ] Signed-in browser check — blocked: no test session for external Supabase.

## Phase 3C.3 — Patient History Summary
- [x] Server: summarizePatientHistory + listSummaryPatients (exact RLS-scoped queries, admin refused, meteredAi, empty history free)
- [x] UI: patient picker + summary card on /clinic/ai with stop/retry/empty states and mandatory notice
- [x] 12 new tests; full suite 230/230, tsgo clean, build OK
- [ ] Live end-to-end summary — blocked: no authenticated session for external Supabase; verify by hand as a clinic owner
