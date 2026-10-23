import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameHost, seededRng } from '@snag/shared';
import { tvMessage } from '../../relay/src/validate';
import { TvClock } from '../src/runtime/clock';

afterEach(() => vi.useRealTimers());
describe('TV synchronized clock on the relay wire', () => {
  it.each([1, 4])('keeps camera deadlines valid after fractional sync offsets at speed %i', speed => {
    vi.useFakeTimers(); vi.setSystemTime(1_800_000_000_000);
    const clock = new TvClock();
    clock.sync.sample(Date.now() - 1, Date.now()); // half-ms RTT midpoint
    expect(clock.sync.offset % 1).not.toBe(0);
    clock.accelerate(speed);
    const game = new GameHost({ clock, rng: seededRng(1), room: { code: 'TEST', joinUrl: 'https://example.invalid' }, cue: () => {}, send: () => {} });
    const cid = '00000000000000000000000000000001';
    try {
      game.peer(cid, true); game.receive(cid, { t: 'join', name: 'Synthetic Team', color: '#FF4FA0' });
      game.setBots(true); game.receive(cid, { t: 'start' });
      for (let i = 0; i < 2000 && game.getView().phase !== 'hunt'; i++) vi.advanceTimersByTime(20);
      expect(game.getView().phase).toBe('hunt');
      const screen = game.getScreen(cid)!;
      expect(screen.s.k).toBe('cam');
      expect(Number.isSafeInteger(screen.deadline)).toBe(true);
      expect(tvMessage.safeParse(screen).success).toBe(true);
    } finally { game.dispose(); }
  });
});
