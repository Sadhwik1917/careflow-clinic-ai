import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { z } from "zod";
import { PageTitle } from "./page-title";
import { MotionReveal } from "./motion-primitives";
import { FormAlert, FormField, PasswordInput } from "./auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { authErrorMessage } from "@/lib/auth";
import type { UserAccess } from "@/lib/access";

export const profileSchema = z.object({
  display_name: z.string().trim().min(2, "Enter at least 2 characters.").max(80, "Use 80 characters or fewer."),
  phone: z.string().trim().max(20, "Use 20 characters or fewer.").refine(v => v === "" || /^\+?[0-9 ()-]{7,20}$/.test(v), "Enter a valid phone number."),
});
export const passwordSchema = z.object({ password: z.string().min(8, "Use at least 8 characters.").max(72), confirm: z.string() })
  .refine(v => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match." });

type Feedback = { tone: "error" | "success"; text: string } | null;

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="grid gap-6 border-t py-8 md:grid-cols-[1fr_2fr]">
    <div><h2 className="text-base font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
    <div className="max-w-lg">{children}</div>
  </section>;
}

export function AdminSettingsPage({ access }: { access: UserAccess }) {
  const qc = useQueryClient();
  const [profile, setProfile] = useState({ display_name: access.profile?.display_name ?? "", phone: "" });
  const [pErr, setPErr] = useState<Record<string, string | undefined>>({});
  const [pMsg, setPMsg] = useState<Feedback>(null);
  const [pBusy, setPBusy] = useState(false);
  const [pw, setPw] = useState({ password: "", confirm: "" });
  const [wErr, setWErr] = useState<Record<string, string | undefined>>({});
  const [wMsg, setWMsg] = useState<Feedback>(null);
  const [wBusy, setWBusy] = useState(false);

  useEffect(() => {
    // Own row only (RLS); phone isn't part of the cached access data.
    supabase.from("profiles").select("display_name, phone").eq("id", access.userId).maybeSingle()
      .then(({ data }) => { if (data) setProfile({ display_name: data.display_name ?? "", phone: data.phone ?? "" }); });
  }, [access.userId]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault(); setPMsg(null);
    const parsed = profileSchema.safeParse(profile);
    if (!parsed.success) { setPErr(Object.fromEntries(parsed.error.issues.map(i => [String(i.path[0]), i.message]))); return; }
    setPErr({}); setPBusy(true);
    const { error } = await supabase.from("profiles").update({ display_name: parsed.data.display_name, phone: parsed.data.phone || null }).eq("id", access.userId);
    setPBusy(false);
    if (error) { setPMsg({ tone: "error", text: "We couldn't save your profile. Please try again." }); return; }
    setPMsg({ tone: "success", text: "Profile saved." });
    qc.invalidateQueries({ queryKey: ["access", access.userId] });
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault(); setWMsg(null);
    const parsed = passwordSchema.safeParse(pw);
    if (!parsed.success) { setWErr(Object.fromEntries(parsed.error.issues.map(i => [String(i.path[0]), i.message]))); return; }
    setWErr({}); setWBusy(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setWBusy(false);
    if (error) { setWMsg({ tone: "error", text: authErrorMessage(error) }); return; }
    setPw({ password: "", confirm: "" });
    setWMsg({ tone: "success", text: "Password updated." });
  }

  return <MotionReveal>
    <PageTitle title="Settings" description="Your administrator account" />
    <Section title="Profile" description="Your name and contact number as shown across CAREFLOW AI.">
      <form onSubmit={saveProfile} className="space-y-4" noValidate>
        <FormField id="email" label="Email" hint="Sign-in email can't be changed here."><Input id="email" value={access.email ?? ""} disabled readOnly /></FormField>
        <FormField id="display_name" label="Display name" error={pErr["display_name"]}><Input id="display_name" value={profile.display_name} onChange={e => setProfile(p => ({ ...p, display_name: e.target.value }))} aria-invalid={!!pErr["display_name"]} /></FormField>
        <FormField id="phone" label="Phone" error={pErr["phone"]}><Input id="phone" type="tel" value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} aria-invalid={!!pErr["phone"]} /></FormField>
        {pMsg && <FormAlert tone={pMsg.tone}>{pMsg.text}</FormAlert>}
        <Button type="submit" disabled={pBusy}>{pBusy && <LoaderCircle className="animate-spin" />}Save profile</Button>
      </form>
    </Section>
    <Section title="Password" description="Choose a strong password you don't use elsewhere.">
      <form onSubmit={savePassword} className="space-y-4" noValidate>
        <FormField id="new-password" label="New password" error={wErr["password"]}><PasswordInput id="new-password" value={pw.password} onChange={v => setPw(p => ({ ...p, password: v }))} error={wErr["password"]} autoComplete="new-password" /></FormField>
        <FormField id="confirm-password" label="Confirm password" error={wErr["confirm"]}><PasswordInput id="confirm-password" value={pw.confirm} onChange={v => setPw(p => ({ ...p, confirm: v }))} error={wErr["confirm"]} autoComplete="new-password" /></FormField>
        {wMsg && <FormAlert tone={wMsg.tone}>{wMsg.text}</FormAlert>}
        <Button type="submit" disabled={wBusy}>{wBusy && <LoaderCircle className="animate-spin" />}Update password</Button>
      </form>
    </Section>
  </MotionReveal>;
}
