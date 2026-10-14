import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ErrorState, LoadingState } from "@/components/careflow/feedback";
import { AdminUsersPage } from "@/components/careflow/admin-users-page";
import { adminUsersQuery } from "@/lib/admin-users";
import { userFiltersSchema } from "@/lib/admin-user-rules";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => pageMetadata("Users", "PLATFORM_ADMIN"),
  validateSearch: (input) => userFiltersSchema.parse({ ...input, page: Number(input['page'] ?? 0) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => { await context.queryClient.ensureQueryData(adminUsersQuery(deps)); },
  pendingComponent: () => <div className="p-6"><LoadingState label="Loading users…" /></div>,
  errorComponent: UsersError,
  component: Page,
});

function Page() {
  return <AdminUsersPage filters={Route.useSearch()} />;
}

function UsersError() {
  const router = useRouter();
  return <ErrorState title="Users couldn't load" description="Check your connection and platform admin access, then try again." onRetry={() => void router.invalidate()} />;
}
