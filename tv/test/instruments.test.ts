import { describe, expect, it } from 'vitest';
import { cameraTracking, dialReading, flipFront, flipSwapMs, meterReading, panoramaOffset, pixelPaths } from '../src/stage/instrument-math';
import type { MotionState } from '@snag/shared';

describe('deadline dial and late-mounted meter', () => {
  it('uses the core deadline and handles overtime and zero totals', () => {
    expect(dialReading(35000, 35000, 6100)).toEqual({ seconds: 29, fraction: 28900 / 35000, urgent: false });
    expect(dialReading(35000, 35000, 25000).urgent).toBe(true);
    expect(dialReading(35000, 35000, 40000)).toEqual({ seconds: 0, fraction: 0, urgent: true });
    expect(dialReading(undefined, 0, 0).fraction).toBe(0);
  });
  it('reconstructs the rolling integer from a frozen core motion snapshot', () => {
    const state: MotionState = { animation: { target: 'meter', frames: [], durationMs: 800, delayMs: 0, fill: 'both', iterations: 1 }, durationMs: 800, elapsedMs: 400, startedAt: 0, active: true };
    expect(meterReading(99, [state], 0)).toBe(87);
    expect(meterReading(99, [state], 400)).toBe(99);
    expect(meterReading(99, [], 400)).toBe(0);
  });
  it('swaps the visible face at the reference flip bezier crossing, including a late mount', () => {
    const state: MotionState = { animation: { target: 'flip', frames: [{ transform: 'rotateY(0) scale(1)' }, { transform: 'rotateY(90deg) scale(1.08)', offset: .5 }, { transform: 'rotateY(180deg) scale(1)' }], durationMs: 620, delayMs: 0, fill: 'both', iterations: 1, easing: 'cubic-bezier(.4,0,.2,1)' }, durationMs: 620, elapsedMs: 0, startedAt: 0, active: true };
    const swap = flipSwapMs(state);
    expect(swap).toBeGreaterThan(210); expect(swap).toBeLessThan(225);
    expect(flipFront(state, swap - 1)).toBe(false);
    expect(flipFront(state, swap + 1)).toBe(true);
    expect(flipFront({ ...state, elapsedMs: 310 })).toBe(true);
    expect(flipFront({ ...state, elapsedMs: 700, active: false })).toBe(true);
  });
});
describe('bounded procedural camera and pixel scan', () => {
  it('matches the mockup tracking integration across ordinary and locked pans', () => {
    for (const speed of [1.6, 2.1, 2.6, 9]) {
      const tracking = cameraTracking(speed);
      let remaining = 1;
      for (let frame = 0; frame < 30; frame++) remaining *= 1 - speed / 60;
      expect(tracking.at(500 / tracking.durationMs)).toBeCloseTo(1 - remaining, 9);
    }
  });
  it('keeps the camera viewport in the source panorama', () => {
    for (const center of [[0, 0], [2400, 1200], [420, 282]]) for (let t = 0; t < 10; t += .1) {
      const p = panoramaOffset(center, 264, 162, t);
      expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(456);
      expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(198);
    }
  });
  it('packs exactly 100 changing cells into 15 paths with clamped RGB', () => {
    const first = pixelPaths('#FF0000', 1), next = pixelPaths('#FF0000', 2);
    expect(first).toHaveLength(15);
    expect(first.map(p => p.d).join('').match(/M/g)).toHaveLength(100);
    expect(first).not.toEqual(next);
    for (const p of first) for (const value of p.fill.match(/\d+/g)!) expect(Number(value)).toBeLessThanOrEqual(255);
  });
});
