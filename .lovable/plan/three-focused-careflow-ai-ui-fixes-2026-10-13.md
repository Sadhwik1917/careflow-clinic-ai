# Three focused CAREFLOW AI UI fixes

## 1. Enrollment dialog
- Remove only the bottom **Cancel** button. Keep the accessible top-right **×**, **Start Free Trial**, and **Confirm Full Plan**.
- Disable closing and action buttons while a request is in progress, including Escape and outside clicks. Closing before submission only dismisses the dialog; it never creates or cancels a subscription.
- Preserve existing Razorpay authorization, consent, payment confirmation, and subscription cancellation flows.

## 2. Price-based plan buttons
- Compare actual configured monthly prices, including Max AI’s selected single/multi-clinic price—not plan order.
- Show **Upgrade** only for a higher price; show **Choose** for lower or equal prices and when there is no active plan to compare against.
- Clearly mark the current plan and the plan selected for enrollment. Preserve current-plan management controls.
- While enrollment is open, comparisons follow the selected plan and scope. **After closing without confirming, return comparisons to the current active plan**, as requested.
- Labels and selection are presentation only; subscription eligibility and activation stay unchanged.

## 3. Clinic name in the header
- Use the verified membership’s existing Supabase clinic `display_name`, which the access query already retrieves.
- Show **CAREFLOW AI × [Clinic Display Name]** in the authenticated header on desktop and mobile.
- Trim blank names. If missing, show an owner-only **Complete Clinic Profile** button linking to the clinic dashboard. Other members see only CAREFLOW AI.
- Keep long names truncated with the full name accessible; use the selected membership so clinic switching and refresh do not reuse another clinic’s name.
- Preserve the existing dashboard access gate; this link will not bypass verification or enrollment requirements.

## Technical scope
- Update the existing enrollment dialog, Plans page, application shell, and shared brand only as needed; add focused tests alongside existing tests.
- Reuse existing Supabase access data and UI components. No database, authentication, payment, trial, or permission changes.

## Verification
- Test absence of Cancel, accessible × dismissal without enrollment calls, consent, and blocked close/actions while busy.
- Test lower/equal/higher prices, no active plan, Max AI scope prices, and restoring the active-plan baseline on close.
- Test real-name rendering, blank-name owner/member differences, long names, and membership changes.
- Run the full existing test suite and the available type check; inspect desktop/mobile rendering where possible.
- Report changed files, results, and any real-account checks unavailable in this externally managed Supabase project.
