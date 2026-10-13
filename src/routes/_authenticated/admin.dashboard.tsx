import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboard } from "@/components/careflow/admin-dashboard";
import { pageMetadata } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  head: () => pageMetadata("Dashboard", "PLATFORM_ADMIN"),
  component: AdminDashboard,
});
