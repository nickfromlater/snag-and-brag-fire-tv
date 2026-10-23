import { describe, expect, it } from 'vitest';
import { DecorativeClock } from '../src/stage/decorative-clock';

describe('decorative loops follow show time', () => {
  it('mounts at the current beat position, without restarting a late-rendered loop', () => {
    const clock = new DecorativeClock(1000);
    expect(clock.elapsed(3400, false)).toBe(2400);
    expect(clock.elapsed(3800, false)).toBe(2800);
  });
  it('freezes repeated snapshots and resumes from the same phase after multiple pauses', () => {
    const clock = new DecorativeClock(1000);
    expect(clock.elapsed(2000, true)).toBe(1000);
    expect(clock.elapsed(8000, true)).toBe(1000);
    expect(clock.elapsed(9000, false)).toBe(1000);
    expect(clock.elapsed(9500, true)).toBe(1500);
    expect(clock.elapsed(12000, false)).toBe(1500);
    expect(clock.elapsed(12300, false)).toBe(1800);
  });
});
