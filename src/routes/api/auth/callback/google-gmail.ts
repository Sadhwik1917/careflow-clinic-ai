import { createFileRoute } from "@tanstack/react-router";
import { exchangeAndStoreGoogleAuth } from "@/lib/gmail.server";

export const Route = createFileRoute("/api/auth/callback/google-gmail")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const stateRaw = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        let returnTarget = "/clinic/dashboard";
        let clinicId: string | undefined;

        if (stateRaw) {
          try {
            const stateJson = Buffer.from(stateRaw, "base64url").toString("utf8");
            const state = JSON.parse(stateJson) as { clinicId?: string; nonce?: string; returnTo?: string };
            clinicId = state.clinicId;
            if (state.returnTo && typeof state.returnTo === "string" && state.returnTo.startsWith("/")) {
              returnTarget = state.returnTo;
            }
          } catch {
            // Keep default target
          }
        }

        if (error) {
          const reason = error === "access_denied" ? "Google authorization was cancelled." : `Google error: ${error}`;
          return new Response(null, {
            status: 302,
            headers: { Location: `${returnTarget}?gmail_error=${encodeURIComponent(reason)}` },
          });
        }

        if (!code || !stateRaw) {
          return new Response(null, {
            status: 302,
            headers: { Location: `${returnTarget}?gmail_error=${encodeURIComponent("Missing authorization code or state parameter.")}` },
          });
        }

        try {
          if (!clinicId) {
            return new Response(null, {
              status: 302,
              headers: { Location: `${returnTarget}?gmail_error=${encodeURIComponent("Invalid authorization state.")}` },
            });
          }

          // Fetch clinic registered email from database
          let clinicEmail = "";
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: clinic } = await supabaseAdmin.from("clinics").select("email").eq("id", clinicId).maybeSingle();
            clinicEmail = clinic?.email || "";
          } catch {
            // Keep empty if unconfigured in tests
          }

          await exchangeAndStoreGoogleAuth(code, clinicId, clinicEmail);

          return new Response(null, {
            status: 302,
            headers: { Location: `${returnTarget}?gmail_connected=success` },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to complete Google OAuth connection.";
          return new Response(null, {
            status: 302,
            headers: { Location: `${returnTarget}?gmail_error=${encodeURIComponent(msg)}` },
          });
        }
      },
    },
  },
});
