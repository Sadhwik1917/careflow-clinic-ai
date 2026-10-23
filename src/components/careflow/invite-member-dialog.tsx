import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, MailPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { MotionDialogContent, DialogTitle, DialogDescription } from "./motion-primitives";
import { inviteClinicMember } from "@/lib/team.functions";
import { inviteSchema } from "@/lib/team";

export function InviteMemberDialog({ userId, clinicId }: { userId: string; clinicId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"DOCTOR" | "STAFF">("DOCTOR");
  const [error, setError] = useState("");
  const invite = useServerFn(inviteClinicMember);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => invite({ data: { clinicId, fields: { email, role } } }),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["invitations", userId, clinicId] }), qc.invalidateQueries({ queryKey: ["staff", userId, clinicId] }), qc.invalidateQueries({ queryKey: ["doctors", userId, clinicId] })]);
      setOpen(false); setEmail(""); setRole("DOCTOR"); setError("");
    },
    onError: e => setError(e instanceof Error ? e.message : "The invitation could not be sent."),
  });
  return <Dialog open={open} onOpenChange={v => { if (!mutation.isPending) { setOpen(v); setError(""); } }}>
    <DialogTrigger asChild><Button><MailPlus />Invite member</Button></DialogTrigger>
    <MotionDialogContent className="max-w-md">
      <DialogTitle>Invite a team member</DialogTitle>
      <DialogDescription>They'll receive an invitation to join your clinic as a doctor or staff member. Invitations expire after 7 days.</DialogDescription>
      <form noValidate className="mt-4 space-y-4" onSubmit={e => {
        e.preventDefault(); if (mutation.isPending) return;
        const parsed = inviteSchema.safeParse({ email, role });
        if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the invitation details."); return; }
        setError(""); mutation.mutate();
      }}>
        <div className="space-y-2"><Label htmlFor="invite-email">Email address *</Label><Input id="invite-email" type="email" maxLength={255} value={email} onChange={e => { setEmail(e.target.value); setError(""); mutation.reset(); }} required /></div>
        <div className="space-y-2"><Label htmlFor="invite-role">Role</Label><Select value={role} onValueChange={v => setRole(v as "DOCTOR" | "STAFF")}><SelectTrigger id="invite-role"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DOCTOR">Doctor</SelectItem><SelectItem value="STAFF">Staff</SelectItem></SelectContent></Select></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-2"><Button type="submit" disabled={mutation.isPending}>{mutation.isPending && <LoaderCircle className="animate-spin" />}{mutation.isPending ? "Sending…" : "Send invitation"}</Button></div>
      </form>
    </MotionDialogContent>
  </Dialog>;
}
