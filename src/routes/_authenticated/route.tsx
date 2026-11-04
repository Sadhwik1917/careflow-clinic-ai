import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // If an unauthenticated user scanned a legacy QR code pointing to /clinic/patients/new?clinic=...
      const searchClinic = (location.search as Record<string, unknown> | undefined)?.["clinic"];
      if (location.pathname === "/clinic/patients/new" && typeof searchClinic === "string" && searchClinic.trim()) {
        throw redirect({ to: "/register", search: { clinic: searchClinic.trim() } });
      }
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
