# Pre-Phase 2 Rectifications

## What I found (inspection)
- Verification status lives only in `clinic_verifications` (+ append-only `verification_events`). `review_clinic_verification` only acts on PENDING_REVIEW, so an approved clinic cannot currently be acted on.
- Clinic access is enforced by `clinic_is_operational` (approved verification + active/trial subscription), used by the owner gate and the 33 restrictive RLS policies. It ignores `clinics.status` (ACTIVE / INACTIVE / SUSPENDED), and owners can edit their own clinic row, so `clinics.status` is not safe to use alone.
- Plans already carry entitlement fields: `ai_enabled` / `ai_credit_type`, `clinic_mode` (SINGLE / MULTI / SINGLE_OR_MULTI) and `max_clinics`. These will be the source of truth (no plan names).
- AI assistant is a placeholder page; no AI server code exists yet. Clinic Settings is also a placeholder; no Add Clinic flow exists.
- `create_first_clinic` refuses anyone who already owns a clinic, so a second clinic is impossible today.

## Minimum database changes (one migration)
1. `admin_clinic_action(p_clinic, p_action 'SUSPEND' | 'REVOKE' | 'REINSTATE', p_reason)` — trusted function, platform admin only, reason required, only on APPROVED (or suspended) clinics.
   - SUSPEND: sets `clinics.status = SUSPENDED` (reversible).
   - REVOKE (super rejection): moves verification APPROVED -> REJECTED with event type `REVOKED_AFTER_APPROVAL`, distinct from initial `REJECTED`.
   - Every action appends a `verification_events` row and an `audit_logs` row (admin, clinic, reason, time). No history is overwritten; no clinic, patient or billing rows are deleted.
2. `private.clinic_is_operational` also requires `clinics.status = 'ACTIVE'`, so suspension takes effect immediately in every existing RLS policy and the owner gate.
3. Trigger on `clinics` blocking non-trusted changes to `status` (owners cannot un-suspend themselves).
4. `clinic_ai_enabled(p_clinic)` — member/admin-only check: operational + effective subscription plan has `ai_enabled`.
5. `create_additional_clinic(...)` — owner-only: caller must own an operational clinic whose effective plan is MULTI / SINGLE_OR_MULTI (Max AI only when on the multi scope), and owned clinics < `max_clinics`. Reuses the existing clinic insert, OWNER membership and DRAFT verification logic; the new clinic still needs its own verification and must be linked to the subscription per existing rules.

## App changes
- New `/admin/clinics/$clinicId` details page (identity, contact/location, registration, representative, verification status, subscription), with loading/error/not-found states, a "View verification application" link, and Suspend / Revoke approval / Reinstate actions with required reason and confirm step. Clinic list rows link here instead.
- Owner area: AI assistant nav item and page hidden/locked when `clinic_ai_enabled` is false; route guard redirects. Future AI server functions must call the same check (helper added now).
- Clinic Settings: Add Clinic + verification entry shown only for eligible multi-clinic plans; form calls `create_additional_clinic`.
- Tests: action authorization rules, details page rendering, AI entitlement, multi-clinic eligibility, plus a rolled-back SQL dry run proving direct calls by non-admins / single-clinic owners are refused.

## Open question
Switching the active clinic for an owner with several clinics already uses the existing clinic chooser; no change planned there.
