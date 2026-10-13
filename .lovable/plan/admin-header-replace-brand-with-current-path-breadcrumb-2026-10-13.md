# Admin header: replace brand with current-path breadcrumb

## What changes

Only for the PLATFORM_ADMIN area (all `/admin/*` pages). Every other role keeps the existing brand.

1. **Top header (admin only):** remove the Activity icon and the "CAREFLOW AI" wordmark that currently come from `CareflowBrand`. In their place show a readable breadcrumb of the current path, e.g. `Admin / Dashboard` (chosen format).
   - Breadcrumb is built from the existing role navigation (`src/lib/navigation.ts` + the current pathname already computed in `application-shell.tsx`), so it always reflects the real page the user is on — never hardcoded.
   - First segment ("Admin") muted, current segment semibold. Not clickable (it is the current page).
2. **Remove the redundant small page-name line** below the brand for admin only (the breadcrumb already names the page). Other roles keep it.
3. **Side navigation panel (admin only):** the sidebar currently shows the same icon + wordmark via `CareflowBrand`. For admin, drop that line too so the wordmark does not survive elsewhere in the admin area. The "Platform administration" context box below stays. When the sidebar is collapsed on desktop, the header simply shows nothing extra for admin.

## Files

- `src/components/careflow/application-shell.tsx` — render breadcrumb instead of `CareflowBrand` when `role === "PLATFORM_ADMIN"`; hide the sidebar brand line for admin; conditionally drop the sub-line.

`brand.tsx` is untouched — owners, doctors, staff and patients keep the current brand.

## Tests

- Extend the routing/shell tests: admin pages render the breadcrumb (e.g. "Admin / Dashboard") and not the "CAREFLOW" wordmark; a non-admin workspace still renders `CareflowBrand`.

## Out of scope

- No changes to other roles, navigation config, database, or access logic.
