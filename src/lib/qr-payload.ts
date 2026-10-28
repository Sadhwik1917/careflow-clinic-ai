/**
 * QR Code Payload Generation and Validation for Patient Registration.
 * Ensures strictly typed, authenticated, and isolated clinic patient registration payloads.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ValidQrPayload {
  success: true;
  clinicId: string;
  registrationUrl: string;
}

export interface InvalidQrPayload {
  success: false;
  error: string;
}

export type QrPayloadValidationResult = ValidQrPayload | InvalidQrPayload;

/**
 * Validates whether a given string is a valid RFC 4122 UUID.
 */
export function isValidClinicUuid(id: string): boolean {
  return typeof id === "string" && UUID_REGEX.test(id.trim());
}

/**
 * Generates the canonical patient registration URL for a given clinic.
 */
export function createPatientRegistrationUrl(origin: string, clinicId: string): string {
  if (!isValidClinicUuid(clinicId)) {
    throw new Error(`Invalid clinic ID format for registration URL: ${clinicId}`);
  }
  const cleanOrigin = origin.replace(/\/+$/, "");
  return `${cleanOrigin}/clinic/patients/new?clinic=${encodeURIComponent(clinicId.trim())}`;
}

/**
 * Validates and extracts clinic registration info from an arbitrary QR payload or URL.
 * Supports:
 *  1. Canonical web URLs (e.g. https://domain.com/clinic/patients/new?clinic=<uuid>)
 *  2. Relative path URLs (e.g. /clinic/patients/new?clinic=<uuid>)
 *  3. Structured JSON payloads (e.g. {"action":"register_patient","clinicId":"<uuid>"})
 *  4. Direct Clinic UUID strings
 *
 * Enforces strict security boundaries:
 *  - Blocks dangerous schemes (javascript:, data:, vbscript:, file:)
 *  - Disallows arbitrary URLs or unexpected paths
 *  - Validates UUID format
 *  - Enforces clinic context matching when an expected clinic ID is provided
 */
export function validatePatientRegistrationPayload(
  rawInput: string | null | undefined,
  expectedClinicId?: string
): QrPayloadValidationResult {
  if (!rawInput || typeof rawInput !== "string" || !rawInput.trim()) {
    return { success: false, error: "QR code payload is empty." };
  }

  const trimmed = rawInput.trim();

  // Guard against dangerous schemes
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:")
  ) {
    return { success: false, error: "Untrusted or dangerous QR payload rejected." };
  }

  let extractedClinicId: string | null = null;
  let targetUrl: string | null = null;

  // 1. Try direct UUID string
  if (isValidClinicUuid(trimmed)) {
    extractedClinicId = trimmed.toLowerCase();
  }

  // 2. Try JSON payload
  if (!extractedClinicId && trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const candidate = (parsed["clinicId"] || parsed["clinic_id"] || parsed["clinic"]) as string | undefined;
      if (candidate && isValidClinicUuid(candidate)) {
        extractedClinicId = candidate.trim().toLowerCase();
      } else {
        return { success: false, error: "JSON QR payload does not contain a valid clinic UUID." };
      }
    } catch {
      return { success: false, error: "Malformed JSON payload in QR code." };
    }
  }

  // 3. Try URL parsing
  if (!extractedClinicId) {
    try {
      // Use fallback base for relative URLs like /clinic/patients/new?clinic=...
      const parsedUrl = new URL(trimmed, "https://careflow-clinic.internal");

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return { success: false, error: `Unsupported protocol in QR URL: ${parsedUrl.protocol}` };
      }

      const path = parsedUrl.pathname.replace(/\/+$/, "");
      if (path === "/clinic/patients/new" || path === "/clinic/patients") {
        const candidate = parsedUrl.searchParams.get("clinic");
        if (candidate && isValidClinicUuid(candidate)) {
          extractedClinicId = candidate.trim().toLowerCase();
          targetUrl = trimmed;
        } else {
          return { success: false, error: "QR URL is missing a valid 'clinic' UUID query parameter." };
        }
      } else {
        return { success: false, error: `Invalid registration path in QR URL: ${parsedUrl.pathname}` };
      }
    } catch {
      // Not a valid URL
    }
  }

  if (!extractedClinicId) {
    return {
      success: false,
      error: "QR code does not contain a recognized patient registration payload or valid clinic identifier.",
    };
  }

  // 4. Verify against expected clinic context if provided
  if (expectedClinicId) {
    const cleanExpected = expectedClinicId.trim().toLowerCase();
    if (isValidClinicUuid(cleanExpected) && extractedClinicId !== cleanExpected) {
      return {
        success: false,
        error: `QR code belongs to a different clinic (clinic ID mismatch).`,
      };
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "https://careflow-clinic.internal";
  const canonicalUrl = targetUrl || createPatientRegistrationUrl(origin, extractedClinicId);

  return {
    success: true,
    clinicId: extractedClinicId,
    registrationUrl: canonicalUrl,
  };
}
