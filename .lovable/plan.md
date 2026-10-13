# Restore the CAREFLOW AI brand in the admin side panel

Only the two items you pointed at in the top header — the icon and the "CAREFLOW AI" wordmark — should be gone. In the last change I also hid the brand at the top of the side panel on admin pages. That extra removal will be undone.

## What changes

1. **Side panel (admin):** the icon and "CAREFLOW AI" wordmark come back at the top of the sidebar, exactly as in the clinic, doctor, staff and patient areas. Collapsed-icon behaviour is unchanged (icon only when the panel is collapsed).
2. **Top header (admin):** stays as you last saw it — "Admin / Dashboard" breadcrumb that follows the current page, no icon and no wordmark.
3. **Other areas:** untouched. Clinic, doctor, staff and patient sidebars and headers keep their current brand, clinic name and "Complete Clinic Profile" link.

No database, access-gate, navigation-configuration or styling changes.

## Technical details

- `src/components/careflow/application-shell.tsx` (line 23): the sidebar brand is currently rendered behind a `role !== "PLATFORM_ADMIN" &&` guard. That guard is removed so `<CareflowBrand compact={state === "collapsed" && !isMobile} />` renders for every role. The mobile close button next to it and the clinic/context box below are unchanged.
- `src/test/application-shell.test.tsx` (line 52): the admin test asserts no "CAREFLOW" text exists anywhere in the rendered shell, which was written for the hidden-sidebar state and would now fail. The assertion is scoped to the top header (`getByRole("banner")` — the sidebar renders only `<div>`s, so it cannot match) and a new assertion checks the wordmark is present in the sidebar.
- The header breadcrumb branch (`role === "PLATFORM_ADMIN"` in the header) is left exactly as it is.

## Verification

- `bunx vitest run` (full suite) and the type check.
- Reload `/admin/dashboard`: side panel shows the icon plus "CAREFLOW AI", header still shows "Admin / Dashboard".
