# Security Advisor audit — flagged database actions (read-only)

Nothing was changed. Leaked-password protection is set aside as you asked.

## Summary

All 16 flagged actions are ones the signed-in app is meant to call. Each one checks who is calling before it does anything. The Advisor warning ("signed-in users can run a security-definer function") is expected for this design. **No real vulnerability was found in the function code.** Two small hardening points and one unverified item are listed below.

## Audit table

| Function | Intended callers (call site) | Checks found | Risk | Recommended action |
|---|---|---|---|---|
| admin_clinic_action | Platform admin (admin clinic details) | uid not null + is_platform_admin; action whitelist; reason required, max 1000; clinic row locked; must be APPROVED | Low | Keep |
| review_clinic_verification | Admin (verification review) | admin check; decision whitelist; reason required unless approving; must be PENDING_REVIEW; locked | Low | Keep |
| review_clinic_document | Admin (verification review) | admin check; document must exist; application must be PENDING_REVIEW; note required for replacement | Low | Hardening: also check uid not null (admin check already implies it) |
| review_document_update | Admin (admin document updates) | uid + admin; status whitelist; note rules; row locked; only PENDING | Low | Keep |
| submit_clinic_verification | Owner (verification page) | has_clinic_role OWNER for p_clinic; locked; editable state; details and files checked against storage | Low | Keep |
| register_clinic_document | Owner (verification page) | OWNER role; editable; requirement matches clinic type; path must start with own clinic/requirement; file owned by caller; size/type checked | Low | Keep |
| remove_clinic_document | Owner (verification page) | OWNER of the document's clinic; editable; locked | Low | Keep |
| submit_document_update | Owner (update dialog) | uid + OWNER; approved/active/no open reverification; reason 10–1000; path, ownership, size, type, no reuse | Low | Keep |
| create_additional_clinic | Owner (clinic settings) | uid; active profile; owner's multi plan; subscription row locked; limit re-checked; input lengths; clinic type validated | Low | Keep |
| owner_clinic_allowance | Owner (plan state) | uses auth.uid() only, no parameters; returns only caller's numbers | Low | Keep |
| clinic_is_operational | Clinic area layout | returns true only for members of p_clinic or admin; otherwise false | Low | Keep (unrelated users only learn "false") |
| clinic_ai_enabled | AI server function + plan state | membership or admin, then operational + plan | Low | Keep |
| clinic_ai_usage | AI usage card / admin AI usage | OWNER/DOCTOR/STAFF of clinic or admin; hides Max AI threshold from non-admins | Low | Keep |
| plan_ai_credit_limits | Plans page | reads only active plans; limit shown only for LIMITED plans or admin | Low | Keep (by design: limited-plan numbers are public pricing) |
| reserve_ai_credit | AI server function (meteredAi) | uid + clinic role; feature length; request id reuse checked against caller; operational; subscription lock; limit | Low | Hardening: request id is chosen by the caller — a duplicate id from another user is refused, so no leak; keep |
| finish_ai_credit | AI server function (meteredAi) | row locked; must belong to caller; only REQUESTED settles; one charge | Medium-low | See note A |

All 16 set `search_path` to empty and use schema-qualified names. All privileged writes go through these checks; anonymous callers get "Not authorised" (auth.uid() is null) or a false/empty answer.

## Notes

**A. finish_ai_credit can be called straight from the browser.** A signed-in member could reserve a credit and then mark it FAILED themselves, so it's never charged. Today no AI feature uses credits yet, so there's no impact now. Recommended fix (later, after review): settle only through the server, or let the browser mark success only. Possible breakage: none, if `meteredAi` keeps calling it.

**B. reserve_ai_credit can also be called from the browser.** This only uses up the caller's own clinic credits, so it isn't an exploit, but it lets someone use up credits without running any AI. Optional fix: same approach as A.

## Can't be verified here

- **Live grants:** this workspace can't query your database, so I can't confirm the grant list matches the earlier permissions cleanup (anon and the server key removed, signed-in kept). One read query in the Supabase SQL editor would confirm it.
- The private helper functions (`has_clinic_role`, `is_platform_admin`, `clinic_is_operational`, `ai_period`, `verification_editable`, `document_update_allowed`) aren't shown in full here. The findings assume they check `auth.uid()`, as their earlier migrations do.

## Proposed next step (only after you review)

1. Confirm grants with a read-only query.
2. If you agree, fix A (and optionally B) so credits settle only through the server.
3. Mark the remaining Advisor warnings as reviewed, with the reason "intended for signed-in callers; checks caller internally".

Nothing in Razorpay, trials, subscriptions, verification, document history or notifications would change.
