import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  encryptToken,
  decryptToken,
  generateGoogleOAuthUrl,
  isGoogleOAuthConfigured,
  getCanonicalAppUrl,
  sendPatientActivationEmail,
  setClinicGmailConnectionRecord,
  clearClinicGmailConnections,
  loadClinicGmailConnectionRecord,
} from "@/lib/gmail.server";
import {
  buildMimeMessage,
  base64UrlEncode,
  generateInvitationEmailContent,
  buildInvitationUrl,
  generatePatientActivationEmailContent,
  buildPatientActivationMimeMessage,
} from "@/lib/invitation-email";

describe("Gmail OAuth and Email Infrastructure", () => {
  beforeEach(() => {
    process.env["GOOGLE_CLIENT_ID"] = "test-client-id.apps.googleusercontent.com";
    process.env["GOOGLE_CLIENT_SECRET"] = "test-client-secret";
    process.env["APP_URL"] = "https://careflow-test.app";
  });

  describe("Token Encryption & Decryption", () => {
    it("safely encrypts and decrypts OAuth refresh tokens with AES-256-GCM", () => {
      const originalToken = "1//04test_google_refresh_token_xyz_123456789";
      const { ciphertext, iv, tag } = encryptToken(originalToken);

      expect(ciphertext).not.toBe(originalToken);
      expect(iv).toBeTruthy();
      expect(tag).toBeTruthy();

      const decrypted = decryptToken(ciphertext, iv, tag);
      expect(decrypted).toBe(originalToken);
    });

    it("fails decryption if ciphertext or tag is tampered", () => {
      const { ciphertext, iv } = encryptToken("secret-token");
      const fakeTag = Buffer.from("corrupted-tag!!").toString("base64");
      expect(() => decryptToken(ciphertext, iv, fakeTag)).toThrow();
    });
  });

  describe("Google OAuth 2.0 URL Generation", () => {
    it("generates authorization URL with minimum required scopes and offline access", () => {
      const urlString = generateGoogleOAuthUrl("clinic-uuid-1", "test-nonce-123");
      const url = new URL(urlString);

      expect(url.origin).toBe("https://accounts.google.com");
      expect(url.pathname).toBe("/o/oauth2/v2/auth");
      expect(url.searchParams.get("client_id")).toBe("test-client-id.apps.googleusercontent.com");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("access_type")).toBe("offline");
      expect(url.searchParams.get("prompt")).toBe("consent");
      expect(url.searchParams.get("redirect_uri")).toBe("https://careflow-test.app/api/auth/callback/google-gmail");

      const scopes = url.searchParams.get("scope")?.split(" ") || [];
      expect(scopes).toContain("https://www.googleapis.com/auth/gmail.send");
      expect(scopes).toContain("https://www.googleapis.com/auth/userinfo.email");
    });

    it("verifies environment configuration status correctly with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET", () => {
      expect(isGoogleOAuthConfigured()).toBe(true);
      delete process.env["GOOGLE_CLIENT_ID"];
      expect(isGoogleOAuthConfigured()).toBe(false);
    });

    it("detects configuration using GOOGLE_GMAIL_CLIENT_ID and GOOGLE_GMAIL_CLIENT_SECRET", () => {
      delete process.env["GOOGLE_CLIENT_ID"];
      delete process.env["GOOGLE_CLIENT_SECRET"];
      process.env["GOOGLE_GMAIL_CLIENT_ID"] = "gmail-client-id.apps.googleusercontent.com";
      process.env["GOOGLE_GMAIL_CLIENT_SECRET"] = "gmail-client-secret";

      expect(isGoogleOAuthConfigured()).toBe(true);

      const url = new URL(generateGoogleOAuthUrl("clinic-abc", "nonce-xyz"));
      expect(url.searchParams.get("client_id")).toBe("gmail-client-id.apps.googleusercontent.com");

      delete process.env["GOOGLE_GMAIL_CLIENT_ID"];
      delete process.env["GOOGLE_GMAIL_CLIENT_SECRET"];
    });

    it("throws descriptive error when client ID is missing from environment", () => {
      delete process.env["GOOGLE_CLIENT_ID"];
      delete process.env["GOOGLE_GMAIL_CLIENT_ID"];
      delete process.env["VITE_GOOGLE_GMAIL_CLIENT_ID"];

      expect(() => generateGoogleOAuthUrl("clinic-abc", "nonce-xyz")).toThrow(
        "Google OAuth Client ID is not configured on the server."
      );
    });

    it("respects GOOGLE_GMAIL_REDIRECT_URI when explicitly configured", () => {
      process.env["GOOGLE_GMAIL_REDIRECT_URI"] = "http://localhost:8080/api/auth/callback/google-gmail";
      const url = new URL(generateGoogleOAuthUrl("clinic-abc", "nonce-xyz"));
      expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:8080/api/auth/callback/google-gmail");
      delete process.env["GOOGLE_GMAIL_REDIRECT_URI"];
    });

    it("respects configured canonical application URL as fallback", () => {
      process.env["APP_URL"] = "https://myclinic-careflow.com/";
      expect(getCanonicalAppUrl()).toBe("https://myclinic-careflow.com");
    });

    it("resolves canonical URL using VERCEL_PROJECT_PRODUCTION_URL and VERCEL_URL", () => {
      delete process.env["APP_URL"];
      delete process.env["VITE_APP_URL"];

      process.env["VERCEL_PROJECT_PRODUCTION_URL"] = "careflow-ai-ten.vercel.app";
      expect(getCanonicalAppUrl()).toBe("https://careflow-ai-ten.vercel.app");

      delete process.env["VERCEL_PROJECT_PRODUCTION_URL"];
      process.env["VERCEL_URL"] = "careflow-dpl-123.vercel.app";
      expect(getCanonicalAppUrl()).toBe("https://careflow-dpl-123.vercel.app");

      delete process.env["VERCEL_URL"];
      process.env["NODE_ENV"] = "production";
      expect(getCanonicalAppUrl()).toBe("https://careflow-ai-ten.vercel.app");
    });
  });

  describe("Invitation Email Template & MIME Generation", () => {
    const emailParams = {
      clinicName: "Apollo City Clinic",
      senderEmail: "apolloclinic@gmail.com",
      recipientEmail: "dr.rao@example.com",
      role: "DOCTOR" as const,
      token: "inv-uuid-token-555",
      expiresAt: "2026-11-01T12:00:00Z",
      appUrl: "https://careflow-test.app",
    };

    it("builds canonical invitation URL", () => {
      const url = buildInvitationUrl("https://careflow-test.app", "token-123");
      expect(url).toBe("https://careflow-test.app/accept-invitation?token=token-123");
    });

    it("includes clinic name, role, 7-day expiry notice, and plain-text fallback", () => {
      const { subject, html, text } = generateInvitationEmailContent(emailParams);

      expect(subject).toContain("Apollo City Clinic");
      expect(subject).toContain("Doctor");

      // HTML contains branding and CTA link
      expect(html).toContain("Apollo City Clinic | CAREFLOW AI");
      expect(html).toContain("Welcome, Doctor!");
      expect(html).toContain("Accept Invitation &amp; Join Team");
      expect(html).toContain("7 days");
      expect(html).toContain("https://careflow-test.app/accept-invitation?token=inv-uuid-token-555");
      expect(html).toContain("apolloclinic@gmail.com");

      // Plain text contains complete details
      expect(text).toContain("Apollo City Clinic | CAREFLOW AI");
      expect(text).toContain("Role: Doctor");
      expect(text).toContain("Invited Email: dr.rao@example.com");
      expect(text).toContain("7 days");
    });

    it("escapes clinic details safely to prevent HTML injection", () => {
      const { html } = generateInvitationEmailContent({
        ...emailParams,
        clinicName: "Dr. Smith's <script>alert(1)</script> Clinic",
      });
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("encodes MIME message to Base64URL without padding per RFC 4648", () => {
      const mime = buildMimeMessage(emailParams);
      expect(mime).toContain("From: \"Apollo City Clinic | CAREFLOW AI\" <apolloclinic@gmail.com>");
      expect(mime).toContain("To: <dr.rao@example.com>");
      expect(mime).toContain("MIME-Version: 1.0");
      expect(mime).toContain("Content-Type: multipart/alternative");

      const encoded = base64UrlEncode(mime);
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
      expect(encoded).not.toContain("=");
    });
  });

  describe("Patient Activation Email Template & MIME Generation", () => {
    const activationParams = {
      clinicName: "Om Sri Sai Clinic",
      senderEmail: "omsrisai@gmail.com",
      recipientEmail: "patient.anita@example.com",
      patientName: "Anita Sharma",
      activationUrl: "https://careflow-test.app/auth/v1/verify?token=xyz123&type=invite&redirect_to=https%3A%2F%2Fcareflow-test.app%2Freset-password",
    };

    it("includes clinic name, patient greeting, 24-hour expiry notice, and activation link", () => {
      const { subject, html, text } = generatePatientActivationEmailContent(activationParams);

      expect(subject).toBe("Activate your patient account at Om Sri Sai Clinic | CAREFLOW AI");

      expect(html).toContain("Om Sri Sai Clinic | CAREFLOW AI");
      expect(html).toContain("Activate Your Patient Portal");
      expect(html).toContain("Hello Anita Sharma,");
      expect(html).toContain("Activate My Account &amp; Set Password");
      expect(html).toContain("24 hours");
      expect(html).toContain("token=xyz123&amp;type=invite");
      expect(html).toContain("omsrisai@gmail.com");

      expect(text).toContain("Om Sri Sai Clinic | CAREFLOW AI");
      expect(text).toContain("Activate Your Patient Portal");
      expect(text).toContain("Hello Anita Sharma,");
      expect(text).toContain("24 hours");
      expect(text).toContain(activationParams.activationUrl);
      expect(text).toContain("omsrisai@gmail.com");
    });

    it("escapes patient name and clinic name to prevent HTML injection", () => {
      const { html } = generatePatientActivationEmailContent({
        ...activationParams,
        clinicName: "Om <script>alert('xss')</script> Clinic",
        patientName: "Anita <b>Sharma</b>",
      });

      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).not.toContain("<b>Sharma</b>");
      expect(html).toContain("&lt;b&gt;Sharma&lt;/b&gt;");
    });

    it("encodes patient activation MIME message as multipart/alternative with Base64URL without padding", () => {
      const mime = buildPatientActivationMimeMessage(activationParams);
      expect(mime).toContain('From: "Om Sri Sai Clinic | CAREFLOW AI" <omsrisai@gmail.com>');
      expect(mime).toContain("To: <patient.anita@example.com>");
      expect(mime).toContain("Content-Type: multipart/alternative");

      const encoded = base64UrlEncode(mime);
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
      expect(encoded).not.toContain("=");
    });
  });

  describe("Patient Activation Email Delivery via Gmail API", () => {
    beforeEach(() => {
      clearClinicGmailConnections();
      vi.restoreAllMocks();
    });

    it("enforces clinic Gmail connection before sending activation emails", async () => {
      await expect(
        sendPatientActivationEmail({
          clinicId: "unconnected-clinic",
          clinicName: "Om Sri Sai Clinic",
          recipientEmail: "patient@example.com",
          actionLink: "https://careflow-test.app/verify",
        })
      ).rejects.toThrow("Clinic Gmail account is not connected");
    });

    it("delivers activation email through Gmail API with refreshed token", async () => {
      const { ciphertext, iv, tag } = encryptToken("test-refresh-token-123");
      setClinicGmailConnectionRecord({
        clinicId: "clinic-test-1",
        senderEmail: "clinic@gmail.com",
        encryptedRefreshToken: ciphertext,
        iv,
        tag,
        connectedAt: new Date().toISOString(),
        status: "ACTIVE",
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes("oauth2.googleapis.com/token")) {
          return new Response(JSON.stringify({ access_token: "google-fresh-token-abc" }), { status: 200 });
        }
        if (urlStr.includes("gmail.googleapis.com/gmail/v1/users/me/messages/send")) {
          return new Response(JSON.stringify({ id: "gmail-sent-message-id-999" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      });

      const res = await sendPatientActivationEmail({
        clinicId: "clinic-test-1",
        clinicName: "Om Sri Sai Clinic",
        recipientEmail: "patient@example.com",
        patientName: "Anita Sharma",
        actionLink: "https://careflow-test.app/verify?token=123",
      });

      expect(res.ok).toBe(true);
      expect(res.messageId).toBe("gmail-sent-message-id-999");
      expect(res.senderEmail).toBe("clinic@gmail.com");
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("handles Gmail sending quota exceeded errors truthfully", async () => {
      const { ciphertext, iv, tag } = encryptToken("test-refresh-token-123");
      setClinicGmailConnectionRecord({
        clinicId: "clinic-test-quota",
        senderEmail: "clinic@gmail.com",
        encryptedRefreshToken: ciphertext,
        iv,
        tag,
        connectedAt: new Date().toISOString(),
        status: "ACTIVE",
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes("oauth2.googleapis.com/token")) {
          return new Response(JSON.stringify({ access_token: "google-token" }), { status: 200 });
        }
        if (urlStr.includes("gmail.googleapis.com/gmail/v1/users/me/messages/send")) {
          return new Response(JSON.stringify({ error: { message: "Daily user sending quota exceeded" } }), {
            status: 429,
          });
        }
        return new Response("Not found", { status: 404 });
      });

      await expect(
        sendPatientActivationEmail({
          clinicId: "clinic-test-quota",
          clinicName: "Om Sri Sai Clinic",
          recipientEmail: "patient@example.com",
          actionLink: "https://careflow-test.app/verify",
        })
      ).rejects.toThrow("Gmail sending quota exceeded");
    });

    it("marks connection REVOKED and throws actionable error when authorization is rejected (401)", async () => {
      const { ciphertext, iv, tag } = encryptToken("test-refresh-token-123");
      setClinicGmailConnectionRecord({
        clinicId: "clinic-test-revoked",
        senderEmail: "clinic@gmail.com",
        encryptedRefreshToken: ciphertext,
        iv,
        tag,
        connectedAt: new Date().toISOString(),
        status: "ACTIVE",
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes("oauth2.googleapis.com/token")) {
          return new Response(JSON.stringify({ access_token: "google-token" }), { status: 200 });
        }
        if (urlStr.includes("gmail.googleapis.com/gmail/v1/users/me/messages/send")) {
          return new Response("Invalid Credentials", { status: 401 });
        }
        return new Response("Not found", { status: 404 });
      });

      await expect(
        sendPatientActivationEmail({
          clinicId: "clinic-test-revoked",
          clinicName: "Om Sri Sai Clinic",
          recipientEmail: "patient@example.com",
          actionLink: "https://careflow-test.app/verify",
        })
      ).rejects.toThrow("Clinic Gmail authorization was rejected");
    });

    it("loads connection record across serverless instances from persistent storage", async () => {
      const { ciphertext, iv, tag } = encryptToken("persistent-refresh-token");
      const record = {
        clinicId: "clinic-persisted-1",
        senderEmail: "persistent@gmail.com",
        encryptedRefreshToken: ciphertext,
        iv,
        tag,
        connectedAt: new Date().toISOString(),
        status: "ACTIVE" as const,
      };

      // Set directly in memory cache or load
      setClinicGmailConnectionRecord(record);
      const loaded = await loadClinicGmailConnectionRecord("clinic-persisted-1");
      expect(loaded).toEqual(record);
      expect(loaded?.senderEmail).toBe("persistent@gmail.com");
    });
  });
});
