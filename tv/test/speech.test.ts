import { describe, expect, it, vi } from 'vitest';
import type { ClientToRelay, SpeechMark, TvCue } from '@snag/shared';
import { SpeechCache } from '../src/runtime/speech';
import { SpeechTrack, smoothJaw, visemeJaw, VISEME_JAW } from '../src/stage/speech-track';
import { VoiceDirector, NATIVE_VOICE_DEADLINE_MS } from '../src/stage/voice';
import { HostTrack } from '@snag/shared';
import { Timeline } from '../../shared/src/game/timeline';

const marks: SpeechMark[] = [
  { time: 0, type: 'word', value: 'A' }, { time: 0, type: 'viseme', value: 'p' },
  { time: 150, type: 'viseme', value: 'a' }, { time: 250, type: 'word', value: 'splendid' },
  { time: 500, type: 'word', value: 'find' }, { time: 700, type: 'viseme', value: 'sil' },
];
const cue: Extract<TvCue, { k: 'host' }> = { k: 'host', line: { trigger: 'test', text: 'A **splendid** find.', brow: 'norm', hold: 500, linger: 1600, wait: true }, typingMs: 272, startedAt: 0,
  cadence: { intervalMs: 34, characters: 2, voiceEveryCharacters: 4, talkingOpen: [.4, 1], quietOpen: [0, .35] } };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function harness(deadlineMs = 600) {
  let now = 0, position = 0, ended = false, failed = false;
  const sent: ClientToRelay[] = [], records: { kind: string; fields: Record<string, string | number | boolean | null> }[] = [];
  const cache = new SpeechCache(m => { sent.push(m); return true; }, id => 'http://synthetic/tts/' + id);
  const stop = vi.fn(), blip = vi.fn(async () => {}), timing = vi.fn();
  const startSpeech = vi.fn(async () => ({ get positionMs() { return position; }, get ended() { return ended; }, get failed() { return failed; }, stop }));
  const voice = new VoiceDirector(cache, { startSpeech, play: blip }, () => now, (kind, fields) => records.push({ kind, fields }), timing, undefined, deadlineMs);
  const ready = (ok = true, durationMs = 800) => { const message = [...sent].reverse().find(m => m.t === 'tts'); if (message?.t === 'tts') cache.receive({ t: 'tts', id: message.id, ok, marks, durationMs }); };
  return { cache, voice, sent, records, ready, stop, blip, startSpeech, timing,
    clock: (ms: number) => { now = ms; }, audio: (ms: number) => { position = ms; }, end: () => { ended = true; }, fail: () => { failed = true; } };
}
describe('compiled Polly track', () => {
  it('maps every supported viseme onto the reference jaw axis and closes unknown/silent codes', () => {
    expect(Object.keys(VISEME_JAW)).toEqual(['p','t','S','T','f','k','i','r','s','u','@','a','e','E','o','O','sil']);
    for (const code of Object.keys(VISEME_JAW)) { expect(visemeJaw(code)).toBeGreaterThanOrEqual(0); expect(visemeJaw(code)).toBeLessThanOrEqual(1); }
    expect(visemeJaw('a')).toBe(1); expect(visemeJaw('p')).toBe(0); expect(visemeJaw('sil')).toBe(0); expect(visemeJaw('unknown')).toBe(0);
    expect(smoothJaw(0, 1, 1 / 30, true)).toBeCloseTo(.6);
    expect(smoothJaw(1, 0, 1 / 30, false)).toBeCloseTo(2 / 3);
    expect(smoothJaw(.5, 1, 0, true)).toBe(.5); expect(smoothJaw(0, 1, 1, true)).toBe(1);
  });
  it('reveals whole words and punctuation at mark time, with bold removed from offsets', () => {
    const track = new SpeechTrack(cue.line.text, marks, 800);
    expect(track.sample(-1)).toEqual({ characters: 0, target: 0, talking: false });
    expect(track.plain.slice(0, track.sample(0).characters)).toBe('A');
    expect(track.plain.slice(0, track.sample(249).characters)).toBe('A');
    expect(track.plain.slice(0, track.sample(250).characters)).toBe('A splendid');
    expect(track.plain.slice(0, track.sample(500).characters)).toBe('A splendid find.');
    expect(track.sample(150).target).toBe(1); expect(track.sample(700).target).toBe(0);
    expect(track.sample(800)).toEqual({ characters: 16, target: 0, talking: false });
  });
  it('handles repeated words, apostrophes, Unicode and sorted marks without wall timers', () => {
    const track = new SpeechTrack("**I** am watching. I am watching Élodie's mug!", [
      { time: 600, type: 'word', value: "Élodie's" }, { time: 0, type: 'word', value: 'I' },
      { time: 100, type: 'word', value: 'am' }, { time: 200, type: 'word', value: 'watching' },
      { time: 300, type: 'word', value: 'I' }, { time: 400, type: 'word', value: 'am' }, { time: 500, type: 'word', value: 'watching' },
    ], 1000);
    expect(track.plain.slice(0, track.sample(300).characters)).toBe('I am watching. I');
    expect(track.plain.slice(0, track.sample(600).characters)).toBe("I am watching. I am watching Élodie's");
    expect(track.sample(100).characters).toBe(4); // Seeking uses the same precomputed track.
  });
});
describe('room speech cache and prefetch', () => {
  it('keeps the known next-line order and advances it when a foreground line starts', async () => {
    const h = harness(); h.cache.prefetch(cue.line.text); h.ready(); await flush();
    expect(h.cache.upcoming()?.id).toBe(h.cache.peek(cue.line.text)?.id);
    void h.cache.request(cue.line.text, true); expect(h.cache.upcoming()).toBeUndefined();
    h.cache.resetPlan(); h.cache.clear();
  });
  it('skips unused earlier plans without allowing an opportunistic quip to block scripted speech', async () => {
    const h = harness(); h.cache.prefetch('skipped'); h.cache.prefetch(cue.line.text); h.cache.prefetch('quip', false);
    h.ready(); await flush(); void h.cache.request(cue.line.text, true); expect(h.cache.upcoming()).toBeUndefined(); h.cache.clear();
  });
  it('prepares native bytes before resolving a prefetched line and zeroes them when the room closes', async () => {
    const sent: ClientToRelay[] = [], data = Uint8Array.from([1,2,3]).buffer;
    let prepare!: (data: ArrayBuffer) => void;
    const cache = new SpeechCache(m => { sent.push(m); return true; }, () => 'http://synthetic/tts?k=memory', 32,
      () => new Promise(resolve => { prepare = resolve; }));
    const pending = cache.request(cue.line.text); const request = sent[0]!;
    if (request.t !== 'tts') throw new Error('wrong request');
    cache.receive({ t: 'tts', id: request.id, ok: true, marks, durationMs: 800 });
    expect(cache.peek(cue.line.text)?.nativeAudio).toBeUndefined();
    prepare(data); await flush(); expect((await pending)?.nativeAudio).toBe(data);
    cache.clear(); expect(new Uint8Array(data)).toEqual(new Uint8Array(3));
  });
  it('prefetches before speech, reuses fixed lines, and separates runtime text', async () => {
    const h = harness(); h.cache.prefetch(cue.line.text); h.ready(); await flush();
    h.voice.start(1, cue); await flush(); h.audio(10); h.clock(100); h.voice.frame(cue.line.text);
    expect(h.sent).toHaveLength(2); // Prefetch plus a cached relay request for this host line.
    expect(h.startSpeech).toHaveBeenCalledTimes(1);
    expect(h.records.find(r => r.kind === 'voice-line')?.fields).toMatchObject({ path: 'polly', prefetched: true });
    h.cache.prefetch('Welcome, **different team**!'); expect(h.sent).toHaveLength(3);
    h.voice.stop();
  });
  it('bounds concurrency and moves an upcoming foreground line ahead of queued prefetch', async () => {
    const h = harness(); for (const text of ['one','two','three','four']) h.cache.prefetch(text);
    expect(h.sent).toHaveLength(2);
    void h.cache.request('four', true);
    const first = h.sent[0]!; if (first.t !== 'tts') throw new Error('wrong envelope');
    h.cache.receive({ t: 'tts', id: first.id, ok: false });
    expect(h.sent[2]).toMatchObject({ t: 'tts', text: 'four' });
    h.cache.clear(); await flush(); expect(h.cache.peek('one')).toBeUndefined();
  });
  it('drops room marks/URLs and ignores late replies after a room reset', async () => {
    const h = harness(), pending = h.cache.request(cue.line.text);
    h.cache.clear(); h.ready(); expect(await pending).toBeUndefined();
    expect(h.cache.peek(cue.line.text)).toBeUndefined();
    void h.cache.request(cue.line.text); expect(h.sent[0]).not.toEqual(h.sent[1]); h.cache.clear();
  });
});
describe('speech routing deadline and media clock', () => {
  it('reads diagnostic media time without selecting a route, advancing the track or stopping playback', async () => {
    const h = harness();
    expect(h.voice.debugClock()).toEqual({ lineSeq: 0, mediaMs: 0, mediaPath: 'none' });
    h.voice.start(42, cue); h.ready(); await flush(); h.audio(123); h.clock(200);
    expect(h.voice.debugClock()).toEqual({ lineSeq: 42, mediaMs: 0, mediaPath: 'pending' });
    expect(h.records).toHaveLength(0);
    h.voice.frame(cue.line.text);
    expect(h.voice.debugClock()).toEqual({ lineSeq: 42, mediaMs: 123, mediaPath: 'polly' });
    const count = h.records.length; h.audio(640);
    expect(h.voice.debugClock()).toEqual({ lineSeq: 42, mediaMs: 640, mediaPath: 'polly' });
    expect(h.records).toHaveLength(count); expect(h.stop).not.toHaveBeenCalled();
    h.audio(800); h.voice.frame(cue.line.text);
    expect(h.voice.debugClock().mediaMs).toBe(800);
    h.voice.stop(); h.cache.clear();
    expect(h.voice.debugClock()).toEqual({ lineSeq: 0, mediaMs: 0, mediaPath: 'none' });
  });
  it('reserves native preparation before the short core typing hold expires, allowing a late clip to finish', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const sent: ClientToRelay[] = [], records: { kind: string; fields: Record<string, string | number | boolean | null> }[] = [];
    const cache = new SpeechCache(m => { sent.push(m); return true; }, () => 'http://synthetic/tts');
    const clock = { now: () => Date.now(), setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
    const time = new Timeline(clock), state = { typing: false, visible: false, reaction: 'norm' as const };
    let position = 0;
    const voice = new VoiceDirector(cache, { startSpeech: async () => ({ get positionMs() { return position; }, ended: false, failed: false, stop: () => {} }), play: async () => {} }, clock.now,
      (kind, fields) => records.push({ kind, fields }), (text, ms) => host.speechTiming(text, ms), clock, NATIVE_VOICE_DEADLINE_MS);
    let finishes = 0;
    const host = new HostTrack(time, c => { if (c.k === 'host') voice.start(1, c); if (c.k === 'host-finish') { finishes++; voice.finish(c.forced); } }, state, () => {}, () => {});
    try {
      host.say(cue.line); await flush(); vi.advanceTimersByTime(825);
      expect(state.typing).toBe(true); expect(finishes).toBe(0);
      const request = sent.find(m => m.t === 'tts')!;
      cache.receive({ t: 'tts', id: request.id, ok: true, marks, durationMs: 800 }); await flush();
      position = 100; vi.advanceTimersByTime(100); voice.frame(cue.line.text);
      position = 800; vi.advanceTimersByTime(700); voice.frame(cue.line.text);
      expect(records.find(r => r.kind === 'voice-complete')?.fields).toMatchObject({ path: 'polly', reason: 'ended', elapsedMs: 800 });
      vi.advanceTimersByTime(NATIVE_VOICE_DEADLINE_MS + 800 - clock.now() + 1); expect(finishes).toBe(1);
    } finally { host.clear(); voice.stop(); cache.clear(); vi.useRealTimers(); }
  });

  it('allows native decoder readiness after 600ms but still cancels a stalled native line within its bounded budget', async () => {
    const h = harness(NATIVE_VOICE_DEADLINE_MS); h.voice.start(10, cue); h.ready(); await flush();
    h.clock(700); expect(h.voice.frame(cue.line.text)?.characters).toBe(0); expect(h.records).toHaveLength(0);
    h.clock(825); h.voice.finish(); expect(h.records).toHaveLength(0);
    expect(h.timing).toHaveBeenCalledWith(cue.line.text, NATIVE_VOICE_DEADLINE_MS + 800);
    h.audio(100); h.clock(950); h.voice.frame(cue.line.text);
    expect(h.records[0]?.fields).toMatchObject({ path: 'polly', latencyMs: 850 });
    h.voice.stop(); h.cache.clear();
    const stalled = harness(NATIVE_VOICE_DEADLINE_MS); stalled.voice.start(10, cue); stalled.ready(); await flush();
    stalled.clock(NATIVE_VOICE_DEADLINE_MS); stalled.voice.frame(cue.line.text);
    expect(stalled.records[0]?.fields).toMatchObject({ path: 'blips', reason: 'deadline', latencyMs: NATIVE_VOICE_DEADLINE_MS });
    stalled.voice.stop(); stalled.cache.clear();
  });

  it('uses one bounded deadline even when the host is hidden, and cancels it across pause/disposal', () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const cache = new SpeechCache(() => true, () => 'http://synthetic/tts'), report = vi.fn();
    const director = new VoiceDirector(cache, { startSpeech: async () => undefined, play: async () => {} }, Date.now, report, undefined,
      { setTimeout, clearTimeout: h => clearTimeout(h as ReturnType<typeof setTimeout>) });
    try {
      director.start(1, cue); vi.advanceTimersByTime(599); expect(report).not.toHaveBeenCalled();
      director.pause(true); vi.advanceTimersByTime(10000); expect(report).not.toHaveBeenCalled();
      director.pause(false); vi.advanceTimersByTime(1);
      expect(report).toHaveBeenCalledWith('voice-line', expect.objectContaining({ path: 'blips', latencyMs: 600 }));
      director.stop(); cache.clear(); expect(vi.getTimerCount()).toBe(0);
    } finally { director.stop(); cache.clear(); vi.useRealTimers(); }
  });
  it('falls back at 600ms, ignores late readiness, and resumes the reference 34ms cadence', async () => {
    const h = harness(); h.voice.start(10, cue);
    h.clock(599); expect(h.voice.frame(cue.line.text)?.characters).toBe(0);
    h.clock(600); expect(h.voice.frame(cue.line.text)?.characters).toBe(16);
    h.ready(); await flush(); expect(h.startSpeech).not.toHaveBeenCalled();
    expect(h.records.find(r => r.kind === 'voice-line')?.fields).toMatchObject({ path: 'blips', reason: 'deadline', latencyMs: 600 });
    h.voice.stop();
  });
  it('falls back immediately on ok:false and blips every four visible characters', async () => {
    const h = harness(); h.voice.start(10, cue); h.ready(false); await flush();
    h.clock(68); expect(h.voice.frame(cue.line.text)?.characters).toBe(4); expect(h.blip).toHaveBeenCalledTimes(1);
    h.clock(100); h.voice.frame(cue.line.text); expect(h.blip).toHaveBeenCalledTimes(1);
    h.clock(136); h.voice.frame(cue.line.text); expect(h.blip).toHaveBeenCalledTimes(2);
    expect(h.records[0]?.fields).toMatchObject({ path: 'blips', reason: 'tts-failed', latencyMs: 0 });
  });
  it('requires actual playback within the deadline, then samples words and jaw from media time', async () => {
    const h = harness(); h.voice.start(10, cue); h.ready(); await flush();
    h.clock(200); expect(h.voice.frame(cue.line.text)?.characters).toBe(0); // Loaded is not playing.
    h.audio(150); h.clock(220); expect(h.voice.frame(cue.line.text)).toEqual({ characters: 1, target: 1, talking: true });
    expect(h.timing).toHaveBeenCalledWith(cue.line.text, 650);
    h.clock(500); h.audio(250); expect(h.voice.frame(cue.line.text)?.characters).toBe(10);
    h.voice.finish(); expect(h.voice.frame(cue.line.text)?.talking).toBe(true);
    h.end(); expect(h.voice.frame(cue.line.text)?.talking).toBe(false); expect(h.stop).toHaveBeenCalledTimes(1);
    expect(h.blip).not.toHaveBeenCalled();
  });
  it('cancels a loaded but stalled player at the deadline', async () => {
    const h = harness(); h.voice.start(10, cue); h.ready(); await flush();
    h.clock(600); h.voice.frame(cue.line.text); expect(h.stop).toHaveBeenCalledTimes(1);
    expect(h.records[0]?.fields).toMatchObject({ path: 'blips', reason: 'deadline' });
  });
  it('freezes latency while paused and uses blips for Voice off, silence for Sound off', async () => {
    const h = harness(); h.voice.start(10, cue); h.clock(200); h.voice.pause(true);
    h.clock(5000); expect(h.voice.frame(cue.line.text)?.characters).toBe(0);
    h.voice.pause(false); h.clock(5400); h.voice.frame(cue.line.text);
    expect(h.records[0]?.fields.latencyMs).toBe(600);
    h.voice.settings(true, false); h.voice.start(11, cue); h.clock(5468); h.voice.frame(cue.line.text); expect(h.blip).toHaveBeenCalledTimes(1);
    h.voice.settings(false, true); h.voice.start(12, cue); h.clock(5536); h.voice.frame(cue.line.text); expect(h.blip).toHaveBeenCalledTimes(1);
    h.voice.stop(); h.cache.clear();
  });
  it('stops speech on error or scene disposal and reports each routed line once', async () => {
    const h = harness(); h.voice.start(10, cue); h.ready(); await flush(); h.audio(10); h.clock(100); h.voice.frame(cue.line.text);
    h.fail(); h.voice.frame(cue.line.text); h.voice.stop('disposed');
    expect(h.records.filter(r => r.kind === 'voice-line')).toHaveLength(1);
    expect(h.records.find(r => r.kind === 'voice-fallback')?.fields.reason).toBe('playback-error');
    expect(h.stop).toHaveBeenCalled();
  });
});
