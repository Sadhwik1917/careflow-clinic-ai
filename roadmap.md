# Phase 1A
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
- [ ] Review exact migration SQL, storage policies, affected rules, tests (awaiting approval).
- [ ] Apply migration + private bucket; verification pages; admin review; plan gate.
- [ ] Live upload/review/enrollment tests — blocked: no admin, no accounts, no payment provider.
