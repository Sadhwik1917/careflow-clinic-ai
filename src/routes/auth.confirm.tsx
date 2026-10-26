import { useEffect, useState, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, ArrowRight, LoaderCircle } from "lucide-react";
import { AuthLayout, FormAlert } from "@/components/careflow/auth-ui";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { safeRedirect } from "@/lib/access";
import { authErrorMessage } from "@/lib/auth";
import { publicMeta } from "@/lib/public-meta";
import { toast } from "@/lib/toast";

export const Route = createFileRoute("/auth/confirm")({
  validateSearch: (s: Record<string, unknown>): {
    redirect?: string | undefined;
    code?: string | undefined;
    token_hash?: string | undefined;
    type?: string | undefined;
    error?: string | undefined;
    error_description?: string | undefined;
  } => ({
    redirect: safeRedirect(s["redirect"]),
    code: typeof s["code"] === "string" ? s["code"] : undefined,
    token_hash: typeof s["token_hash"] === "string" ? s["token_hash"] : undefined,
    type: typeof s["type"] === "string" ? s["type"] : undefined,
    error: typeof s["error"] === "string" ? s["error"] : undefined,
    error_description: typeof s["error_description"] === "string" ? s["error_description"] : undefined,
  }),
  head: () => publicMeta("Email Confirmation", "Confirm your CAREFLOW AI email."),
  component: AuthConfirmPage,
});

function AuthConfirmPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const handledRef = useRef(false);

  const destination = search.redirect || "/workspace";
  const returnUrl = destination.includes("?") ? `${destination}&confirmed=true` : `${destination}?confirmed=true`;

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    async function handleConfirmation() {
      // 1. Check if error exists in URL query or hash
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const hashParams = hash ? new URLSearchParams(hash.replace(/^#/, "")) : null;

      const urlError = search.error || hashParams?.get("error");
      const urlErrorDesc = search.error_description || hashParams?.get("error_description");

      if (urlError || urlErrorDesc) {
        setStatus("error");
        setErrorMessage(urlErrorDesc || urlError || "Email confirmation failed or was cancelled.");
        toast.error(urlErrorDesc || "Email confirmation failed.");
        return;
      }

      // 2. PKCE code exchange
      if (search.code) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(search.code);
          if (error) {
            setStatus("error");
            setErrorMessage(authErrorMessage(error));
            toast.error(authErrorMessage(error));
            return;
          }
          if (data.session) {
            setStatus("success");
            toast.success({ title: "Email confirmed", description: "Your email has been confirmed successfully." });
            return;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to verify confirmation code.";
          setStatus("error");
          setErrorMessage(msg);
          return;
        }
      }

      // 3. OTP Token Hash (verifyOtp)
      if (search.token_hash) {
        try {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: search.token_hash,
            type: (search.type as any) || "signup",
          });
          if (error) {
            setStatus("error");
            setErrorMessage(authErrorMessage(error));
            toast.error(authErrorMessage(error));
            return;
          }
          if (data.session) {
            setStatus("success");
            toast.success({ title: "Email confirmed", description: "Your email has been confirmed successfully." });
            return;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to verify token hash.";
          setStatus("error");
          setErrorMessage(msg);
          return;
        }
      }

      // 4. Check if session was already established or parsed from hash fragment
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        setStatus("success");
        toast.success({ title: "Email confirmed", description: "Your email has been confirmed successfully." });
        return;
      }

      // 5. Short wait for auth listener to catch up if tokens were just stored
      const timer = setTimeout(async () => {
        const { data: retryData } = await supabase.auth.getSession();
        if (retryData.session) {
          setStatus("success");
          toast.success({ title: "Email confirmed", description: "Your email has been confirmed successfully." });
        } else {
          // No tokens or active session detected
          setStatus("error");
          setErrorMessage("This confirmation link is invalid, has already been used, or has expired. Please sign in to check your account status.");
        }
      }, 1000);

      return () => clearTimeout(timer);
    }

    void handleConfirmation();
  }, [search]);

  // Auto redirect after confirmation
  useEffect(() => {
    if (status !== "success") return;
    const timer = setTimeout(() => {
      void navigate({ to: returnUrl as any, replace: true });
    }, 1500);
    return () => clearTimeout(timer);
  }, [status, returnUrl, navigate]);

  if (status === "verifying") {
    return (
      <AuthLayout title="Confirming your email…">
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <LoaderCircle className="size-8 animate-spin text-primary mb-3" />
          <p className="text-sm text-muted-foreground">Verifying your email confirmation with CAREFLOW AI…</p>
        </div>
      </AuthLayout>
    );
  }

  if (status === "error") {
    return (
      <AuthLayout title="Confirmation issue">
        <div className="space-y-4">
          <FormAlert tone="error">{errorMessage || "Verification link could not be verified."}</FormAlert>
          <div className="space-y-2 pt-2">
            <Button asChild className="w-full">
              <Link to="/login" search={{ redirect: destination }}>
                Sign in to check account
              </Link>
            </Button>
            {destination && destination !== "/workspace" && (
              <Button asChild variant="outline" className="w-full">
                <Link to={destination}>Back to invitation</Link>
              </Button>
            )}
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Email Confirmed!">
      <div className="space-y-5 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="size-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Email confirmed successfully</h2>
          <p className="text-sm text-muted-foreground">
            Your account is verified. Redirecting you to continue with your clinic invitation…
          </p>
        </div>
        <Button asChild className="w-full">
          <Link to={returnUrl}>
            Continue to Invitation <ArrowRight className="size-4 ml-1.5" />
          </Link>
        </Button>
      </div>
    </AuthLayout>
  );
}
