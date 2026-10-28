/**
 * Lightweight, zero-dependency ISO/IEC 18004 QR Code Matrix and Image Decoder.
 * Used for in-app scanning fallback and full end-to-end unit test verification.
 */

const MASKS = [
  (r: number, c: number) => (r + c) % 2 === 0,
  (r: number, c: number) => r % 2 === 0,
  (r: number, c: number) => c % 3 === 0,
  (r: number, c: number) => (r + c) % 3 === 0,
  (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

interface DecoderVersionConfig {
  version: number;
  totalCodewords: number;
  dataCodewords: number;
  ecCodewordsPerBlock: number;
  blocks: { count: number; data: number }[];
  alignments: number[];
}

const DECODER_CONFIGS: (DecoderVersionConfig | null)[] = [
  null,
  { version: 1, totalCodewords: 26, dataCodewords: 16, ecCodewordsPerBlock: 10, blocks: [{ count: 1, data: 16 }], alignments: [] },
  { version: 2, totalCodewords: 44, dataCodewords: 28, ecCodewordsPerBlock: 16, blocks: [{ count: 1, data: 28 }], alignments: [6, 18] },
  { version: 3, totalCodewords: 70, dataCodewords: 44, ecCodewordsPerBlock: 26, blocks: [{ count: 1, data: 44 }], alignments: [6, 22] },
  { version: 4, totalCodewords: 100, dataCodewords: 64, ecCodewordsPerBlock: 18, blocks: [{ count: 2, data: 32 }], alignments: [6, 26] },
  { version: 5, totalCodewords: 134, dataCodewords: 86, ecCodewordsPerBlock: 24, blocks: [{ count: 2, data: 43 }], alignments: [6, 30] },
  { version: 6, totalCodewords: 172, dataCodewords: 108, ecCodewordsPerBlock: 16, blocks: [{ count: 4, data: 27 }], alignments: [6, 34] },
  { version: 7, totalCodewords: 196, dataCodewords: 124, ecCodewordsPerBlock: 18, blocks: [{ count: 4, data: 31 }], alignments: [6, 22, 38] },
  { version: 8, totalCodewords: 242, dataCodewords: 154, ecCodewordsPerBlock: 22, blocks: [{ count: 2, data: 38 }, { count: 2, data: 39 }], alignments: [6, 24, 42] },
  { version: 9, totalCodewords: 292, dataCodewords: 182, ecCodewordsPerBlock: 22, blocks: [{ count: 3, data: 36 }, { count: 2, data: 37 }], alignments: [6, 26, 46] },
  { version: 10, totalCodewords: 346, dataCodewords: 216, ecCodewordsPerBlock: 26, blocks: [{ count: 4, data: 43 }, { count: 1, data: 44 }], alignments: [6, 28, 50] },
];

/**
 * Decodes a boolean QR matrix into its original UTF-8 text payload.
 */
export function decodeQrMatrix(matrix: boolean[][]): string {
  const size = matrix.length;
  if (size < 21 || (size - 17) % 4 !== 0) {
    throw new Error(`Invalid QR matrix size: ${size}`);
  }
  const version = (size - 17) / 4;
  if (version < 1 || version > 10) {
    throw new Error(`Unsupported QR version for decoder: ${version}`);
  }
  const config = DECODER_CONFIGS[version]!;

  // 1. Read format info from top-left
  const formatBits = [
    matrix[8]![0], matrix[8]![1], matrix[8]![2], matrix[8]![3], matrix[8]![4], matrix[8]![5],
    matrix[8]![7], matrix[8]![8], matrix[7]![8], matrix[5]![8], matrix[4]![8], matrix[3]![8],
    matrix[2]![8], matrix[1]![8], matrix[0]![8]
  ].map(Number);

  let formatWord = 0;
  for (const b of formatBits) formatWord = (formatWord << 1) | b;
  const unmaskedFormat = formatWord ^ 0x5412;
  const dataBits = unmaskedFormat >> 10;
  const maskIdx = dataBits & 7;

  // 2. Identify function modules to skip
  const isFunctionModule = Array.from({ length: size }, () => Array(size).fill(false));
  for (const [row, col] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row! + r;
        const nc = col! + c;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          isFunctionModule[nr]![nc] = true;
        }
      }
    }
  }
  if (config.alignments.length > 0) {
    for (const r of config.alignments) {
      for (const c of config.alignments) {
        if (r <= 8 && c <= 8) continue;
        if (r <= 8 && c >= size - 9) continue;
        if (r >= size - 9 && c <= 8) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            isFunctionModule[r + dr]![c + dc] = true;
          }
        }
      }
    }
  }
  for (let i = 8; i < size - 8; i++) {
    isFunctionModule[6]![i] = true;
    isFunctionModule[i]![6] = true;
  }
  isFunctionModule[size - 8]![8] = true;
  for (let i = 0; i < 9; i++) {
    isFunctionModule[8]![i] = true;
    isFunctionModule[i]![8] = true;
  }
  for (let i = size - 8; i < size; i++) {
    isFunctionModule[8]![i] = true;
    isFunctionModule[i]![8] = true;
  }
  if (version >= 7) {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 3; c++) {
        isFunctionModule[r]![size - 11 + c] = true;
        isFunctionModule[size - 11 + c]![r] = true;
      }
    }
  }

  // 3. Read data bits unmasking them
  const maskFn = MASKS[maskIdx] ?? MASKS[0]!;
  const bits: number[] = [];
  let upward = true;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const row of rows) {
      for (const c of [col, col - 1]) {
        if (!isFunctionModule[row]![c]) {
          const raw = matrix[row]![c] ? 1 : 0;
          const mask = maskFn(row, c) ? 1 : 0;
          bits.push(raw ^ mask);
        }
      }
    }
    upward = !upward;
  }

  // 4. Group into codewords
  const totalCodewords = config.totalCodewords;
  const codewords: number[] = [];
  for (let i = 0; i < totalCodewords; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | (bits[i * 8 + j] ?? 0);
    }
    codewords.push(b);
  }

  // 5. De-interleave data blocks
  let numBlocks = 0;
  for (const bg of config.blocks) numBlocks += bg.count;

  const dataBlocks: number[][] = Array.from({ length: numBlocks }, () => []);
  let cwIdx = 0;

  const maxBlockLen = Math.max(...config.blocks.map(bg => bg.data));
  for (let col = 0; col < maxBlockLen; col++) {
    let b = 0;
    for (const bg of config.blocks) {
      for (let i = 0; i < bg.count; i++) {
        if (col < bg.data) {
          dataBlocks[b]!.push(codewords[cwIdx++] ?? 0);
        }
        b++;
      }
    }
  }

  const allData: number[] = [];
  for (const blk of dataBlocks) {
    allData.push(...blk);
  }

  // 6. Parse byte mode stream
  let bitPos = 0;
  function readBits(len: number): number {
    let val = 0;
    for (let i = 0; i < len; i++) {
      const byteIdx = Math.floor((bitPos + i) / 8);
      const bitOffset = 7 - ((bitPos + i) % 8);
      val = (val << 1) | (((allData[byteIdx] ?? 0) >> bitOffset) & 1);
    }
    bitPos += len;
    return val;
  }

  const mode = readBits(4);
  if (mode !== 0b0100) {
    throw new Error(`Unsupported mode indicator in QR: ${mode.toString(2)}`);
  }

  const charCountLen = version >= 10 ? 16 : 8;
  const charCount = readBits(charCountLen);
  const outBytes = new Uint8Array(charCount);
  for (let i = 0; i < charCount; i++) {
    outBytes[i] = readBits(8);
  }

  return new TextDecoder().decode(outBytes);
}

/**
 * Fallback scanner detector: Attempts to find a QR matrix in ImageData pixel buffer.
 */
export function decodeQrFromImageData(imageData: {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}): string | null {
  const { data, width, height } = imageData;
  if (width < 21 || height < 21) return null;

  // 1. Convert to binary black & white grid using Otsu/average luminance
  let totalLum = 0;
  const count = width * height;
  for (let i = 0; i < count; i++) {
    const idx = i * 4;
    totalLum += 0.299 * (data[idx] ?? 0) + 0.587 * (data[idx + 1] ?? 0) + 0.114 * (data[idx + 2] ?? 0);
  }
  const threshold = totalLum / count;

  const binGrid: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const lum = 0.299 * (data[idx] ?? 0) + 0.587 * (data[idx + 1] ?? 0) + 0.114 * (data[idx + 2] ?? 0);
      binGrid[y]![x] = lum < threshold; // black = true
    }
  }

  // 2. Search for finder patterns: 1:1:3:1:1 ratio
  interface FinderCandidate {
    x: number;
    y: number;
    size: number;
  }
  const candidates: FinderCandidate[] = [];

  for (let y = 0; y < height; y += 2) {
    const runs: { val: boolean; len: number }[] = [];
    let curVal = binGrid[y]![0]!;
    let curLen = 0;

    for (let x = 0; x < width; x++) {
      if (binGrid[y]![x] === curVal) {
        curLen++;
      } else {
        runs.push({ val: curVal, len: curLen });
        curVal = binGrid[y]![x]!;
        curLen = 1;
      }
    }
    runs.push({ val: curVal, len: curLen });

    for (let i = 2; i < runs.length - 2; i++) {
      // Finder is black-white-black-white-black: [black, white, black, white, black]
      if (
        runs[i - 2]!.val &&
        !runs[i - 1]!.val &&
        runs[i]!.val &&
        !runs[i + 1]!.val &&
        runs[i + 2]!.val
      ) {
        const totalLen =
          runs[i - 2]!.len + runs[i - 1]!.len + runs[i]!.len + runs[i + 1]!.len + runs[i + 2]!.len;
        const moduleSize = totalLen / 7;
        const err = moduleSize * 0.5;

        if (
          Math.abs(runs[i - 2]!.len - moduleSize) < err &&
          Math.abs(runs[i - 1]!.len - moduleSize) < err &&
          Math.abs(runs[i]!.len - moduleSize * 3) < err * 3 &&
          Math.abs(runs[i + 1]!.len - moduleSize) < err &&
          Math.abs(runs[i + 2]!.len - moduleSize) < err
        ) {
          // Center of the middle run
          let xStart = 0;
          for (let k = 0; k < i; k++) xStart += runs[k]!.len;
          const centerX = Math.round(xStart + runs[i]!.len / 2);
          candidates.push({ x: centerX, y, size: totalLen });
        }
      }
    }
  }

  if (candidates.length < 3) return null;

  // Cluster candidates
  const clusters: FinderCandidate[] = [];
  for (const c of candidates) {
    let found = false;
    for (const cl of clusters) {
      if (Math.hypot(cl.x - c.x, cl.y - c.y) < cl.size) {
        cl.x = Math.round((cl.x + c.x) / 2);
        cl.y = Math.round((cl.y + c.y) / 2);
        found = true;
        break;
      }
    }
    if (!found) clusters.push({ ...c });
  }

  if (clusters.length < 3) return null;

  // Pick 3 finders: find the right angle corner (top-left)
  let bestTrio: [FinderCandidate, FinderCandidate, FinderCandidate] | null = null;
  let minDiff = Infinity;

  for (let i = 0; i < clusters.length; i++) {
    for (let j = 0; j < clusters.length; j++) {
      if (i === j) continue;
      for (let k = 0; k < clusters.length; k++) {
        if (i === k || j === k) continue;
        const pTL = clusters[i]!;
        const pTR = clusters[j]!;
        const pBL = clusters[k]!;

        const d1 = Math.hypot(pTR.x - pTL.x, pTR.y - pTL.y);
        const d2 = Math.hypot(pBL.x - pTL.x, pBL.y - pTL.y);
        const diff = Math.abs(d1 - d2);
        if (diff < minDiff && d1 > 20) {
          minDiff = diff;
          bestTrio = [pTL, pTR, pBL];
        }
      }
    }
  }

  if (!bestTrio) return null;

  const [tl, tr, bl] = bestTrio;
  const avgModule = ((tl.size + tr.size + bl.size) / 3) / 7;
  const dist = (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(bl.x - tl.x, bl.y - tl.y)) / 2;
  const estimatedModules = Math.round(dist / avgModule) + 7;

  // Find nearest valid QR size: 21 + 4*k
  let matrixSize = 21;
  for (let s = 21; s <= 57; s += 4) {
    if (Math.abs(s - estimatedModules) < Math.abs(matrixSize - estimatedModules)) {
      matrixSize = s;
    }
  }

  // Sample grid
  const sampledMatrix: boolean[][] = Array.from({ length: matrixSize }, () =>
    Array(matrixSize).fill(false)
  );

  const stepX = (tr.x - tl.x) / (matrixSize - 7);
  const stepY = (bl.y - tl.y) / (matrixSize - 7);

  const startX = tl.x - 3 * stepX;
  const startY = tl.y - 3 * stepY;

  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      const px = Math.round(startX + c * stepX);
      const py = Math.round(startY + r * stepY);
      if (py >= 0 && py < height && px >= 0 && px < width) {
        sampledMatrix[r]![c] = binGrid[py]![px]!;
      }
    }
  }

  try {
    return decodeQrMatrix(sampledMatrix);
  } catch {
    return null;
  }
}
