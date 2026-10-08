<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Frontend architecture
- Keep shared navigation and page metadata in `src/lib/navigation.ts`; role selection is presentation-only and must never be treated as authorization.
- Render the application shell inside each role area layout (`_authenticated/{admin,clinic,doctor,staff,patient}.tsx`), keeping public and auth pages outside it and each navigation destination a separate leaf route.
- Role area guards resolve access only from the signed-in user's `profiles` and `clinic_members` rows via `src/lib/access.ts`; they are navigation aids, RLS is the security boundary, and a stored clinic id is honoured only if it matches a verified membership.
- Express healthcare colors through semantic CSS tokens and reuse shadcn primitives for interaction, so future modules share accessible visual foundations.
- Workspace pages still show disconnected states and null statistics until each module is built, because no fabricated clinic records are allowed.
