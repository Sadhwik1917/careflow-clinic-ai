import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  encryptToken,
  decryptToken,
  generateGoogleOAuthUrl,
  isGoogleOAuthConfigured,
  getCanonicalAppUrl,
} from "@/lib/gmail.server";
import {
  buildMimeMessage,
  base64UrlEncode,
  generateInvitationEmailContent,
  buildInvitationUrl,
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
});
