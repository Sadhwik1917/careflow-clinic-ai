# First platform administrator setup

## What exists today
- **Where the admin role is stored:** `profiles.platform_role` is `USER` or `PLATFORM_ADMIN`. Every new signup gets a profile with `USER`, created by the `handle_new_user` trigger. The trigger ignores anything the user sends during signup, so nobody can sign up as an admin.
- **Protection:** the `protect_platform_role` trigger blocks any signed-in user who is not already an admin from changing `platform_role` or `status`, including on their own profile. It only allows the change when there is no signed-in user, which means trusted server or SQL work.
- **Admin check:** `private.is_platform_admin()` requires `platform_role = PLATFORM_ADMIN` and `status = ACTIVE`. The admin page guard, the admin access rules and the review functions all use this check.
- **Current state:** there are 0 platform admins.

## Recommended method
Make the change once as a direct database update. There is no new code, no migration, no new signup path, and the service-role key stays out of the app.

1. You create a dedicated admin account with the normal signup page, using a separate email such as `admin@yourdomain`, not the clinic owner email. Then confirm the email and sign in once.
2. You send me that email address. I run one data change that promotes only that account:
```sql
UPDATE public.profiles
   SET platform_role = 'PLATFORM_ADMIN'
 WHERE id = (SELECT id FROM auth.users WHERE lower(email) = lower('<admin email>'))
   AND platform_role = 'USER';
```
   This runs without a signed-in user, so the protection trigger allows it. Every in-app attempt stays blocked.
3. I read the result back to confirm exactly 1 admin and that it's the right account.
4. You sign out and back in. The access check is cached for about a minute, and signing out clears it. Then open `/admin/dashboard` and `/admin/verifications` to review the submitted clinic.

## What does not change
- Tables, access rules, triggers, functions, authentication settings, clinic verification and app files all stay the same.
- There is no admin signup option and no way to grant yourself admin in the app.

## Notes
- Use a separate account for the admin. Being a platform admin does not make anyone a clinic owner, so admin and owner work stay apart.
- Later admins can be added the same way. A proper in-app tool to manage admins can come in a later phase.
- Leaked-password protection is still off. Turn it on in the Supabase dashboard before using the admin account for real work.

## Verification after promotion
- The admin count is 1, and it's the chosen account.
- The admin account can see the pending clinic in the verification queue and can approve it or request changes.
- The clinic owner account still can't open `/admin/*`.
