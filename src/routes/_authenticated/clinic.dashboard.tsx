import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/components/careflow/workspace-page";
import { InviteMemberDialog } from "@/components/careflow/invite-member-dialog";
import { pageMetadata } from "@/lib/navigation";
import { toast } from "@/lib/toast";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clinic/dashboard")({
  head: () => pageMetadata("Dashboard", "OWNER"),
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  const clinicId = membership?.clinic_id ?? "";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("gmail_connected");
    const error = params.get("gmail_error");
    if (connected === "success") {
      toast.success({
        title: "Gmail connected",
        description: "Your clinic Gmail account has been authorized to send team invitations.",
      });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error) {
      toast.error({
        title: "Gmail authorization failed",
        description: decodeURIComponent(error),
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return (
    <WorkspacePage
      role="OWNER"
      title="Dashboard"
      dashboard
      actions={clinicId ? <InviteMemberDialog userId={user.id} clinicId={clinicId} /> : undefined}
      extraContent={
        clinicId ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card/60 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Grow your clinic team</p>
                <p className="text-xs text-muted-foreground">
                  Invite doctors and staff to join your clinic. Invitations are sent from your authorized clinic Gmail address.
                </p>
              </div>
            </div>
            <InviteMemberDialog userId={user.id} clinicId={clinicId} />
          </div>
        ) : undefined
      }
    />
  );
}
