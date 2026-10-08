import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LoaderCircle, MailCheck } from "lucide-react";
import { z } from "zod";
import { AuthLayout, FormAlert, FormField, PasswordInput } from "@/components/careflow/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { redirectSearch } from "@/lib/access";
import { authErrorMessage, useAuth } from "@/lib/auth";
import { publicMeta } from "@/lib/public-meta";

export const Route = createFileRoute("/signup")({
  validateSearch: redirectSearch,
  head: () => publicMeta("Create account", "Create your CAREFLOW AI account."),
  component: SignupPage,
});

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "Name must be 100 characters or fewer."),
  email: z.string().trim().min(1, "Enter your email address.").email("Enter a valid email address.").max(255),
  password: z.string().min(8, "Use at least 8 characters.").max(72, "Use 72 characters or fewer."),
  confirm: z.string(),
}).refine(v => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match." });
type Field = "name" | "email" | "password" | "confirm";

function SignupPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { session, ready } = useAuth();
  const [values, setValues] = useState<Record<Field, string>>({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const set = (k: Field) => (v: string) => setValues(s => ({ ...s, [k]: v }));

  useEffect(() => { if (ready && session) void navigate({ to: redirect ?? "/workspace", replace: true }); }, [ready, session, redirect, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = schema.safeParse(values);
    if (!parsed.success) { const f = parsed.error.flatten().fieldErrors; setErrors({ name: f.name?.[0], email: f.email?.[0], password: f.password?.[0], confirm: f.confirm?.[0] }); return; }
    setErrors({});
    setSubmitting(true);
    // display_name is read by the existing database signup trigger; no role or membership is sent.
    const { data, error } = await supabase.auth.signUp({ email: parsed.data.email, password: parsed.data.password, options: { emailRedirectTo: window.location.origin + "/login", data: { display_name: parsed.data.name } } });
    setSubmitting(false);
    if (error) { setFormError(authErrorMessage(error)); return; }
    if (data.user && data.user.identities?.length === 0) { setFormError("An account with this email already exists. Try signing in instead."); return; }
    if (!data.session) setSentTo(parsed.data.email);
  }

  if (sentTo) return <AuthLayout title="Check your email" footer={<Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">Back to sign in</Link>}>
    <div className="flex flex-col items-center gap-4 text-center"><span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary"><MailCheck className="size-6" /></span><p className="text-sm leading-relaxed text-muted-foreground">We sent a confirmation link to <span className="font-medium text-foreground">{sentTo}</span>. Open it to activate your account, then sign in.</p></div>
  </AuthLayout>;

  return <AuthLayout title="Create your account" description="Set up your CAREFLOW AI sign-in." footer={<>Already have an account? <Link to="/login" search={{ redirect }} className="font-medium text-primary underline-offset-4 hover:underline">Sign in</Link></>}>
    <form noValidate onSubmit={onSubmit} className="space-y-5">
      {formError && <FormAlert>{formError}</FormAlert>}
      <FormField id="name" label="Full name" error={errors.name}><Input id="name" name="name" autoComplete="name" value={values.name} onChange={e => set("name")(e.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} /></FormField>
      <FormField id="email" label="Email address" error={errors.email}><Input id="email" name="email" type="email" autoComplete="email" value={values.email} onChange={e => set("email")(e.target.value)} aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} /></FormField>
      <FormField id="password" label="Password" error={errors.password} hint="At least 8 characters."><PasswordInput id="password" autoComplete="new-password" value={values.password} onChange={set("password")} error={errors.password} hint="At least 8 characters." /></FormField>
      <FormField id="confirm" label="Confirm password" error={errors.confirm}><PasswordInput id="confirm" autoComplete="new-password" value={values.confirm} onChange={set("confirm")} error={errors.confirm} /></FormField>
      <Button type="submit" className="w-full" disabled={submitting}>{submitting && <LoaderCircle className="animate-spin" />}{submitting ? "Creating account…" : "Create account"}</Button>
    </form>
  </AuthLayout>;
}
