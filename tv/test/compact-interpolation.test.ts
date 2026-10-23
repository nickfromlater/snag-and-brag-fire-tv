import { expect, it } from 'vitest';
import { compactInterpolation } from '../src/stage/compact-interpolation';

it('reduces a long constant/linear native track to its endpoints', () => {
  const input = Array.from({ length: 601 }, (_, i) => i * 50);
  for (const output of [input.map(() => 0), input.map(t => -7 + t * .03)]) {
    const compact = compactInterpolation(input, output);
    expect(compact.inputRange).toEqual([0, 30000]); expect(compact.outputRange).toEqual([output[0], output[600]]);
  }
});
it('bounds curve error and retains the floor-grid/doodle wrap discontinuities', () => {
  const input = Array.from({ length: 161 }, (_, i) => i * 50);
  for (const output of [input.map(t => Math.sin(t / 1000)), input.map(t => (t % 1800) / 1800), input.map(t => t < 4000 ? t / 50 : -50)]) {
    const compact = compactInterpolation(input, output, .001);
    let segment = 0;
    for (let i = 0; i < input.length; i++) {
      while (segment < compact.inputRange.length - 2 && input[i]! > compact.inputRange[segment + 1]!) segment++;
      const left = compact.inputRange[segment]!, right = compact.inputRange[segment + 1]!, y = compact.outputRange[segment]!;
      const actual = y + (compact.outputRange[segment + 1]! - y) * (input[i]! - left) / (right - left);
      expect(Math.abs(actual - output[i]!)).toBeLessThanOrEqual(.0010000001);
    }
  }
});
