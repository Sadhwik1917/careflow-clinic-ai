import { describe, expect, it } from "vitest";
import { generateQrMatrix, generateQrSvg } from "@/lib/qr";

describe("QR Code Generator", () => {
  it("generates a square matrix of boolean modules", () => {
    const url = "https://careflow-clinic-ai.lovable.app/clinic/patients/new";
    const matrix = generateQrMatrix(url);
    expect(matrix.length).toBeGreaterThan(20);
    expect(matrix[0]?.length).toBe(matrix.length);
  });

  it("produces standard finder patterns at corners", () => {
    const matrix = generateQrMatrix("https://careflow-clinic-ai.lovable.app");
    // Top-left finder (7x7 with 3x3 black center)
    expect(matrix[0]![0]).toBe(true);
    expect(matrix[0]![1]).toBe(true);
    expect(matrix[0]![6]).toBe(true);
    expect(matrix[1]![1]).toBe(false);
    expect(matrix[3]![3]).toBe(true);
  });

  it("generates valid SVG markup with viewBox and rects", () => {
    const svg = generateQrSvg("https://example.com/patient-reg", { size: 300 });
    expect(svg).toContain("<svg");
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("<rect");
    expect(svg).toContain('width="300"');
    expect(svg).toContain('height="300"');
  });
});
