import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setSelectedClinicId } from "@/lib/access";

type AuthState = { session: Session | null; ready: boolean };
const AuthContext = createContext<AuthState>({ session: null, ready: false });

/** The single auth listener for the app. Session persistence is handled by the existing Supabase client. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, ready: false });
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ session, ready: true });
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (event === "SIGNED_OUT") { queryClient.removeQueries({ queryKey: ["access"] }); setSelectedClinicId(null); }
      else void queryClient.invalidateQueries({ queryKey: ["access"] });
      void router.invalidate();
    });
    void supabase.auth.getSession().then(({ data: d }) => setState(s => (s.ready ? s : { session: d.session, ready: true })));
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    setSelectedClinicId(null);
    await supabase.auth.signOut();
    void navigate({ to: "/login", replace: true });
  };
}

/** Converts Supabase Auth errors into plain messages without exposing internals. */
export function authErrorMessage(error: { message?: string | undefined; code?: string | undefined; status?: number | undefined } | null | undefined): string {
  if (!error) return "Something went wrong. Please try again.";
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "The email or password is incorrect.";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) return "Please confirm your email address using the link we sent, then sign in.";
  if (code === "user_already_exists" || code === "email_exists" || msg.includes("already registered")) return "An account with this email already exists. Try signing in instead.";
  if (code === "weak_password" || msg.includes("password should")) return error.message ?? "This password does not meet the security requirements.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || error.status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (code === "signup_disabled" || msg.includes("signups not allowed")) return "New sign-ups are currently disabled.";
  if (code === "email_provider_disabled" || msg.includes("email logins are disabled")) return "Email sign-in is not enabled for this application.";
  if (msg.includes("failed to fetch") || msg.includes("network")) return "We couldn't reach the server. Check your connection and try again.";
  return error.message || "Something went wrong. Please try again.";
}
