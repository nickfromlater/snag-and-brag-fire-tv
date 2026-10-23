import { describe, expect, it } from 'vitest';
import { colorMatch, judgeMask, judgePhoto, isJudgeMask, rgb2lab, COLORS } from '../src';

function solid(size: number, r: number, g: number, b: number): Uint8ClampedArray {
  const a = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < a.length; i += 4) { a[i] = r; a[i + 1] = g; a[i + 2] = b; a[i + 3] = 255; }
  return a;
}

describe('pixel judge', () => {
  it('rgb2lab of white is L=100', () => {
    const [L, a, b] = rgb2lab(255, 255, 255);
    expect(L).toBeCloseTo(100, 1); expect(Math.abs(a)).toBeLessThan(0.5); expect(Math.abs(b)).toBeLessThan(0.5);
  });
  it('identical colors score 99, opposites score 2', () => {
    expect(colorMatch('#F23B2E', '#F23B2E')).toBe(99);
    expect(colorMatch('#000000', '#FFD43B')).toBe(2);
  });
  it('a solid photo of the target scores 99 and reports the target', () => {
    for (const c of COLORS) {
      const n = parseInt(c.hex.slice(1), 16);
      const r = judgePhoto(solid(480, n >> 16, (n >> 8) & 255, n & 255), 480, c.hex);
      expect(r.match).toBe(99);
      expect(r.hex.toUpperCase()).toBe(c.hex.toUpperCase());
    }
  });
  it('only the center 60% counts: a red border around a blue center scores blue', () => {
    const s = 480, a = solid(s, 242, 59, 46);
    for (let y = 100; y < 380; y++) for (let x = 100; x < 380; x++) { const i = (y * s + x) * 4; a[i] = 46; a[i + 1] = 91; a[i + 2] = 255; }
    expect(judgePhoto(a, s, '#2E5BFF').match).toBe(99);
    expect(judgePhoto(a, s, '#F23B2E').match).toBeLessThan(40);
  });
  it('a 25% patch of the target in the center still scores high (closest 20% rule)', () => {
    const s = 480, a = solid(s, 128, 128, 128);
    for (let y = 96; y < 240; y++) for (let x = 96; x < 384; x++) { const i = (y * s + x) * 4; a[i] = 255; a[i + 1] = 111; a[i + 2] = 181; }
    expect(judgePhoto(a, s, '#FF6FB5').match).toBe(99);
  });
});

function onCells(mask: string, cells = 24): [number, number][] {
  const bytes = Buffer.from(mask, 'base64'), on: [number, number][] = [];
  for (let bit = 0; bit < cells * cells; bit++) if (bytes[bit >>> 3]! & (1 << (bit & 7))) on.push([bit % cells, Math.floor(bit / cells)]);
  return on;
}

describe('Pixel Judge evidence mask', () => {
  it('lights exactly the red patch cells on a grey photo', () => {
    const size = 480, rgba = solid(size, 128, 128, 128);
    // Slightly over 20% of the central sample, so all selected pixels are red.
    // The row-major tie order still reaches every cell in the 9×5 patch.
    for (let y = 180; y < 280; y++) for (let x = 140; x < 320; x++) {
      const i = (y * size + x) * 4; rgba[i] = 242; rgba[i + 1] = 59; rgba[i + 2] = 46;
    }
    const mask = judgeMask(rgba, size, '#F23B2E');
    const expected: [number, number][] = [];
    for (let y = 9; y < 14; y++) for (let x = 7; x < 16; x++) expected.push([x, y]);
    expect(onCells(mask)).toEqual(expected);
    expect(mask).toHaveLength(96); expect(Buffer.from(mask, 'base64')).toHaveLength(72);
    expect(judgePhoto(rgba, size, '#F23B2E')).toEqual({ hex: '#f23b2e', match: 99, mask });
  });
  it('never lights a cell disjoint from the center sample, even with a matching border', () => {
    const size = 480, rgba = solid(size, 242, 59, 46);
    for (let y = 96; y < 384; y++) for (let x = 96; x < 384; x++) {
      const i = (y * size + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = 128;
    }
    const on = onCells(judgeMask(rgba, size, '#F23B2E'));
    expect(on.length).toBeGreaterThan(0);
    expect(on.every(([x, y]) => x >= 4 && x <= 19 && y >= 4 && y <= 19)).toBe(true);
  });
  it('selects exactly the first closest 20% with deterministic row-major ties', () => {
    const rgba = solid(480, 242, 59, 46), first = judgeMask(rgba, 480, '#F23B2E');
    const expected: [number, number][] = [];
    for (let y = 4; y < 8; y++) for (let x = 4; x < 20; x++) expected.push([x, y]);
    expect(onCells(first)).toEqual(expected);
    for (let n = 0; n < 3; n++) expect(judgeMask(rgba, 480, '#F23B2E')).toBe(first);
  });
  it('keeps the mask optional for other rounds and supports an alternate cell grid', () => {
    const rgba = solid(480, 242, 59, 46);
    expect(judgePhoto(rgba, 480, null)).toEqual({ hex: '#f23b2e', match: 0 });
    const mask = judgeMask(rgba, 480, '#F23B2E', 3);
    expect(Buffer.from(mask, 'base64')).toHaveLength(2);
    expect(onCells(mask, 3)).toEqual([[0, 0], [1, 0], [2, 0]]);
    expect(() => judgeMask(rgba, 480, '#F23B2E', 0)).toThrow(RangeError);
  });
  it('strictly recognizes the 72-byte standard-base64 wire format', () => {
    const valid = Buffer.from(new Uint8Array(72).fill(255)).toString('base64');
    expect(isJudgeMask(valid)).toBe(true);
    for (const invalid of [undefined, null, 96, {}, '', valid.slice(1), valid + 'A', valid + '\n', valid + '=', '_'.repeat(96), '-'.repeat(96), ' '.repeat(96)]) expect(isJudgeMask(invalid)).toBe(false);
  });
});

import { utf8EncodeJs as utf8Encode, utf8DecodeJs as utf8Decode } from '../src';
describe('utf8 fallback', () => {
  it('round-trips ASCII, accents, emoji', () => {
    for (const s of ['{"t":"snag"}', "Grandma's Revenge", 'Dame Crème Brûlée', 'party 🎉🧦']) {
      const enc = utf8Encode(s);
      expect(Array.from(enc)).toEqual(Array.from(new TextEncoder().encode(s)));
      expect(utf8Decode(enc)).toBe(s);
    }
  });
});
