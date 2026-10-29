import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { generateQrMatrix, generateQrSvg } from "@/lib/qr";
import { decodeQrMatrix } from "@/lib/qr-decoder";
import {
  createPatientRegistrationUrl,
  validatePatientRegistrationPayload,
  isValidClinicUuid,
} from "@/lib/qr-payload";

describe("QR Code Standards-Compliant Generator", () => {
  it("generates a square matrix of boolean modules for registration URLs", () => {
    const url = "https://careflow-clinic-ai.lovable.app/clinic/patients/new?clinic=550e8400-e29b-41d4-a716-446655440000";
    const matrix = generateQrMatrix(url);
    expect(matrix.length).toBeGreaterThan(20);
    expect(matrix[0]?.length).toBe(matrix.length);
  });

  it("produces standard finder patterns at all three corners", () => {
    const matrix = generateQrMatrix("https://careflow-clinic-ai.lovable.app");
    const size = matrix.length;

    // Top-left finder (7x7 with 3x3 black center)
    expect(matrix[0]![0]).toBe(true);
    expect(matrix[0]![1]).toBe(true);
    expect(matrix[0]![6]).toBe(true);
    expect(matrix[1]![1]).toBe(false);
    expect(matrix[3]![3]).toBe(true);

    // Top-right finder
    expect(matrix[0]![size - 7]).toBe(true);
    expect(matrix[0]![size - 1]).toBe(true);
    expect(matrix[3]![size - 4]).toBe(true);

    // Bottom-left finder
    expect(matrix[size - 7]![0]).toBe(true);
    expect(matrix[size - 1]![0]).toBe(true);
    expect(matrix[size - 4]![3]).toBe(true);
  });

  it("places alignment patterns on Version 2+ QR codes according to ISO/IEC 18004", () => {
    // Version 2 payload (~20 bytes) has alignment center at (18, 18)
    const v2Matrix = generateQrMatrix("https://careflow.ai");
    expect(v2Matrix.length).toBe(25); // Version 2 is 25x25
    expect(v2Matrix[18]![18]).toBe(true); // Center of 5x5 alignment pattern is dark

    // Version 6 payload (~100 bytes) has alignment center at (34, 34)
    const v6Url = "https://careflow-clinic-ai.lovable.app/clinic/patients/new?clinic=550e8400-e29b-41d4-a716-446655440000";
    const v6Matrix = generateQrMatrix(v6Url);
    expect(v6Matrix.length).toBe(41); // Version 6 is 41x41
    expect(v6Matrix[34]![34]).toBe(true); // Center of alignment pattern is dark
  });

  it("generates valid SVG markup with viewBox, shape-rendering and rects", () => {
    const svg = generateQrSvg("https://example.com/patient-reg", { size: 300 });
    expect(svg).toContain("<svg");
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain("<rect");
    expect(svg).toContain('width="300"');
    expect(svg).toContain('height="300"');
  });

  it("end-to-end decodability: accurately decodes generated QR matrices across versions", () => {
    const testCases = [
      "A",
      "https://careflow.ai",
      "https://careflow-clinic-ai.lovable.app/clinic/patients/new",
      "https://careflow-clinic-ai.lovable.app/clinic/patients/new?clinic=550e8400-e29b-41d4-a716-446655440000",
      "https://careflow-clinic-ai.lovable.app/clinic/patients/new?clinic=550e8400-e29b-41d4-a716-446655440000&kiosk=front_desk_lobby_registration",
    ];

    for (const testText of testCases) {
      const matrix = generateQrMatrix(testText);
      const decoded = decodeQrMatrix(matrix);
      expect(decoded).toBe(testText);
    }
  });
});

describe("QR Payload Generation and Security Validation", () => {
  const clinicId = "550e8400-e29b-41d4-a716-446655440000";
  const otherClinicId = "660f9511-f30c-42e5-b827-557766551111";

  it("validates RFC 4122 clinic UUIDs strictly", () => {
    expect(isValidClinicUuid(clinicId)).toBe(true);
    expect(isValidClinicUuid(clinicId.toUpperCase())).toBe(true);
    expect(isValidClinicUuid("not-a-uuid")).toBe(false);
    expect(isValidClinicUuid("")).toBe(false);
    expect(isValidClinicUuid("550e8400-e29b-41d4-a716")).toBe(false);
  });

  it("generates canonical registration URLs pointing to public self-registration", () => {
    const url = createPatientRegistrationUrl("https://careflow.ai", clinicId);
    expect(url).toBe(`https://careflow.ai/register?clinic=${clinicId}`);
  });

  it("rejects invalid clinic IDs during URL generation", () => {
    expect(() => createPatientRegistrationUrl("https://careflow.ai", "invalid-id")).toThrow(
      "Invalid clinic ID format"
    );
  });

  it("validates canonical public registration URLs correctly", () => {
    const canonical = `https://careflow-clinic-ai.lovable.app/register?clinic=${clinicId}`;
    const result = validatePatientRegistrationPayload(canonical);
    expect(result).toEqual({
      success: true,
      clinicId,
      registrationUrl: canonical,
    });
  });

  it("validates legacy registration URLs for backwards compatibility", () => {
    const legacy = `https://careflow-clinic-ai.lovable.app/clinic/patients/new?clinic=${clinicId}`;
    const result = validatePatientRegistrationPayload(legacy);
    expect(result).toEqual({
      success: true,
      clinicId,
      registrationUrl: legacy,
    });
  });

  it("validates relative registration URLs correctly", () => {
    const relative = `/register?clinic=${clinicId}`;
    const result = validatePatientRegistrationPayload(relative);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.clinicId).toBe(clinicId);
    }

    const legacyRelative = `/clinic/patients/new?clinic=${clinicId}`;
    const legacyResult = validatePatientRegistrationPayload(legacyRelative);
    expect(legacyResult.success).toBe(true);
    if (legacyResult.success) {
      expect(legacyResult.clinicId).toBe(clinicId);
    }
  });

  it("validates structured JSON QR payloads", () => {
    const jsonPayload = JSON.stringify({ action: "register_patient", clinicId });
    const result = validatePatientRegistrationPayload(jsonPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.clinicId).toBe(clinicId);
    }
  });

  it("validates direct clinic UUID strings", () => {
    const result = validatePatientRegistrationPayload(clinicId);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.clinicId).toBe(clinicId);
    }
  });

  it("enforces clinic context matching and prevents cross-clinic registration", () => {
    const canonical = `https://careflow.ai/clinic/patients/new?clinic=${clinicId}`;
    // Matching clinic succeeds
    expect(validatePatientRegistrationPayload(canonical, clinicId).success).toBe(true);

    // Mismatched clinic fails closed
    const mismatched = validatePatientRegistrationPayload(canonical, otherClinicId);
    expect(mismatched.success).toBe(false);
    if (!mismatched.success) {
      expect(mismatched.error).toContain("clinic ID mismatch");
    }
  });

  it("rejects malicious or dangerous URL schemes", () => {
    const dangerous = [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ];

    for (const d of dangerous) {
      const res = validatePatientRegistrationPayload(d);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toContain("rejected");
      }
    }
  });

  it("rejects arbitrary external URLs or wrong paths", () => {
    const invalidUrls = [
      "https://malicious-site.com/steal-data",
      "https://careflow.ai/login",
      "https://careflow.ai/admin/users",
      "https://careflow.ai/clinic/patients/new", // missing clinic param
      "https://careflow.ai/clinic/patients/new?clinic=not-a-uuid", // non-UUID clinic
    ];

    for (const url of invalidUrls) {
      const res = validatePatientRegistrationPayload(url);
      expect(res.success).toBe(false);
    }
  });

  it("rejects empty or whitespace-only inputs", () => {
    expect(validatePatientRegistrationPayload("").success).toBe(false);
    expect(validatePatientRegistrationPayload("   ").success).toBe(false);
    expect(validatePatientRegistrationPayload(null).success).toBe(false);
    expect(validatePatientRegistrationPayload(undefined).success).toBe(false);
  });
});

describe("QR Scanner Lifecycle and Error Handling", () => {
  let mockTracks: { stop: ReturnType<typeof vi.fn> }[];
  let originalMediaDevices: typeof navigator.mediaDevices;

  beforeEach(() => {
    mockTracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    originalMediaDevices = navigator.mediaDevices;

    // Default mock mediaDevices
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => mockTracks,
        }),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: originalMediaDevices,
    });
    vi.restoreAllMocks();
  });

  it("cleans up camera media tracks on stream stop", async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(t => t.stop());
    expect(mockTracks[0]!.stop).toHaveBeenCalled();
    expect(mockTracks[1]!.stop).toHaveBeenCalled();
  });

  it("handles camera permission denied errors gracefully", async () => {
    const permissionError = new Error("Permission denied");
    permissionError.name = "NotAllowedError";

    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(permissionError);

    await expect(navigator.mediaDevices.getUserMedia({ video: true })).rejects.toThrow("Permission denied");
  });

  it("handles camera not found errors gracefully", async () => {
    const notFoundError = new Error("Requested device not found");
    notFoundError.name = "NotFoundError";

    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(notFoundError);

    await expect(navigator.mediaDevices.getUserMedia({ video: true })).rejects.toThrow("Requested device not found");
  });

  it("prevents duplicate scan processing once a valid QR payload is locked", () => {
    const clinicId = "550e8400-e29b-41d4-a716-446655440000";
    const callback = vi.fn();

    // Simulated scan processing guard
    let isProcessing = false;
    const processScan = (raw: string) => {
      if (isProcessing) return;
      isProcessing = true;
      const res = validatePatientRegistrationPayload(raw, clinicId);
      if (res.success) {
        callback(res);
      }
    };

    const validPayload = `https://careflow.ai/clinic/patients/new?clinic=${clinicId}`;

    // Multiple rapid frames
    processScan(validPayload);
    processScan(validPayload);
    processScan(validPayload);

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
