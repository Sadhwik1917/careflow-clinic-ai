# Phase 1A
## Requested UI fixes
- [ ] Remove enrollment Cancel and verify safe busy/close controls.
- [ ] Compare plan choices by configured scope prices, returning to active-plan baseline on close.
- [ ] Show selected clinic display name in the header with an owner-only missing-name link.
- [ ] Run full tests and check preview diagnostics; report real-account verification limitations.

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
