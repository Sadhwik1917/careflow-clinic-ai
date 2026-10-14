import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ErrorState, LoadingState } from "@/components/careflow/feedback";
import { AdminSubscriptionsPage } from "@/components/careflow/admin-subscriptions-page";
import { adminSubscriptionsQuery } from "@/lib/admin-subscriptions";
import { subscriptionFiltersSchema } from "@/lib/admin-subscription-rules";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/admin/subscriptions")({
  head: () => pageMetadata("Subscriptions", "PLATFORM_ADMIN"),
  validateSearch: (input) => subscriptionFiltersSchema.parse({ ...input, page: Number(input.page ?? 0) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => { await context.queryClient.ensureQueryData(adminSubscriptionsQuery(deps)); },
  pendingComponent: () => <div className="p-6"><LoadingState label="Loading subscriptions…" /></div>,
  errorComponent: SubscriptionError,
  component: Page,
});

function Page() {
  return <AdminSubscriptionsPage filters={Route.useSearch()} />;
}

function SubscriptionError() {
  const router = useRouter();
  return <ErrorState title="Subscriptions couldn't load" description="Check your connection and platform admin access, then try again." onRetry={() => void router.invalidate()} />;
}
