import { expect, it } from 'vitest';
import { shakeOffset } from '../src/stage/effects';
it('retains the reference impact amplitude and settles without a residual world offset', () => {
  expect(shakeOffset(0, 14)).toBe(0); expect(shakeOffset(.125, 14)).toBe(-14);
  expect(shakeOffset(.25, 14)).toBeCloseTo(11.662); expect(shakeOffset(1, 14)).toBe(0);
  for (let i = 0; i <= 100; i++) expect(Math.abs(shakeOffset(i / 100, 14))).toBeLessThanOrEqual(14);
});
