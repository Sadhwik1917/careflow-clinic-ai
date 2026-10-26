import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, LoaderCircle, Mail, MailPlus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { MotionDialogContent, DialogTitle, DialogDescription } from "./motion-primitives";
import { inviteClinicMember } from "@/lib/team.functions";
import { getClinicGmailStatusFn, initiateGmailConnectionFn } from "@/lib/gmail.functions";
import { inviteSchema } from "@/lib/team";
import { toast } from "@/lib/toast";

export function InviteMemberDialog({ userId, clinicId }: { userId: string; clinicId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"DOCTOR" | "STAFF">("DOCTOR");
  const [error, setError] = useState("");

  const invite = useServerFn(inviteClinicMember);
  const getGmailStatus = useServerFn(getClinicGmailStatusFn);
  const initiateGmail = useServerFn(initiateGmailConnectionFn);
  const qc = useQueryClient();

  const { data: gmailStatus, isLoading: checkingGmail } = useQuery({
    queryKey: ["clinic-gmail-status", clinicId],
    queryFn: () => getGmailStatus({ data: { clinicId } }),
    enabled: open,
  });

  const connectGmailMutation = useMutation({
    mutationFn: () => initiateGmail({ data: { clinicId } }),
    onSuccess: res => {
      if (res?.url) {
        window.location.href = res.url;
      }
    },
    onError: err => {
      toast.error(err instanceof Error ? err.message : "Failed to initiate Google authorization.");
    },
  });

  const mutation = useMutation({
    mutationFn: () => invite({ data: { clinicId, fields: { email, role } } }),
    onSuccess: async res => {
      const roleLabel = role === "DOCTOR" ? "Doctor" : "Staff member";
      toast.success({
        title: "Invitation sent",
        description: `Invitation sent to ${email} as ${roleLabel}.`,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["invitations", userId, clinicId] }),
        qc.invalidateQueries({ queryKey: ["staff", userId, clinicId] }),
        qc.invalidateQueries({ queryKey: ["doctors", userId, clinicId] }),
      ]);
      setOpen(false);
      setEmail("");
      setRole("DOCTOR");
      setError("");
    },
    onError: e => {
      const msg = e instanceof Error ? e.message : "The invitation could not be sent.";
      setError(msg);
      toast.error({ title: "Invitation failed", description: msg });
    },
  });

  const isConnected = gmailStatus?.connected;

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!mutation.isPending) {
          setOpen(v);
          setError("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <MailPlus className="size-4" />
          Invite member
        </Button>
      </DialogTrigger>
      <MotionDialogContent className="max-w-md">
        <DialogTitle>Invite a team member</DialogTitle>
        <DialogDescription>
          They'll receive an invitation to join your clinic as a doctor or staff member. Invitations expire after 7 days.
        </DialogDescription>

        {checkingGmail ? (
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" />
            <span>Checking clinic Gmail authorization…</span>
          </div>
        ) : isConnected ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
            <CheckCircle2 className="size-3.5 text-primary shrink-0" />
            <span>
              Sending invitations from authorized Gmail: <strong className="font-medium">{gmailStatus.senderEmail}</strong>
            </span>
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
            <div className="flex items-start gap-2">
              <ShieldAlert className="size-4 text-warning shrink-0 mt-0.5" />
              <div className="space-y-1.5 flex-1">
                <p className="font-semibold text-foreground">Clinic Gmail connection required</p>
                <p className="text-muted-foreground">
                  Doctor and Staff invitation emails must be sent from your clinic's own authorized Gmail account.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1 h-7 text-xs"
                  disabled={connectGmailMutation.isPending}
                  onClick={() => connectGmailMutation.mutate()}
                >
                  {connectGmailMutation.isPending ? <LoaderCircle className="size-3 animate-spin mr-1" /> : <Mail className="size-3 mr-1" />}
                  Connect clinic Gmail <ExternalLink className="size-3 ml-1 opacity-70" />
                </Button>
              </div>
            </div>
          </div>
        )}

        <form
          noValidate
          className="mt-4 space-y-4"
          onSubmit={e => {
            e.preventDefault();
            if (mutation.isPending) return;
            const parsed = inviteSchema.safeParse({ email, role });
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? "Check the invitation details.");
              return;
            }
            setError("");
            mutation.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email address *</Label>
            <Input
              id="invite-email"
              type="email"
              maxLength={255}
              placeholder="colleague@example.com"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                setError("");
                mutation.reset();
              }}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={v => setRole(v as "DOCTOR" | "STAFF")}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DOCTOR">Doctor</SelectItem>
                <SelectItem value="STAFF">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <LoaderCircle className="animate-spin" />}
              {mutation.isPending ? "Sending…" : "Send invitation"}
            </Button>
          </div>
        </form>
      </MotionDialogContent>
    </Dialog>
  );
}
