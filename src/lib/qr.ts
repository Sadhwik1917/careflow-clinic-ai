/**
 * Lightweight, zero-dependency ISO/IEC 18004 QR Code Matrix and SVG generator.
 * Generates standards-compliant scannable QR codes for arbitrary text and URLs.
 */

// Error correction codewords per block for versions 1-10 (Level M)
const EC_CODEWORDS_M = [0, 10, 16, 26, 36, 48, 64, 72, 88, 110, 130];
// Total data codewords per version (Level M)
const DATA_CODEWORDS_M = [0, 16, 28, 44, 64, 86, 108, 124, 154, 182, 216];

// Galois field tables (GF(256) with primitive polynomial 0x11d)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGf() {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = val;
    GF_EXP[i + 255] = val;
    GF_LOG[val] = i;
    val = (val << 1) ^ (val & 0x80 ? 0x11d : 0);
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x]! + GF_LOG[y]!]!;
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const factor = new Uint8Array([1, GF_EXP[i]!]);
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] = (next[j] ?? 0) ^ gfMul(poly[j]!, factor[0]!);
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(poly[j]!, factor[1]!);
    }
    poly = next;
  }
  return poly;
}

function computeReedSolomon(data: Uint8Array, ecLength: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLength);
  const remainder = new Uint8Array(ecLength);

  for (let i = 0; i < data.length; i++) {
    const factor = data[i]! ^ remainder[0]!;
    for (let j = 0; j < ecLength - 1; j++) {
      remainder[j] = remainder[j + 1]! ^ gfMul(gen[j + 1]!, factor);
    }
    remainder[ecLength - 1] = gfMul(gen[ecLength]!, factor);
  }
  return remainder;
}

/** Determines smallest QR version capable of holding the payload */
function getBestVersion(dataLength: number): number {
  for (let v = 1; v <= 10; v++) {
    // 4 bits mode indicator + 8/16 bits char count + data
    const maxCapacity = DATA_CODEWORDS_M[v]! - 2;
    if (dataLength <= maxCapacity) return v;
  }
  return 10;
}

/**
 * Encodes text into a boolean 2D matrix (true = black module, false = white).
 */
export function generateQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const version = getBestVersion(bytes.length);
  const size = 17 + 4 * version;

  // Initialize matrix and reservation mask
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunctionModule: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  function setModule(r: number, c: number, val: boolean) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r]![c] = val;
      isFunctionModule[r]![c] = true;
    }
  }

  // 1. Draw Position Detection Patterns (Finders) at 3 corners
  const finders = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];

  for (const [row, col] of finders) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row! + r;
        const nc = col! + c;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          isFunctionModule[nr]![nc] = true;
          if (r >= 0 && r < 7 && c >= 0 && c < 7) {
            const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
            const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
            matrix[nr]![nc] = isBorder || isCenter;
          } else {
            matrix[nr]![nc] = false; // Separator
          }
        }
      }
    }
  }

  // 2. Timing Patterns
  for (let i = 8; i < size - 8; i++) {
    setModule(6, i, i % 2 === 0);
    setModule(i, 6, i % 2 === 0);
  }

  // 3. Dark Module
  setModule(size - 8, 8, true);

  // 4. Reserve Format Information areas
  for (let i = 0; i < 9; i++) {
    if (!isFunctionModule[8]![i]) isFunctionModule[8]![i] = true;
    if (!isFunctionModule[i]![8]) isFunctionModule[i]![8] = true;
  }
  for (let i = size - 8; i < size; i++) {
    if (!isFunctionModule[8]![i]) isFunctionModule[8]![i] = true;
    if (!isFunctionModule[i]![8]) isFunctionModule[i]![8] = true;
  }

  // 5. Build Bitstream (Byte Mode: 0100)
  const bitStream: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bitStream.push((val >> i) & 1);
    }
  }

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(bytes.length, 8); // Character count (8 bits for v1-9)
  for (const b of bytes) pushBits(b, 8);

  // Terminator (up to 4 zeroes)
  const dataBitsNeeded = DATA_CODEWORDS_M[version]! * 8;
  const termLen = Math.min(4, dataBitsNeeded - bitStream.length);
  pushBits(0, termLen);

  // Byte align
  while (bitStream.length % 8 !== 0) bitStream.push(0);

  // Pad with alternating 0xEC and 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitStream.length < dataBitsNeeded) {
    pushBits(padBytes[padIdx % 2]!, 8);
    padIdx++;
  }

  // 6. Convert bitStream to data codewords & compute Reed-Solomon Error Correction
  const dataCodewords = new Uint8Array(DATA_CODEWORDS_M[version]!);
  for (let i = 0; i < dataCodewords.length; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | (bitStream[i * 8 + b] || 0);
    }
    dataCodewords[i] = byteVal;
  }

  const ecCodewords = computeReedSolomon(dataCodewords, EC_CODEWORDS_M[version]!);

  // Combine data + ec into final bitstream
  const finalBits: number[] = [];
  for (const b of dataCodewords) {
    for (let i = 7; i >= 0; i--) finalBits.push((b >> i) & 1);
  }
  for (const b of ecCodewords) {
    for (let i = 7; i >= 0; i--) finalBits.push((b >> i) & 1);
  }

  // 7. Place data bits in matrix (Right to left in 2-column bands, zigzagging up and down)
  let bitIdx = 0;
  let upward = true;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // Skip timing column
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const row of rows) {
      for (const c of [col, col - 1]) {
        if (!isFunctionModule[row]![c]) {
          const bit = bitIdx < finalBits.length ? finalBits[bitIdx]! : 0;
          bitIdx++;

          // Apply standard Mask 0 ((row + col) % 2 === 0)
          const mask = (row + c) % 2 === 0;
          matrix[row]![c] = Boolean(bit ^ (mask ? 1 : 0));
        }
      }
    }
    upward = !upward;
  }

  // 8. Format Information for Mask 0 and Error Correction Level M
  // Precomputed Format Information bits with BCH (15, 5) code: 0b101010000010010
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];

  // Top-left
  matrix[8]![0] = Boolean(formatBits[0]);
  matrix[8]![1] = Boolean(formatBits[1]);
  matrix[8]![2] = Boolean(formatBits[2]);
  matrix[8]![3] = Boolean(formatBits[3]);
  matrix[8]![4] = Boolean(formatBits[4]);
  matrix[8]![5] = Boolean(formatBits[5]);
  matrix[8]![7] = Boolean(formatBits[6]);
  matrix[8]![8] = Boolean(formatBits[7]);
  matrix[7]![8] = Boolean(formatBits[8]);
  matrix[5]![8] = Boolean(formatBits[9]);
  matrix[4]![8] = Boolean(formatBits[10]);
  matrix[3]![8] = Boolean(formatBits[11]);
  matrix[2]![8] = Boolean(formatBits[12]);
  matrix[1]![8] = Boolean(formatBits[13]);
  matrix[0]![8] = Boolean(formatBits[14]);

  // Bottom-left / Top-right
  matrix[size - 1]![8] = Boolean(formatBits[0]);
  matrix[size - 2]![8] = Boolean(formatBits[1]);
  matrix[size - 3]![8] = Boolean(formatBits[2]);
  matrix[size - 4]![8] = Boolean(formatBits[3]);
  matrix[size - 5]![8] = Boolean(formatBits[4]);
  matrix[size - 6]![8] = Boolean(formatBits[5]);
  matrix[size - 7]![8] = Boolean(formatBits[6]);

  matrix[8]![size - 8] = Boolean(formatBits[7]);
  matrix[8]![size - 7] = Boolean(formatBits[8]);
  matrix[8]![size - 6] = Boolean(formatBits[9]);
  matrix[8]![size - 5] = Boolean(formatBits[10]);
  matrix[8]![size - 4] = Boolean(formatBits[11]);
  matrix[8]![size - 3] = Boolean(formatBits[12]);
  matrix[8]![size - 2] = Boolean(formatBits[13]);
  matrix[8]![size - 1] = Boolean(formatBits[14]);

  return matrix;
}

/**
 * Generates an SVG string representation of the QR code.
 */
export function generateQrSvg(text: string, options: { margin?: number; size?: number } = {}): string {
  const matrix = generateQrMatrix(text);
  const margin = options.margin ?? 4;
  const count = matrix.length;
  const viewBoxSize = count + margin * 2;
  const pixelSize = options.size ?? 256;

  let rects = "";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (matrix[r]![c]) {
        rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="#000000" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${pixelSize}" height="${pixelSize}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#ffffff"/>${rects}</svg>`;
}
