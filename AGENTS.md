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
- Render the reusable application shell around the root Outlet and keep each specified navigation destination as a separate leaf route, so deep links and route metadata stay valid.
- Phase 1A route content uses disconnected states and null statistics, not backend calls or fabricated clinic records, because workflows are outside this phase.
- Express healthcare colors through semantic CSS tokens and reuse shadcn primitives for interaction, so future modules share accessible visual foundations.
