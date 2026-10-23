import { afterEach, describe, expect, it, vi } from 'vitest';
import { Timeline, meterTicks, periodicOffsets } from '../src/stage/tasks';

afterEach(() => vi.useRealTimers());
describe('cue-owned score-roll ticks', () => {
  it('uses the meter probability and pitch progress without playing past its core duration', () => {
    expect(meterTicks(800, .5, () => .6)).toEqual([]);
    const ticks = meterTicks(800, .5, () => .4);
    expect(ticks.length).toBeGreaterThanOrEqual(48);
    expect(ticks[0]).toEqual({ at: 0, progress: 0 });
    expect(ticks.at(-1)!.at).toBeLessThan(800);
    expect(ticks.at(-1)!.progress).toBeGreaterThan(.95);
  });
  it('plays the reference 60ms beats throughout a 1300ms roll without an extra endpoint tick', () => {
    const offsets = periodicOffsets(1300, 60);
    expect(offsets).toHaveLength(22);
    expect(offsets.slice(0, 3)).toEqual([0, 60, 120]);
    expect(offsets.at(-1)).toBe(1260);
    expect(periodicOffsets(120, 60)).toEqual([0, 60]);
  });
  it('freezes pending ticks during pause and cancels them when the scene leaves', () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const timeline = new Timeline({ now: Date.now, setTimeout, clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) });
    const ticks: number[] = [];
    periodicOffsets(1300, 60).forEach(at => timeline.after(at, () => ticks.push(at)));
    vi.advanceTimersByTime(90); expect(ticks).toEqual([0, 60]);
    timeline.pause(); vi.advanceTimersByTime(500); expect(ticks).toEqual([0, 60]);
    timeline.resume(); vi.advanceTimersByTime(30); expect(ticks).toEqual([0, 60, 120]);
    timeline.clear(); vi.advanceTimersByTime(2000); expect(ticks).toEqual([0, 60, 120]);
  });
});
