import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ErrorState, LoadingState } from "@/components/careflow/feedback";
import { AdminAnalyticsPage } from "@/components/careflow/admin-analytics-page";
import { adminAnalyticsQuery } from "@/lib/admin-analytics";
import { analyticsSearchSchema } from "@/lib/admin-analytics-rules";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => pageMetadata("Analytics", "PLATFORM_ADMIN"),
  validateSearch: (input) => analyticsSearchSchema.parse(input),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: async ({ context, deps }) => { await context.queryClient.ensureQueryData(adminAnalyticsQuery(deps.range)); },
  pendingComponent: () => <div className="p-6"><LoadingState label="Loading analytics…" /></div>,
  errorComponent: AnalyticsError,
  component: Page,
});

function Page() {
  return <AdminAnalyticsPage range={Route.useSearch().range} />;
}

function AnalyticsError() {
  const router = useRouter();
  return <ErrorState title="Analytics couldn't load" description="Check your connection and platform admin access, then try again." onRetry={() => void router.invalidate()} />;
}
