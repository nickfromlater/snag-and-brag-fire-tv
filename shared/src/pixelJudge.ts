/**
 * The Pixel Judge: CIELAB color matching, ported exactly from the mockup
 * (rgb2lab, dE, colorMatch and the `realfile` handler in reference/src/game.js).
 * Runs on the phone at the shutter; the phone sends the hex and match with the photo.
 */
import { SCORING } from './constants';

export type Lab = [number, number, number];

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function hex2rgb(h: string): [number, number, number] {
  const s = h.replace('#', '');
  return [parseInt(s.substring(0, 2), 16), parseInt(s.substring(2, 4), 16), parseInt(s.substring(4, 6), 16)];
}

export function rgb2hex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
}

/** sRGB (0-255) → CIELAB, D65. */
export function rgb2lab(r: number, g: number, b: number): Lab {
  r /= 255; g /= 255; b /= 255;
  const f = (c: number) => (c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92);
  r = f(r); g = f(g); b = f(b);
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const q = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = q(x); y = q(y); z = q(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIE76 ΔE. */
export function dE(a: Lab, b: Lab): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/** Match % from a ΔE: clamp(round(100 − ΔE × 1.05), 2, 99). */
export function matchFromDeltaE(d: number): number {
  return clamp(Math.round(100 - d * SCORING.DELTA_E_SCALE), SCORING.MATCH_MIN, SCORING.MATCH_MAX);
}

/** Match % between two hex colors (bots and SVG objects use this). */
export function colorMatch(hexA: string, hexB: string): number {
  const a = hex2rgb(hexA), b = hex2rgb(hexB);
  return matchFromDeltaE(dE(rgb2lab(a[0], a[1], a[2]), rgb2lab(b[0], b[1], b[2])));
}

/** The mockup judges a 480x480 center-square crop. Downscale the 720 px snag to this first. */
export const JUDGE_SIZE = 480;
/** Whole-photo grid, packed row-major with the least significant bit first per byte. */
export const JUDGE_MASK_CELLS = 24;
export const JUDGE_MASK_BYTES = JUDGE_MASK_CELLS * JUDGE_MASK_CELLS / 8;

/** 72 bytes encode to exactly 96 standard base64 characters, with no padding. */
export function isJudgeMask(value: unknown): value is string {
  return typeof value === 'string' && value.length === 96 && /^[A-Za-z0-9+/]{96}$/.test(value);
}

export interface PhotoJudgment { hex: string; match: number; mask?: string }

function packMask(pixels: { i: number }[], size: number, cells: number): string {
  if (!Number.isInteger(cells) || cells < 1) throw new RangeError('Mask cells must be a positive integer');
  const bytes = new Uint8Array(Math.ceil(cells * cells / 8));
  for (const { i } of pixels) {
    const pixel = i / 4, x = pixel % size, y = Math.floor(pixel / size);
    const bit = Math.floor(y * cells / size) * cells + Math.floor(x * cells / size);
    bytes[bit >>> 3] = bytes[bit >>> 3]! | (1 << (bit & 7));
  }
  // Pure JS: shared code also runs on Hermes without Buffer or btoa.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let encoded = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!, b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    encoded += alphabet[a >>> 2]! + alphabet[((a & 3) << 4) | (b >>> 4)]!
      + (i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >>> 6)]! : '=')
      + (i + 2 < bytes.length ? alphabet[c & 63]! : '=');
  }
  return encoded;
}

/**
 * Light a whole-photo cell when it contains at least one of the exact closest-20%
 * samples used by judgePhoto. Cells disjoint from the center 60% remain off.
 * Default: 24×24 bits = 72 bytes = 96 base64 characters. Equal distances use
 * row-major pixel order, matching the mockup's stable sort.
 */
export function judgeMask(
  rgba: Uint8ClampedArray | Uint8Array,
  size: number,
  targetHex: string,
  cells = JUDGE_MASK_CELLS,
): string {
  return judge(rgba, size, targetHex, cells).mask!;
}

/**
 * Judge a photo. `rgba` is a square image `size`×`size` (RGBA, e.g. from getImageData),
 * already center-cropped to a square (the mockup uses 480).
 *
 * As in the mockup: sample every 4th pixel of the center 60% (rows and columns 20%-80%),
 * sort by ΔE to the target, take the closest 20%. The reported color is the average of
 * those pixels; the match is from the ΔE of the pixel at the 20th percentile.
 * With a target it also returns the default 24×24 mask from the same selection,
 * avoiding a second sampling/sort on the phone. With no target (not a Color Rush
 * round) it returns the average color and match 0, without a mask.
 */
export function judgePhoto(
  rgba: Uint8ClampedArray | Uint8Array,
  size: number,
  targetHex: string | null,
): PhotoJudgment {
  return judge(rgba, size, targetHex, JUDGE_MASK_CELLS);
}

function judge(
  rgba: Uint8ClampedArray | Uint8Array,
  size: number,
  targetHex: string | null,
  cells: number,
): PhotoJudgment {
  const x0 = Math.floor(size * 0.2), w = Math.floor(size * 0.6);
  const t = hex2rgb(targetHex ?? '#808080');
  const tl = rgb2lab(t[0], t[1], t[2]);
  const ds: { d: number; i: number }[] = [];
  const all = [0, 0, 0];
  // getImageData(x0, x0, w, w) row-major; `i += 16` in the mockup = every 4th pixel of that flat array.
  let k = 0;
  for (let yy = 0; yy < w; yy++) {
    for (let xx = 0; xx < w; xx++, k++) {
      if (k % 4 !== 0) continue;
      const i = ((x0 + yy) * size + (x0 + xx)) * 4;
      const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!;
      ds.push({ d: dE(rgb2lab(r, g, b), tl), i });
      all[0]! += r; all[1]! += g; all[2]! += b;
    }
  }
  if (!ds.length) return { hex: '#808080', match: targetHex ? SCORING.MATCH_MIN : 0, ...(targetHex ? { mask: packMask([], size, cells) } : {}) };
  if (!targetHex) return { hex: rgb2hex(all[0]! / ds.length, all[1]! / ds.length, all[2]! / ds.length), match: 0 };
  ds.sort((a, b) => a.d - b.d || a.i - b.i);
  const n = Math.max(1, Math.floor(ds.length * 0.2));
  const sum = [0, 0, 0];
  for (let j = 0; j < n; j++) {
    const i = ds[j]!.i;
    sum[0]! += rgba[i]!; sum[1]! += rgba[i + 1]!; sum[2]! += rgba[i + 2]!;
  }
  return { hex: rgb2hex(sum[0]! / n, sum[1]! / n, sum[2]! / n), match: matchFromDeltaE(ds[n - 1]!.d), mask: packMask(ds.slice(0, n), size, cells) };
}
