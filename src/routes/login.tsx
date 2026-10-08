import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { z } from "zod";
import { AuthLayout, FormAlert, FormField, PasswordInput } from "@/components/careflow/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { redirectSearch } from "@/lib/access";
import { authErrorMessage, useAuth } from "@/lib/auth";
import { publicMeta } from "@/lib/public-meta";

export const Route = createFileRoute("/login")({
  validateSearch: redirectSearch,
  head: () => publicMeta("Sign in", "Sign in to your CAREFLOW AI clinic workspace."),
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email address.").email("Enter a valid email address.").max(255),
  password: z.string().min(1, "Enter your password.").max(128),
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { session, ready } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"email" | "password", string | undefined>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (ready && session) void navigate({ to: redirect ?? "/workspace", replace: true }); }, [ready, session, redirect, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) { const f = parsed.error.flatten().fieldErrors; setErrors({ email: f.email?.[0], password: f.password?.[0] }); return; }
    setErrors({});
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setSubmitting(false);
    if (error) setFormError(authErrorMessage(error));
  }

  return <AuthLayout title="Sign in" description="Welcome back. Sign in to your clinic workspace." footer={<>New to CAREFLOW AI? <Link to="/signup" search={{ redirect }} className="font-medium text-primary underline-offset-4 hover:underline">Create an account</Link></>}>
    <form noValidate onSubmit={onSubmit} className="space-y-5">
      {formError && <FormAlert>{formError}</FormAlert>}
      <FormField id="email" label="Email address" error={errors.email}><Input id="email" name="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} /></FormField>
      <div className="space-y-2">
        <FormField id="password" label="Password" error={errors.password}><PasswordInput id="password" autoComplete="current-password" value={password} onChange={setPassword} error={errors.password} /></FormField>
        <div className="text-right"><Link to="/forgot-password" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Forgot password?</Link></div>
      </div>
      <Button type="submit" className="w-full" disabled={submitting}>{submitting && <LoaderCircle className="animate-spin" />}{submitting ? "Signing in…" : "Sign in"}</Button>
    </form>
  </AuthLayout>;
}
