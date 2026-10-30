import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  Mail,
  RefreshCw,
  ShieldAlert,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState, StatusBadge } from "@/components/careflow/feedback";
import {
  getClinicGmailStatusFn,
  initiateGmailConnectionFn,
  disconnectClinicGmailFn,
} from "@/lib/gmail.functions";
import { toast } from "@/lib/toast";

export function ClinicGmailSettings({ clinicId }: { clinicId: string }) {
  const qc = useQueryClient();
  const getGmailStatus = useServerFn(getClinicGmailStatusFn);
  const initiateGmail = useServerFn(initiateGmailConnectionFn);
  const disconnectGmail = useServerFn(disconnectClinicGmailFn);

  const {
    data: gmailStatus,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["clinic-gmail-status", clinicId],
    queryFn: () => getGmailStatus({ data: { clinicId } }),
    enabled: !!clinicId,
    staleTime: 15_000,
  });

  const connectMutation = useMutation({
    mutationFn: () => initiateGmail({ data: { clinicId, returnTo: "/clinic/settings" } }),
    onSuccess: res => {
      if (res?.url) {
        window.location.href = res.url;
      }
    },
    onError: err => {
      toast.error(err instanceof Error ? err.message : "Failed to initiate Google authorization.");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectGmail({ data: { clinicId } }),
    onSuccess: () => {
      toast.success("Clinic Gmail disconnected. Team invitations will pause until reconnected.");
      void qc.invalidateQueries({ queryKey: ["clinic-gmail-status", clinicId] });
    },
    onError: err => {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect Gmail.");
    },
  });

  const isConnected = !!gmailStatus?.connected;
  const isRevoked = gmailStatus?.status === "REVOKED";
  const isConfigured = gmailStatus?.configured !== false;

  const tone = isConnected ? "success" : isRevoked ? "danger" : "neutral";
  const statusLabel = isConnected
    ? "Connected"
    : isRevoked
      ? "Disconnected"
      : !isConfigured
        ? "Unconfigured"
        : "Not connected";

  return (
    <section aria-label="Gmail Connection" className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mail aria-hidden="true" className="size-5 text-primary" />
          <h2 className="text-base font-semibold">Gmail Connection</h2>
        </div>
        {!isLoading && !isError && (
          <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
        )}
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        Connect your clinic's Gmail account to send doctor and staff invitations from your verified address.
      </p>

      {isLoading ? (
        <div className="mt-4">
          <LoadingState label="Checking clinic Gmail authorization…" />
        </div>
      ) : isError ? (
        <div className="mt-4">
          <ErrorState title="Couldn't load Gmail connection status" onRetry={() => void refetch()} />
        </div>
      ) : isConnected ? (
        <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="size-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Authorized Sender Account</p>
                <p className="text-xs text-muted-foreground">
                  Sending invitations from <strong className="font-semibold text-foreground">{gmailStatus.senderEmail}</strong>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Doctor and staff invitation emails will be sent securely through this account.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={connectMutation.isPending || disconnectMutation.isPending}
                onClick={() => connectMutation.mutate()}
              >
                {connectMutation.isPending ? (
                  <LoaderCircle className="size-3.5 animate-spin mr-1.5" />
                ) : (
                  <RefreshCw className="size-3.5 mr-1.5" />
                )}
                Reconnect
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={disconnectMutation.isPending || connectMutation.isPending}
                onClick={() => disconnectMutation.mutate()}
              >
                {disconnectMutation.isPending ? (
                  <LoaderCircle className="size-3.5 animate-spin mr-1.5" />
                ) : (
                  <Unlink className="size-3.5 mr-1.5" />
                )}
                Disconnect
              </Button>
            </div>
          </div>
        </div>
      ) : isRevoked ? (
        <div className="mt-4 rounded-md border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="size-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Gmail Connection Disconnected</p>
                <p className="text-xs text-muted-foreground">
                  {gmailStatus?.senderEmail
                    ? `Authorization for ${gmailStatus.senderEmail} was disconnected or revoked. Team invitations will pause until you reconnect.`
                    : "Gmail connection has been revoked. Reconnect your account to send team invitations."}
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={connectMutation.isPending}
              onClick={() => connectMutation.mutate()}
            >
              {connectMutation.isPending ? (
                <LoaderCircle className="size-3.5 animate-spin mr-1.5" />
              ) : (
                <Mail className="size-3.5 mr-1.5" />
              )}
              Reconnect Gmail
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-md border p-4 bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Mail className="size-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">No Gmail Account Linked</p>
                <p className="text-xs text-muted-foreground">
                  Doctor and staff invitation emails must be sent from your clinic's own authorized Gmail account.
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={connectMutation.isPending || !isConfigured}
              onClick={() => connectMutation.mutate()}
            >
              {connectMutation.isPending ? (
                <LoaderCircle className="size-3.5 animate-spin mr-1.5" />
              ) : (
                <ExternalLink className="size-3.5 mr-1.5" />
              )}
              Connect clinic Gmail
            </Button>
          </div>
          {!isConfigured && (
            <p className="mt-2 text-xs text-destructive">
              Google OAuth credentials are not configured on the server.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

