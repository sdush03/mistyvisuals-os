/**
 * Zero-dependency QR Code generator (Nayuki algorithm)
 * Generates compliant ISO/IEC 18004 QR Codes
 */

export type QrEcc = 'L' | 'M' | 'Q' | 'H';

export class QrCode {
  readonly size: number;
  private readonly modules: boolean[][];

  constructor(
    readonly version: number,
    readonly errorCorrectionLevel: QrEcc,
    dataCodewords: number[],
    mask: number
  ) {
    if (version < 1 || version > 40) throw new RangeError('Version out of range');
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(false));

    // Draw function patterns
    const isFunction: boolean[][] = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    this.drawFunctionPatterns(isFunction);

    // Draw data
    const allCodewords = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords, isFunction);

    // Apply best mask
    if (mask < 0 || mask > 7) {
      mask = this.findBestMask(isFunction);
    }
    this.applyMask(mask, isFunction);
    this.drawFormatBits(mask);
  }

  getModule(x: number, y: number): boolean {
    return x >= 0 && x < this.size && y >= 0 && y < this.size ? this.modules[y][x] : false;
  }

  static encodeText(text: string, ecl: QrEcc = 'M'): QrCode {
    const bytes = new TextEncoder().encode(text);
    // Find minimum version
    for (let ver = 1; ver <= 40; ver++) {
      const dataCapacity = QrCode.getNumDataCodewords(ver, ecl);
      // Byte mode header (4 bits) + count bits (8 for v1-9, 16 for v10+) + data bits
      const countBits = ver <= 9 ? 8 : 16;
      const totalDataBits = 4 + countBits + bytes.length * 8;
      if (totalDataBits <= dataCapacity * 8) {
        // Fits in this version!
        const bb: number[] = [];
        // Mode indicator: 0100 for Byte
        appendBits(4, 4, bb);
        // Character count
        appendBits(bytes.length, countBits, bb);
        // Data
        for (const b of bytes) appendBits(b, 8, bb);
        // Terminator (up to 4 zeroes)
        const padBits = Math.min(4, dataCapacity * 8 - bb.length);
        appendBits(0, padBits, bb);
        // Pad to byte
        while (bb.length % 8 !== 0) bb.push(0);
        // Convert to bytes
        const dataBytes: number[] = [];
        for (let i = 0; i < bb.length; i += 8) {
          let byte = 0;
          for (let j = 0; j < 8; j++) byte = (byte << 1) | bb[i + j];
          dataBytes.push(byte);
        }
        // Pad with alternating 0xEC, 0x11
        const padBytes = [0xec, 0x11];
        let padIdx = 0;
        while (dataBytes.length < dataCapacity) {
          dataBytes.push(padBytes[padIdx % 2]);
          padIdx++;
        }
        return new QrCode(ver, ecl, dataBytes, -1);
      }
    }
    throw new Error('Text too long to fit in standard QR code');
  }

  private drawFunctionPatterns(isFunction: boolean[][]): void {
    // Timing patterns
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0, isFunction);
      this.setFunctionModule(i, 6, i % 2 === 0, isFunction);
    }
    // Finder patterns
    this.drawFinderPattern(3, 3, isFunction);
    this.drawFinderPattern(this.size - 4, 3, isFunction);
    this.drawFinderPattern(3, this.size - 4, isFunction);

    // Alignment patterns
    const alignPos = QrCode.getAlignmentPatternPositions(this.version);
    for (let i = 0; i < alignPos.length; i++) {
      for (let j = 0; j < alignPos.length; j++) {
        if (
          (i === 0 && j === 0) ||
          (i === 0 && j === alignPos.length - 1) ||
          (i === alignPos.length - 1 && j === 0)
        )
          continue;
        this.drawAlignmentPattern(alignPos[i], alignPos[j], isFunction);
      }
    }
  }

  private drawFinderPattern(x: number, y: number, isFunction: boolean[][]): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const qx = x + dx;
        const qy = y + dy;
        if (qx >= 0 && qx < this.size && qy >= 0 && qy < this.size) {
          this.setFunctionModule(qx, qy, dist !== 2 && dist !== 4, isFunction);
        }
      }
    }
  }

  private drawAlignmentPattern(x: number, y: number, isFunction: boolean[][]): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, isFunction);
      }
    }
  }

  private setFunctionModule(x: number, y: number, isDark: boolean, isFunction: boolean[][]): void {
    this.modules[y][x] = isDark;
    isFunction[y][x] = true;
  }

  private drawFormatBits(mask: number): void {
    const data = (QrCode.getFormatBits(this.errorCorrectionLevel) << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) this.modules[8][i] = getBit(bits, i);
    this.modules[8][7] = getBit(bits, 6);
    this.modules[8][8] = getBit(bits, 7);
    this.modules[7][8] = getBit(bits, 8);
    for (let i = 9; i < 15; i++) this.modules[14 - i][8] = getBit(bits, i);

    for (let i = 0; i < 8; i++) this.modules[this.size - 1 - i][8] = getBit(bits, i);
    for (let i = 8; i < 15; i++) this.modules[8][this.size - 15 + i] = getBit(bits, i);
    this.modules[this.size - 8][8] = true;
  }

  private drawCodewords(data: number[], isFunction: boolean[][]): void {
    let bitIndex = 0;
    const totalBits = data.length * 8;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!isFunction[y][x] && bitIndex < totalBits) {
            this.modules[y][x] = getBit(data[bitIndex >>> 3], 7 - (bitIndex & 7));
            bitIndex++;
          }
        }
      }
    }
  }

  private applyMask(mask: number, isFunction: boolean[][]): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (isFunction[y][x]) continue;
        let invert = false;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        }
        if (invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  private findBestMask(isFunction: boolean[][]): number {
    let bestMask = 0;
    let minPenalty = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      this.applyMask(mask, isFunction);
      this.drawFormatBits(mask);
      const penalty = this.getPenaltyScore();
      if (penalty < minPenalty) {
        minPenalty = penalty;
        bestMask = mask;
      }
      this.applyMask(mask, isFunction); // Unmask
    }
    return bestMask;
  }

  private getPenaltyScore(): number {
    let score = 0;
    // Simple penalty heuristic (runs of same color)
    for (let y = 0; y < this.size; y++) {
      let run = 0;
      let last = false;
      for (let x = 0; x < this.size; x++) {
        if (x === 0 || this.modules[y][x] !== last) {
          last = this.modules[y][x];
          run = 1;
        } else {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score++;
        }
      }
    }
    return score;
  }

  private addEccAndInterleave(data: number[]): number[] {
    const numBlocks = QrCode.NUM_ERROR_CORRECTION_BLOCKS[this.errorCorrectionLevel][this.version];
    const totalEcc = QrCode.NUM_ERROR_CORRECTION_CODEWORDS[this.errorCorrectionLevel][this.version];
    const blockEccLen = Math.floor(totalEcc / numBlocks);
    const numShortBlocks = numBlocks - (QrCode.getNumRawDataModules(this.version) / 8 - totalEcc) % numBlocks;
    const shortBlockLen = Math.floor((QrCode.getNumRawDataModules(this.version) / 8 - totalEcc) / numBlocks);

    const blocks: number[][] = [];
    const rs = new ReedSolomonGenerator(blockEccLen);
    let k = 0;
    for (let i = 0; i < numBlocks; i++) {
      const dataLen = shortBlockLen + (i < numShortBlocks ? 0 : 1);
      const dat = data.slice(k, k + dataLen);
      k += dataLen;
      const ecc = rs.getRemainder(dat);
      blocks.push(dat.concat(ecc));
    }

    const result: number[] = [];
    const maxLen = blocks[blocks.length - 1].length;
    for (let i = 0; i < maxLen; i++) {
      for (let j = 0; j < blocks.length; j++) {
        if (i < blocks[j].length) result.push(blocks[j][i]);
      }
    }
    return result;
  }

  static getNumDataCodewords(ver: number, ecl: QrEcc): number {
    return Math.floor(QrCode.getNumRawDataModules(ver) / 8) - QrCode.NUM_ERROR_CORRECTION_CODEWORDS[ecl][ver];
  }

  private static getNumRawDataModules(ver: number): number {
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  private static getFormatBits(ecl: QrEcc): number {
    switch (ecl) {
      case 'L': return 1;
      case 'M': return 0;
      case 'Q': return 3;
      case 'H': return 2;
    }
  }

  private static getAlignmentPatternPositions(ver: number): number[] {
    if (ver === 1) return [];
    const num = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (num * 2 - 2)) * 2;
    const result = [6];
    for (let pos = ver * 4 + 10; result.length < num; pos -= step) {
      result.splice(1, 0, pos);
    }
    return result;
  }

  private static readonly NUM_ERROR_CORRECTION_CODEWORDS: Record<QrEcc, number[]> = {
    L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  };

  private static readonly NUM_ERROR_CORRECTION_BLOCKS: Record<QrEcc, number[]> = {
    L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  };
}

class ReedSolomonGenerator {
  private readonly coefficients: number[];
  constructor(degree: number) {
    this.coefficients = [1];
    let root = 1;
    for (let i = 0; i < degree; i++) {
      this.coefficients = this.multiply([1, root]);
      root = ReedSolomonGenerator.multiplyGf(root, 0x02);
    }
  }

  private multiply(other: number[]): number[] {
    const result = new Array(this.coefficients.length + other.length - 1).fill(0);
    for (let i = 0; i < this.coefficients.length; i++) {
      for (let j = 0; j < other.length; j++) {
        result[i + j] ^= ReedSolomonGenerator.multiplyGf(this.coefficients[i], other[j]);
      }
    }
    return result;
  }

  getRemainder(data: number[]): number[] {
    const degree = this.coefficients.length - 1;
    const result = new Array(degree).fill(0);
    for (const byte of data) {
      const factor = byte ^ result.shift()!;
      result.push(0);
      for (let i = 0; i < degree; i++) {
        result[i] ^= ReedSolomonGenerator.multiplyGf(this.coefficients[i + 1], factor);
      }
    }
    return result;
  }

  private static multiplyGf(x: number, y: number): number {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
}

function appendBits(val: number, len: number, arr: number[]): void {
  for (let i = len - 1; i >= 0; i--) arr.push((val >>> i) & 1);
}

function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}
