import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameHost, seededRng } from '@snag/shared';
import type { CueEvent } from '@snag/shared';
import { GameMediaControlHandler } from '../src/stage/game-media-controls';
import { TvClock } from '../src/runtime/clock';
import type { StageSession } from '../src/stage/context';

afterEach(() => vi.useRealTimers());
function setup() {
  vi.useFakeTimers(); vi.setSystemTime(1_800_000_000_000);
  const cues: CueEvent[] = [], clock = new TvClock();
  const game = new GameHost({ clock, rng: seededRng(1), room: { code: 'TEST', joinUrl: 'https://example.invalid' }, cue: c => cues.push(c), send: () => {} });
  const update = vi.fn(), telemetry = vi.fn();
  const session: StageSession = { clock, getView: () => game.getView(), remote: key => game.remote(key), subscribe: () => () => {}, cues: () => () => {}, photoUrl: () => undefined, telemetry };
  const handler = new GameMediaControlHandler(session, update);
  const start = () => { game.setBots(true); game.remote('select'); game.remote('down'); game.remote('select'); vi.advanceTimersByTime(1500); };
  return { game, clock, cues, update, telemetry, handler, start };
}
describe('whole-show Vega transport handler', () => {
  it('advertises one session while playing and paused, releases it in the lobby and on disposal', async () => {
    const s = setup();
    try {
      s.handler.publish(); expect(s.update.mock.lastCall?.[0][0].playbackState.playbackStatus).toBe('NOT_PLAYING');
      expect(s.update.mock.lastCall?.[0][0].capabilities.actions).toEqual([]);
      await expect(s.handler.handlePlay()).rejects.toThrow('No live game');
      s.start(); s.handler.publish();
      const states = await s.handler.handleGetSessionState(); expect(states).toHaveLength(1);
      expect(states[0]?.capabilities.actions.map(a => a.name)).toContain('NEXT');
      expect(states[0]?.playbackState.playbackStatus).toBe('PLAYING');
      await s.handler.handlePause(); expect((await s.handler.handleGetSessionState())[0]?.playbackState.playbackStatus).toBe('PAUSED');
      await s.handler.handlePlay({ id: NaN }); expect(s.game.getView().paused).toBe(false);
      s.handler.dispose(); expect(s.update.mock.lastCall?.[0][0].playbackState.playbackStatus).toBe('NOT_PLAYING');
      await expect(s.handler.handleNext()).rejects.toThrow('No live game');
    } finally { s.game.dispose(); }
  });
  it('makes pause/play idempotent and freezes the hunt, bots, host and cue timeline until resume', async () => {
    const s = setup();
    try {
      s.start(); for (let i = 0; i < 2500 && s.game.getView().phase !== 'hunt'; i++) vi.advanceTimersByTime(20);
      expect(s.game.getView().phase).toBe('hunt');
      const before = s.game.getView(), remaining = before.deadline! - s.clock.now();
      await s.handler.handlePause(); await s.handler.handlePause();
      expect(s.game.getView().menu?.kind).toBe('pause'); const events = s.cues.length;
      vi.advanceTimersByTime(40000);
      expect(s.cues).toHaveLength(events); expect(s.game.getView().phase).toBe('hunt');
      expect(s.game.getView().feeds.every(f => f.state === 'hunting')).toBe(true);
      await s.handler.handlePlay(); await s.handler.handlePlay();
      expect(s.game.getView().paused).toBe(false); expect(s.game.getView().menu).toBeNull();
      expect(s.game.getView().deadline! - s.clock.now()).toBe(remaining);
      const pauses = s.cues.filter(c => c.cue.k === 'pause');
      expect(pauses.map(c => c.cue.k === 'pause' && c.cue.paused)).toEqual([true, false]);
      vi.advanceTimersByTime(12000); expect(s.game.getView().feeds.some(f => f.state !== 'hunting')).toBe(true);
    } finally { s.game.dispose(); }
  });
  it.each(['handleNext', 'handleFastForward'] as const)('%s follows the remote Fast-forward path, including resuming a paused game', async method => {
    const s = setup();
    try {
      s.start(); const phase = s.game.getView().phase; await s.handler.handlePause();
      await s.handler[method](); expect(s.game.getView().paused).toBe(false);
      expect(s.game.getView().phase).not.toBe(phase); expect(s.game.getView().menu).toBeNull();
    } finally { s.game.dispose(); }
  });
  it('rejects an unrelated session and unsupported commands, and Stop only pauses', async () => {
    const s = setup();
    try {
      s.start(); const phase = s.game.getView().phase;
      await expect(s.handler.handlePause({ id: 99 })).rejects.toThrow('No live game');
      expect(await s.handler.handleGetSessionState({ id: 99 })).toEqual([]);
      await expect(s.handler.handleStartOver()).rejects.toThrow('Unsupported');
      await s.handler.handleStop(); expect(s.game.getView().paused).toBe(true); expect(s.game.getView().phase).toBe(phase);
      await s.handler.handleTogglePlayPause(); expect(s.game.getView().paused).toBe(false);
      expect(await s.handler.handleGetMetadataInfo()).toEqual({ mediaId: 'snag-and-brag-show', title: 'Snag & Brag', artwork: [] });
    } finally { s.game.dispose(); }
  });
  it('withdraws transport after the finale completes and after End game', () => {
    const s = setup();
    try {
      s.start(); for (let i = 0; i < 900 && !s.game.getView().completed; i++) vi.advanceTimersByTime(1000);
      expect(s.game.getView().completed).toBe(true); s.handler.publish(); expect(s.update.mock.lastCall?.[0][0].playbackState.playbackStatus).toBe('NOT_PLAYING');
      s.game.remote('back'); for (let i = 0; i < 5; i++) s.game.remote('down'); s.game.remote('select'); s.game.remote('down'); s.game.remote('select');
      vi.advanceTimersByTime(1500); expect(s.game.getView().scene).toBe('lobby'); expect(s.handler.states()[0]?.playbackState.playbackStatus).toBe('NOT_PLAYING');
    } finally { s.game.dispose(); }
  });
});
