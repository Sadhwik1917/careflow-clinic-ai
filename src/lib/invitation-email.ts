/**
 * Clinic Invitation Email Templates & MIME Message Builder.
 * Complies with RFC 2822 for Gmail API delivery.
 */

export interface InvitationEmailParams {
  clinicName: string;
  senderEmail: string;
  recipientEmail: string;
  role: "DOCTOR" | "STAFF";
  token: string;
  expiresAt: string | Date;
  appUrl: string;
}

export function buildInvitationUrl(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/accept-invitation?token=${encodeURIComponent(token)}`;
}

export function generateInvitationEmailContent(params: InvitationEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const roleLabel = params.role === "DOCTOR" ? "Doctor" : "Staff Member";
  const roleDisplay = params.role === "DOCTOR" ? "Doctor" : "Staff";
  const inviteUrl = buildInvitationUrl(params.appUrl, params.token);
  const expiryDate = new Date(params.expiresAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const subject = `Invitation to join ${params.clinicName} as ${roleDisplay} on CAREFLOW AI`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f17; color: #f1f5f9; margin: 0; padding: 24px 12px; }
    .container { max-width: 560px; margin: 0 auto; background-color: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 36px 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    .brand { font-size: 13px; font-weight: 700; letter-spacing: 0.08em; color: #38bdf8; text-transform: uppercase; margin-bottom: 24px; }
    h1 { font-size: 22px; font-weight: 600; color: #ffffff; margin: 0 0 16px 0; line-height: 1.3; }
    p { font-size: 15px; line-height: 1.6; color: #cbd5e1; margin: 0 0 18px 0; }
    .badge { display: inline-block; padding: 4px 10px; background-color: #1e293b; border: 1px solid #334155; border-radius: 6px; font-size: 13px; font-weight: 500; color: #38bdf8; margin-bottom: 20px; }
    .button-wrap { margin: 28px 0; text-align: left; }
    .btn { display: inline-block; background-color: #0284c7; color: #ffffff !important; text-decoration: none; padding: 13px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; text-align: center; }
    .btn:hover { background-color: #0369a1; }
    .notice { font-size: 13px; color: #94a3b8; border-top: 1px solid #1e293b; padding-top: 20px; margin-top: 28px; }
    .url-fallback { word-break: break-all; color: #38bdf8; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">${escapeHtml(params.clinicName)} | CAREFLOW AI</div>
    <h1>Welcome, ${roleDisplay}!</h1>
    <p>You have been invited to join the clinic team at <strong>${escapeHtml(params.clinicName)}</strong> as a <strong>${roleLabel}</strong> on CAREFLOW AI.</p>
    <div>
      <span class="badge">Role: ${roleDisplay}</span>
    </div>
    <p>Click below to accept this invitation, set up your credentials, and access your clinic workspace:</p>
    <div class="button-wrap">
      <a href="${inviteUrl}" class="btn" target="_blank" rel="noopener noreferrer">Accept Invitation &amp; Join Team</a>
    </div>
    <p style="font-size: 13px; color: #94a3b8;">
      This invitation was sent to <strong>${escapeHtml(params.recipientEmail)}</strong> and expires in <strong>7 days</strong> (${expiryDate}).
    </p>
    <div class="notice">
      <p style="margin-bottom: 8px;">If the button above does not work, copy and paste this link into your browser:</p>
      <a href="${inviteUrl}" class="url-fallback">${inviteUrl}</a>
      <p style="margin-top: 16px; margin-bottom: 0; font-size: 12px; color: #64748b;">
        If you were not expecting this invitation or have questions, please contact the clinic administrator at ${escapeHtml(params.senderEmail)}.
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `${params.clinicName} | CAREFLOW AI

Welcome!

You have been invited to join the clinic team at ${params.clinicName} as a ${roleLabel} on CAREFLOW AI.

Role: ${roleDisplay}
Invited Email: ${params.recipientEmail}
Expires: ${expiryDate} (7 days)

To accept this invitation and access your workspace, please open the following link in your browser:
${inviteUrl}

If you were not expecting this invitation, please contact your clinic administrator at ${params.senderEmail}.
`;

  return { subject, html, text };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Encodes a string into Base64URL without padding per RFC 4648 §5 (required by Gmail API).
 */
export function base64UrlEncode(str: string): string {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Builds an RFC 2822 compliant MIME message string for Gmail API messages.send.
 */
export function buildMimeMessage(params: InvitationEmailParams): string {
  const { subject, html, text } = generateInvitationEmailContent(params);
  const boundary = `====_Careflow_Boundary_${Date.now()}_${Math.random().toString(36).substring(2)}====`;

  const displayName = `${params.clinicName} | CAREFLOW AI`;
  // RFC 2047 encoded display name if non-ascii, or quoted string
  const fromHeader = `"${displayName.replace(/"/g, '\\"')}" <${params.senderEmail}>`;
  const toHeader = `<${params.recipientEmail}>`;

  const messageParts = [
    `From: ${fromHeader}`,
    `To: ${toHeader}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    text,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    html,
    ``,
    `--${boundary}--`,
  ];

  return messageParts.join("\r\n");
}

export interface PatientActivationEmailParams {
  clinicName: string;
  senderEmail: string;
  recipientEmail: string;
  patientName?: string | undefined;
  activationUrl: string;
}

export function generatePatientActivationEmailContent(params: PatientActivationEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Activate your patient account at ${params.clinicName} | CAREFLOW AI`;
  const greeting = params.patientName ? `Hello ${params.patientName},` : "Hello,";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f17; color: #f1f5f9; margin: 0; padding: 24px 12px; }
    .container { max-width: 560px; margin: 0 auto; background-color: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 36px 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    .brand { font-size: 13px; font-weight: 700; letter-spacing: 0.08em; color: #38bdf8; text-transform: uppercase; margin-bottom: 24px; }
    h1 { font-size: 22px; font-weight: 600; color: #ffffff; margin: 0 0 16px 0; line-height: 1.3; }
    p { font-size: 15px; line-height: 1.6; color: #cbd5e1; margin: 0 0 18px 0; }
    .badge { display: inline-block; padding: 4px 10px; background-color: #1e293b; border: 1px solid #334155; border-radius: 6px; font-size: 13px; font-weight: 500; color: #38bdf8; margin-bottom: 20px; }
    .button-wrap { margin: 28px 0; text-align: left; }
    .btn { display: inline-block; background-color: #0284c7; color: #ffffff !important; text-decoration: none; padding: 13px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; text-align: center; }
    .btn:hover { background-color: #0369a1; }
    .notice { font-size: 13px; color: #94a3b8; border-top: 1px solid #1e293b; padding-top: 20px; margin-top: 28px; }
    .url-fallback { word-break: break-all; color: #38bdf8; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">${escapeHtml(params.clinicName)} | CAREFLOW AI</div>
    <h1>Activate Your Patient Portal</h1>
    <p>${escapeHtml(greeting)}</p>
    <p>Thank you for registering as a patient with <strong>${escapeHtml(params.clinicName)}</strong>. Please activate your patient account to access your digital care records, view clinic appointments, and securely communicate with your clinic team.</p>
    <div>
      <span class="badge">Patient Self-Registration</span>
    </div>
    <p>Click below to activate your account and set up your secure portal password:</p>
    <div class="button-wrap">
      <a href="${escapeHtml(params.activationUrl)}" class="btn" target="_blank" rel="noopener noreferrer">Activate My Account &amp; Set Password</a>
    </div>
    <p style="font-size: 13px; color: #94a3b8;">
      For your security, this activation link is valid for <strong>24 hours</strong> and can only be used once.
    </p>
    <div class="notice">
      <p style="margin-bottom: 8px;">If the button above does not work, copy and paste this link into your browser:</p>
      <a href="${escapeHtml(params.activationUrl)}" class="url-fallback">${escapeHtml(params.activationUrl)}</a>
      <p style="margin-top: 16px; margin-bottom: 0; font-size: 12px; color: #64748b;">
        This activation email was sent to <strong>${escapeHtml(params.recipientEmail)}</strong> by ${escapeHtml(params.clinicName)} via CAREFLOW AI. If you did not register with this clinic, you can safely ignore this email or contact clinic administration at ${escapeHtml(params.senderEmail)}.
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `${params.clinicName} | CAREFLOW AI

Activate Your Patient Portal

${greeting}

Thank you for registering as a patient with ${params.clinicName}. Please activate your patient account to access your digital care records, view clinic appointments, and communicate with your care team.

To activate your account and set your password, open the following link in your browser:
${params.activationUrl}

Note: For your security, this activation link is valid for 24 hours.

If you did not register for an account at ${params.clinicName}, please disregard this email or contact the clinic administrator at ${params.senderEmail}.
`;

  return { subject, html, text };
}

export function buildPatientActivationMimeMessage(params: PatientActivationEmailParams): string {
  const { subject, html, text } = generatePatientActivationEmailContent(params);
  const boundary = `====_Careflow_Patient_Boundary_${Date.now()}_${Math.random().toString(36).substring(2)}====`;

  const displayName = `${params.clinicName} | CAREFLOW AI`;
  const fromHeader = `"${displayName.replace(/"/g, '\\"')}" <${params.senderEmail}>`;
  const toHeader = `<${params.recipientEmail}>`;

  const messageParts = [
    `From: ${fromHeader}`,
    `To: ${toHeader}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    text,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    html,
    ``,
    `--${boundary}--`,
  ];

  return messageParts.join("\r\n");
}
