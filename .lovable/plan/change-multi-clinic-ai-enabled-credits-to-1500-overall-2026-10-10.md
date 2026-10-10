# Change Multi-Clinic AI Enabled credits to 1500 overall

## Goal
The Multi-Clinic — AI Enabled plan (₹2,499/month) currently grants **750 AI credits per clinic**. Change it to **1500 AI credits per month overall** — one shared allowance for the whole clinic group, not per clinic.

## Current state (verified)
- `public.plans` row "Multi-Clinic — AI Enabled": `ai_credit_type = LIMITED`, `ai_credit_limit = 750`, `clinic_mode = MULTI`, `max_clinics = 5`, price ₹2,499, trial label on.
- The only place credits are displayed is the signed-in Plans page (`src/routes/_authenticated/clinic.plans.tsx`), which appends " per clinic" to any MULTI limited plan. The public /pricing page still shows a placeholder and is unaffected.

## Changes
1. **Database (one UPDATE, no schema change):** set `ai_credit_limit = 1500` on that plan row only. No other plan, table, policy or workflow is touched.
2. **Plans page wording:** replace the automatic " per clinic" suffix for limited MULTI plans with "(shared across clinics)", so the card reads "1500 AI credits / month (shared across clinics)". Single-clinic limited plans keep reading "500 AI credits / month".
3. **Memory update:** record the new credit model in project memory so future pricing work uses 1500 overall, not 750 per clinic.

## Out of scope
- No payment, enrollment, trial activation, subscription enforcement, or usage metering changes (credits are not consumed by any workflow yet).
- No other plan values change.

## Verification
- Read back the plan row after the update (1500, LIMITED, everything else unchanged).
- Open the Plans page as an approved clinic owner and confirm the card shows the new allowance text; other four plan cards unchanged.
- Run type check and existing test suite.
