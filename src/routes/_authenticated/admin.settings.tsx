import { createFileRoute } from "@tanstack/react-router";
import { AdminSettingsPage } from "@/components/careflow/admin-settings-page";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => pageMetadata("Settings", "PLATFORM_ADMIN"),
  component: Page,
});

function Page() {
  const { access } = Route.useRouteContext();
  return <AdminSettingsPage access={access} />;
}
