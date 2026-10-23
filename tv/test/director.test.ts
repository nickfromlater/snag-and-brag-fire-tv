import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameHost, ShowcaseClock, createShowcase, seededRng, SHOWCASE_HOST_CID } from '@snag/shared';
import type { CueEvent, SnagArrived } from '@snag/shared';
import { DirectorPlayback } from '../src/runtime/director';
import { TvClock } from '../src/runtime/clock';

afterEach(() => vi.useRealTimers());
describe('native director playback', () => {
  it('holds the clock without creating a menu, resumes at normal speed and suppresses old cues on seek', () => {
    vi.useFakeTimers(); vi.setSystemTime(1800000000000);
    const coreClock = new ShowcaseClock(), cues: CueEvent[] = [];
    const game = new GameHost({ clock: coreClock, rng: seededRng(1), showcase: createShowcase(), send: () => {}, cue: e => cues.push(e) });
    game.playShowcase(); coreClock.advanceTo(6500);
    const clock = new TvClock(), playback = new DirectorPlayback(clock), consumed: CueEvent[] = [];
    const frame = { t: 'director-frame' as const, atMs: 6500, held: true, seeking: true, view: game.getView(), cues };
    playback.accept(frame, e => consumed.push(e)); vi.advanceTimersByTime(9000);
    expect(clock.now()).toBe(6500); expect(consumed).toEqual([]); expect(playback.generation).toBe(1);
    expect(playback.view({ code: 'TEST', joinUrl: 'http://localhost:8789/?r=TEST' })).toMatchObject({ paused: true, menu: null, content: { code: 'TEST' } });
    playback.accept({ ...frame, held: false, seeking: false, cues: cues.slice(-2) }, e => consumed.push(e));
    playback.accept({ ...frame, held: false, seeking: false, cues: cues.slice(-2) }, e => consumed.push(e));
    expect(consumed).toHaveLength(2); vi.advanceTimersByTime(750); expect(clock.now()).toBe(7250); expect(clock.speed).toBe(1);
    game.dispose();
  });
  it('uses the phone snag and translates camera deadlines without changing the scripted state', () => {
    const coreClock = new ShowcaseClock(), game = new GameHost({ clock: coreClock, rng: seededRng(1), showcase: createShowcase(), send: () => {}, cue: () => {} });
    game.playShowcase(); coreClock.advanceTo(22770);
    const clock = new TvClock(), playback = new DirectorPlayback(clock);
    const photo: SnagArrived = { t: 'snag', photoId: 'memory-only', round: 0, hex: '#FF6FB5', match: 99, mask: Buffer.alloc(72, 1).toString('base64') };
    const camera = game.getScreen(SHOWCASE_HOST_CID)!;
    playback.accept({ t: 'director-frame', atMs: coreClock.now(), held: false, seeking: true, view: game.getView(), cues: [], phoneScreen: camera }, () => {});
    const phone = playback.screen(50, 1800000000000)!;
    expect(phone.seq).toBe(50); expect(phone.s.k).toBe('cam'); expect(phone.deadline).toBeGreaterThan(1800000000000);
    expect(playback.screen(51, 1800000000000, photo)!.s).toMatchObject({ k: 'glow', find: { photoId: 'memory-only' }, aiPending: false });
    coreClock.advanceTo(57000); const original = game.getView();
    playback.accept({ t: 'director-frame', atMs: coreClock.now(), held: true, seeking: true, view: original, cues: [], phoneScreen: game.getScreen(SHOWCASE_HOST_CID) }, () => {});
    const view = playback.view({ code: 'TEST', joinUrl: 'http://localhost:8789' }, photo)!;
    if (view.content.k !== 'judge') throw new Error('Expected the actual judge snapshot');
    expect(view.content.cards[0]!.find).toMatchObject({ photoId: 'memory-only', obj: undefined, match: 99, mask: photo.mask });
    expect(view.teams).toEqual(original.teams); expect(original.content.k === 'judge' && original.content.cards[0]!.find.obj).toBe('glove');
    expect(JSON.stringify(view)).not.toContain('data:image'); game.dispose();
  });
  it('keeps the off-center final tug and awards when clearing held combo effects', () => {
    const coreClock = new ShowcaseClock(), game = new GameHost({ clock: coreClock, rng: seededRng(1), showcase: createShowcase(), send: () => {}, cue: () => {} });
    game.playShowcase(); coreClock.advanceTo(142482); const original = game.getView();
    if (original.content.k !== 'brag') throw new Error('Expected the actual final mash');
    expect(original.content.match.final).toBe(true); expect(Math.abs(original.content.match.p)).toBeGreaterThan(.02);
    const playback = new DirectorPlayback(new TvClock());
    const frame = { t: 'director-frame' as const, atMs: coreClock.now(), held: true, seeking: true, view: original, cues: [] };
    playback.accept(frame, () => {}); const held = playback.view({ code: 'TEST', joinUrl: 'http://localhost' })!;
    if (held.content.k !== 'brag') throw new Error('Expected the held final mash');
    expect(held.content.match.p).toBe(original.content.match.p); expect(held.content.match.taps).toEqual({}); expect(held.teams).toEqual(original.teams);
    playback.accept({ ...frame, held: false }, () => {});
    expect(playback.view({ code: 'TEST', joinUrl: 'http://localhost' })!.content).toEqual(original.content); game.dispose();
  });
});
