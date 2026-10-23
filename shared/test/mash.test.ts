import { describe, expect, it } from 'vitest';
import { MASH_PUSH_PER_TAP, mashPush, seededRng } from '../src';

function simulate(seed: number, faster = false) {
  const rng = seededRng(seed); let p = 0, left = 0, right = 0, centered = 0, boundary: number | undefined;
  const positions: number[] = [];
  // Independent 100 ms phone packets, fractional tap accumulation, 6-8 taps/s noise.
  for (let ms = 100; ms <= 6000; ms += 100) {
    left += (faster ? 13 + rng() * 2 : 6 + rng() * 2) * .1; right += (6 + rng() * 2) * .1;
    const l = Math.floor(left), r = Math.floor(right); left -= l; right -= r;
    p = mashPush(p, l, r); positions.push(p); if (Math.abs(p) <= .3) centered++;
    if (boundary === undefined && Math.abs(p) >= 1) boundary = ms;
  }
  return { centered: centered / positions.length, boundary, positions };
}
describe('seeded mash tuning', () => {
  it('keeps equally matched noisy 6-8 taps/s humans within ±30% for most of six seconds', () => {
    for (let seed = 1; seed <= 100; seed++) expect(simulate(seed).centered).toBeGreaterThanOrEqual(.9);
  });
  it('lets a human tapping twice as fast reach the winning edge in about four seconds', () => {
    const times = Array.from({ length: 100 }, (_, i) => simulate(i + 1, true).boundary!);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(3700); expect(Math.max(...times)).toBeLessThanOrEqual(4400);
    expect(times.reduce((a, b) => a + b, 0) / times.length).toBeGreaterThanOrEqual(3900);
    expect(times.reduce((a, b) => a + b, 0) / times.length).toBeLessThanOrEqual(4200);
    expect(MASH_PUSH_PER_TAP).toBe(.036);
  });
});
