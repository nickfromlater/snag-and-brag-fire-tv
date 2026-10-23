import { afterEach, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ players: [] as { sources: string[]; currentTime: number; position: number; reads: number; paused: boolean; emit(k: string): void }[], sources: [] as unknown[], buffers: [] as { appends: number; offsets: number[]; ends: number[] }[] }));
vi.mock('@amazon-devices/react-native-kepler', () => ({ Platform: { OS: 'kepler' } }));
vi.mock('../src/stage/platform', () => {
  type Listener = () => void;
  class Events { private readonly map = new Map<string, Listener[]>();
    addEventListener(k: string, fn: Listener) { this.map.set(k, [...(this.map.get(k) ?? []), fn]); }
    removeEventListener(k: string, fn: Listener) { this.map.set(k, (this.map.get(k) ?? []).filter(f => f !== fn)); }
    emit(k: string) { [...(this.map.get(k) ?? [])].forEach(fn => fn()); } }
  class FakeBuffer extends Events {
    timestampOffset = 0; updating = false; appends = 0; offsets: number[] = []; ends: number[] = [];
    buffered = { get length() { return 1; }, start: () => 0, end: () => this.ends.at(-1) ?? 0 };
    constructor() { super(); fake.buffers.push(this); }
    appendBuffer() { this.appends++; this.offsets.push(this.timestampOffset); this.ends.push(this.timestampOffset + 2); setTimeout(() => this.emit('updateend'), 0); }
    remove() { setTimeout(() => this.emit('updateend'), 0); }
  }
  class FakeSource extends Events { constructor() { super(); fake.sources.push(this); } addSourceBuffer() { return new FakeBuffer(); } }
  class FakePlayer extends Events {
    sources: string[] = []; position = 0; reads = 0; paused = true; volume = 1; loop = false; autoplay = false;
    get currentTime() { this.reads++; return this.position; } set currentTime(value: number) { this.position = value; }
    constructor() { super(); fake.players.push(this); }
    set src(value: string) { this.sources.push(value); if (value.startsWith('blob:')) setTimeout(() => (fake.sources.at(-1) as FakeSource).emit('sourceopen'), 0); }
    get src() { return this.sources.at(-1) ?? ''; }
    async initialize() {} async deinitialize() {} pause() { this.paused = true; } play() { this.paused = false; } load() {}
  }
  return { AudioPlayer: FakePlayer, MediaSource: FakeSource };
});
import { AudioEngine, STREAM_CONFIRM_MS } from '../src/stage/audio';

afterEach(() => { vi.useRealTimers(); fake.players.length = 0; fake.sources.length = 0; fake.buffers.length = 0; vi.restoreAllMocks(); });
async function session() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:speech'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const engine = new AudioEngine(() => {});
  const ready = engine.preload(); await vi.advanceTimersByTimeAsync(1000); await ready; await vi.advanceTimersByTimeAsync(5);
  const voice = fake.players.filter(p => p.sources.includes('blob:speech'));
  expect(voice).toHaveLength(1);
  return { engine, voice: voice[0]! };
}
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(2);
async function line(engine: AudioEngine, uri: string, byte: number) {
  const pending = engine.startSpeech(uri, new Uint8Array([byte]).buffer); await vi.advanceTimersByTimeAsync(1); return (await pending)!;
}
it('attaches one voice MediaSource per session; each line is a wall clock anchored on playing, with one confirming read', async () => {
  const { engine, voice } = await session();
  expect(fake.sources).toHaveLength(1); expect(fake.buffers).toHaveLength(1);
  const first = await line(engine, 'tts:1', 1);
  expect(voice.paused).toBe(false); expect(voice.position).toBe(0);
  const reads = voice.reads;
  // Until playback is confirmed the line reports no progress (the voice deadline still applies).
  expect(first.positionMs).toBe(0); expect(first.ended).toBe(false);
  voice.emit('playing'); await vi.advanceTimersByTimeAsync(300);
  near(first.positionMs, 260); // anchored 40 ms late on purpose
  voice.position = .62; await vi.advanceTimersByTimeAsync(STREAM_CONFIRM_MS - 300);
  near(first.positionMs, 580); // re-anchored on the one read
  for (let i = 0; i < 100; i++) void first.positionMs, first.ended; // per-frame reads cost nothing native
  await vi.advanceTimersByTimeAsync(1400); expect(first.ended).toBe(false);
  await vi.advanceTimersByTimeAsync(100); expect(first.ended).toBe(true); expect(first.positionMs).toBe(2000);
  expect(voice.reads - reads).toBe(1);
  first.stop(); expect(voice.paused).toBe(true);
  const second = await line(engine, 'tts:2', 2);
  // Second line starts one second after the first ends on the shared timeline.
  expect(fake.buffers[0]!.offsets).toEqual([0, 3]); expect(voice.position).toBe(3);
  expect(voice.sources).toEqual(['blob:speech']); expect(fake.buffers[0]!.appends).toBe(2);
  second.stop(); await engine.dispose();
});
it('freezes a line while the engine is paused and resumes it without a native read', async () => {
  const { engine, voice } = await session();
  const first = await line(engine, 'tts:1', 1);
  voice.emit('playing'); voice.position = .5; await vi.advanceTimersByTimeAsync(STREAM_CONFIRM_MS);
  const held = first.positionMs; near(held, 460);
  engine.pause(true); const reads = voice.reads;
  await vi.advanceTimersByTimeAsync(5000); expect(first.positionMs).toBe(held); expect(first.ended).toBe(false);
  engine.pause(false); voice.emit('playing');
  near(first.positionMs, held - 100); // restarts slightly behind the audio, never ahead
  await vi.advanceTimersByTimeAsync(500); near(first.positionMs, held + 400);
  expect(voice.reads).toBe(reads);
  first.stop(); await engine.dispose();
});
it('fails a line to blips when playing fired but the position never leaves the start', async () => {
  const { engine, voice } = await session();
  const first = await line(engine, 'tts:1', 1);
  voice.emit('playing'); await vi.advanceTimersByTimeAsync(STREAM_CONFIRM_MS);
  expect(first.failed).toBe(true);
  first.stop(); await engine.dispose();
});
it('anchors on the read alone when the platform never sends playing', async () => {
  const { engine, voice } = await session();
  const first = await line(engine, 'tts:1', 1);
  voice.position = .55; await vi.advanceTimersByTimeAsync(STREAM_CONFIRM_MS);
  expect(first.failed).toBe(false); near(first.positionMs, 510);
  first.stop(); await engine.dispose();
});
