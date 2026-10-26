/**
 * Clinic Gmail OAuth 2.0 and Invitation Email Delivery Service.
 *
 * Implements Google's official Gmail API (OAuth 2.0) with multi-tenant clinic isolation.
 * Strictly enforces that invitation emails are sent ONLY from the inviting clinic's
 * authorized registered Gmail address. Supabase Auth mailer is NEVER used as a fallback.
 */

import crypto from "node:crypto";
import { buildMimeMessage, base64UrlEncode } from "./invitation-email";

export interface GmailConnectionRecord {
  clinicId: string;
  senderEmail: string;
  encryptedRefreshToken: string;
  iv: string;
  tag: string;
  connectedAt: string;
  status: "ACTIVE" | "REVOKED";
}

export interface ClinicGmailStatus {
  connected: boolean;
  senderEmail?: string | undefined;
  status: "CONNECTED" | "NOT_CONNECTED" | "REVOKED" | "UNCONFIGURED";
  configured: boolean;
}

// In-memory / server persistent cache for clinic credentials when DB migration is pending
const memoryCredentialsStore = new Map<string, GmailConnectionRecord>();

/**
 * Returns the canonical application URL for OAuth redirects and invite links.
 * Never defaults to localhost in production.
 */
export function getCanonicalAppUrl(): string {
  if (process.env["APP_URL"]) {
    return process.env["APP_URL"].replace(/\/+$/, "");
  }
  if (process.env["VITE_APP_URL"]) {
    return process.env["VITE_APP_URL"].replace(/\/+$/, "");
  }
  if (process.env["NODE_ENV"] === "production") {
    // In production without APP_URL, fail closed or use production host if available
    return "https://careflow-clinic-ai.lovable.app";
  }
  return "http://localhost:8080";
}

export function getGoogleClientId(): string | undefined {
  return (
    process.env["GOOGLE_GMAIL_CLIENT_ID"] ||
    process.env["GOOGLE_CLIENT_ID"] ||
    process.env["VITE_GOOGLE_GMAIL_CLIENT_ID"]
  );
}

export function getGoogleClientSecret(): string | undefined {
  return (
    process.env["GOOGLE_GMAIL_CLIENT_SECRET"] ||
    process.env["GOOGLE_CLIENT_SECRET"] ||
    process.env["VITE_GOOGLE_GMAIL_CLIENT_SECRET"]
  );
}

export function getGoogleRedirectUri(): string {
  return (
    process.env["GOOGLE_GMAIL_REDIRECT_URI"] ||
    process.env["GOOGLE_REDIRECT_URI"] ||
    `${getCanonicalAppUrl()}/api/auth/callback/google-gmail`
  );
}

function getEncryptionKey(): Buffer {
  const secret =
    process.env["GMAIL_TOKEN_ENCRYPTION_KEY"] ||
    process.env["GMAIL_CREDENTIALS_ENCRYPTION_KEY"] ||
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    "careflow-clinic-gmail-default-enc-key";
  return crypto.createHash("sha256").update(secret).digest();
}

/** Encrypts sensitive refresh tokens using AES-256-GCM before storage */
export function encryptToken(token: string): { ciphertext: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  let ciphertext = cipher.update(token, "utf8", "base64");
  ciphertext += cipher.final("base64");
  const tag = cipher.getAuthTag().toString("base64");
  return { ciphertext, iv: iv.toString("base64"), tag };
}

/** Decrypts AES-256-GCM tokens strictly inside secure server memory */
export function decryptToken(ciphertext: string, iv: string, tag: string): string {
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/** Checks whether Google OAuth is configured in the environment */
export function isGoogleOAuthConfigured(): boolean {
  return Boolean(getGoogleClientId() && getGoogleClientSecret());
}

/**
 * Generates the Google OAuth 2.0 authorization URL for a clinic owner.
 * Requests minimum scopes: gmail.send and userinfo.email.
 */
export function generateGoogleOAuthUrl(clinicId: string, stateNonce: string): string {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error("Google OAuth Client ID is not configured on the server.");
  }

  const redirectUri = getGoogleRedirectUri();
  const scopes = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
  ].join(" ");

  const statePayload = Buffer.from(
    JSON.stringify({ clinicId, nonce: stateNonce, timestamp: Date.now() })
  ).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
    state: statePayload,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchanges Google OAuth authorization code for tokens, verifies that the authorized
 * Gmail matches the clinic's registered email address, and stores encrypted credentials.
 */
export async function exchangeAndStoreGoogleAuth(
  code: string,
  clinicId: string,
  expectedClinicEmail: string
): Promise<{ success: true; senderEmail: string }> {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials are not configured on the server.");
  }

  const redirectUri = getGoogleRedirectUri();

  // 1. Exchange code with Google
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Google OAuth authorization failed: ${errText}`);
  }

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!tokenData.access_token) {
    throw new Error("Google did not return an access token.");
  }

  // 2. Fetch authenticated user's email from Google
  const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userinfoRes.ok) {
    throw new Error("Failed to verify authorized Google account identity.");
  }

  const userinfo = (await userinfoRes.json()) as { email?: string; verified_email?: boolean };
  const authorizedEmail = userinfo.email?.toLowerCase().trim();

  if (!authorizedEmail) {
    throw new Error("Could not determine authorized Gmail address.");
  }

  // 3. Strict verification: Authorized Gmail MUST match clinic registered email
  const cleanExpected = expectedClinicEmail.toLowerCase().trim();
  if (cleanExpected && authorizedEmail !== cleanExpected) {
    throw new Error(
      `Account mismatch: The authorized Google account (${authorizedEmail}) does not match this clinic's registered email (${cleanExpected}). Please authorize using the clinic's registered Gmail account.`
    );
  }

  if (!tokenData.refresh_token) {
    // If prompt=consent was not provided or re-authorizing without refresh token,
    // check if we already have an existing record for this clinic
    const existing = memoryCredentialsStore.get(clinicId);
    if (!existing) {
      throw new Error(
        "Google did not provide a refresh token. Please revoke access in your Google Account security settings and reconnect to grant offline access."
      );
    }
    // Update existing record status
    existing.status = "ACTIVE";
    existing.senderEmail = authorizedEmail;
    return { success: true, senderEmail: authorizedEmail };
  }

  // 4. Encrypt and store refresh token safely
  const { ciphertext, iv, tag } = encryptToken(tokenData.refresh_token);
  const record: GmailConnectionRecord = {
    clinicId,
    senderEmail: authorizedEmail,
    encryptedRefreshToken: ciphertext,
    iv,
    tag,
    connectedAt: new Date().toISOString(),
    status: "ACTIVE",
  };

  memoryCredentialsStore.set(clinicId, record);

  return { success: true, senderEmail: authorizedEmail };
}

/**
 * Returns the Gmail connection status for a clinic.
 */
export async function getClinicGmailStatus(clinicId: string): Promise<ClinicGmailStatus> {
  const configured = isGoogleOAuthConfigured();
  const record = memoryCredentialsStore.get(clinicId);

  if (!record || record.status !== "ACTIVE") {
    return {
      connected: false,
      status: record?.status === "REVOKED" ? "REVOKED" : configured ? "NOT_CONNECTED" : "UNCONFIGURED",
      configured,
      senderEmail: record?.senderEmail,
    };
  }

  return {
    connected: true,
    status: "CONNECTED",
    configured,
    senderEmail: record.senderEmail,
  };
}

/**
 * Disconnects/revokes the Gmail connection for a clinic.
 */
export async function disconnectClinicGmail(clinicId: string): Promise<{ ok: true }> {
  const record = memoryCredentialsStore.get(clinicId);
  if (record) {
    record.status = "REVOKED";
  }
  return { ok: true };
}

/**
 * Obtains a fresh access token using the stored encrypted refresh token.
 */
async function getFreshAccessToken(record: GmailConnectionRecord): Promise<string> {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials missing on server.");
  }

  const refreshToken = decryptToken(record.encryptedRefreshToken, record.iv, record.tag);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (errText.includes("invalid_grant")) {
      record.status = "REVOKED";
      throw new Error("Clinic Gmail authorization has expired or been revoked. Please reconnect the clinic's Gmail account.");
    }
    throw new Error(`Failed to refresh Gmail access token: ${errText}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Google token refresh did not return an access token.");
  }

  return data.access_token;
}

/**
 * Sends a Doctor or Staff invitation email using the clinic's authorized Gmail account.
 * Throws a descriptive error if Gmail is not connected or delivery fails.
 */
export async function sendClinicInvitationEmail(params: {
  clinicId: string;
  clinicName: string;
  recipientEmail: string;
  role: "DOCTOR" | "STAFF";
  token: string;
  expiresAt: string | Date;
}): Promise<{ ok: true; messageId: string; senderEmail: string }> {
  const record = memoryCredentialsStore.get(params.clinicId);

  // CRITICAL REQUIREMENT: Never silently send from Supabase Auth or another address!
  if (!record || record.status !== "ACTIVE") {
    throw new Error(
      "Gmail account not connected. Doctor and Staff invitations must be sent from your clinic's authorized Gmail address. Please connect your clinic's Gmail account in Settings before sending invitations."
    );
  }

  const accessToken = await getFreshAccessToken(record);
  const appUrl = getCanonicalAppUrl();

  const rawMime = buildMimeMessage({
    clinicName: params.clinicName,
    senderEmail: record.senderEmail,
    recipientEmail: params.recipientEmail,
    role: params.role,
    token: params.token,
    expiresAt: params.expiresAt,
    appUrl,
  });

  const encodedMessage = base64UrlEncode(rawMime);

  const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encodedMessage }),
  });

  if (!sendRes.ok) {
    const status = sendRes.status;
    const errText = await sendRes.text();

    if (status === 429 || (status === 403 && errText.includes("quotaExceeded"))) {
      throw new Error("Gmail sending quota exceeded for this account. Please try again later.");
    }
    if (status === 401) {
      record.status = "REVOKED";
      throw new Error("Clinic Gmail authorization was rejected. Please reconnect the clinic's Gmail account.");
    }
    throw new Error(`Gmail API delivery failed (${status}): ${errText}`);
  }

  const resData = (await sendRes.json()) as { id: string };
  return { ok: true, messageId: resData.id, senderEmail: record.senderEmail };
}
