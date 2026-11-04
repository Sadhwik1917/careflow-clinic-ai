import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle } from "lucide-react";
import { z } from "zod";
import { AuthLayout, FormAlert, FormField, PasswordInput } from "@/components/careflow/auth-ui";
import { LoadingState } from "@/components/careflow/feedback";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { authErrorMessage } from "@/lib/auth";
import { publicMeta } from "@/lib/public-meta";
import { syncPatientAccountFn } from "@/lib/patient-registration.functions";

export const Route = createFileRoute("/reset-password")({
  head: () =>
    publicMeta(
      "Choose a new password",
      "Set a secure password for your CAREFLOW AI account.",
      { noindex: true }
    ),
  component: ResetPasswordPage,
});

const schema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters.").max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords do not match.",
  });

function ResetPasswordPage() {
  const navigate = useNavigate();
  const syncPatientAccount = useServerFn(syncPatientAccountFn);
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [values, setValues] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState<{ password?: string | undefined; confirm?: string | undefined }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const search = typeof window !== "undefined" ? window.location.search : "";

    const hasAuthToken =
      hash.includes("type=recovery") ||
      hash.includes("type=invite") ||
      hash.includes("type=signup") ||
      hash.includes("access_token=") ||
      new URLSearchParams(search).has("code");

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        event === "PASSWORD_RECOVERY" ||
        (event === "SIGNED_IN" && session) ||
        (event === "USER_UPDATED" && session)
      ) {
        setStatus("ready");
      }
    });

    const timer = window.setTimeout(async () => {
      const { data: s } = await supabase.auth.getSession();
      setStatus((cur) =>
        cur === "ready" ? cur : (hasAuthToken && Boolean(s.session)) || Boolean(s.session) ? "ready" : "invalid"
      );
    }, 800);

    return () => {
      window.clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      setErrors({ password: f.password?.[0], confirm: f.confirm?.[0] });
      return;
    }

    setErrors({});
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      setSubmitting(false);
      setFormError(authErrorMessage(error));
      return;
    }

    // Proactively synchronize verified patient self-registrations
    try {
      await syncPatientAccount();
    } catch {
      // Non-fatal; workspace layout / fetchUserAccess will also synchronize
    }

    setSubmitting(false);
    void navigate({ to: "/workspace", replace: true });
  }

  return (
    <AuthLayout
      title="Set your account password"
      description="Create a secure password to activate your CAREFLOW account."
      footer={
        <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {status === "checking" && <LoadingState label="Verifying your activation link…" />}
      {status === "invalid" && (
        <FormAlert>
          This activation or reset link is invalid or has expired.{" "}
          <Link to="/forgot-password" className="font-medium underline">
            Request a new one
          </Link>
          .
        </FormAlert>
      )}
      {status === "ready" && (
        <form noValidate onSubmit={onSubmit} className="space-y-5">
          {formError && <FormAlert>{formError}</FormAlert>}
          <FormField id="password" label="New password" error={errors.password}>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              value={values.password}
              onChange={(v) => setValues((s) => ({ ...s, password: v }))}
              error={errors.password}
            />
          </FormField>
          <FormField id="confirm" label="Confirm new password" error={errors.confirm}>
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
              value={values.confirm}
              onChange={(v) => setValues((s) => ({ ...s, confirm: v }))}
              error={errors.confirm}
            />
          </FormField>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <LoaderCircle className="animate-spin" />}
            {submitting ? "Saving password…" : "Save password & enter portal"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
