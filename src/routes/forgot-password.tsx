import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { z } from "zod";
import { AuthLayout, FormAlert, FormField } from "@/components/careflow/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { authErrorMessage } from "@/lib/auth";
import { publicMeta } from "@/lib/public-meta";

export const Route = createFileRoute("/forgot-password")({
  head: () => publicMeta("Reset your password", "Request a password reset link for your CAREFLOW AI account.", { noindex: true }),
  component: ForgotPasswordPage,
});

const emailSchema = z.string().trim().min(1, "Enter your email address.").email("Enter a valid email address.").max(255);

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message); return; }
    setError(undefined);
    setSubmitting(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${window.location.origin}/reset-password` });
    setSubmitting(false);
    if (err) setFormError(authErrorMessage(err)); else setSent(true);
  }

  return <AuthLayout title="Reset your password" description="Enter your email and we'll send you a link to choose a new password." footer={<Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">Back to sign in</Link>}>
    {sent ? <FormAlert tone="success">If an account exists for {email.trim()}, a reset link is on its way. Check your inbox.</FormAlert> :
      <form noValidate onSubmit={onSubmit} className="space-y-5">
        {formError && <FormAlert>{formError}</FormAlert>}
        <FormField id="email" label="Email address" error={error}><Input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!error} aria-describedby={error ? "email-error" : undefined} /></FormField>
        <Button type="submit" className="w-full" disabled={submitting}>{submitting && <LoaderCircle className="animate-spin" />}{submitting ? "Sending…" : "Send reset link"}</Button>
      </form>}
  </AuthLayout>;
}
