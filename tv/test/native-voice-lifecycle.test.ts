import { afterEach, describe, expect, it, vi } from 'vitest';
type TestPlayer = { disposed: boolean; src: string; paused: boolean; seeks: number; emit(k: string): void };
const state = vi.hoisted(() => ({ players: [] as TestPlayer[], attached: [] as TestPlayer[], detach: vi.fn(), hold: false, ready: undefined as (() => void) | undefined }));
vi.mock('@amazon-devices/react-native-kepler', () => ({ Platform: { OS: 'kepler' } }));
vi.mock('../src/stage/speech-source', () => ({ attachSpeechSource: (player: TestPlayer, _uri: string, ready: () => void) => { state.attached.push(player); if (state.hold) state.ready = ready; else ready(); return state.detach; } }));
vi.mock('../src/stage/platform', () => ({ AudioPlayer: class {
  disposed = false; src = ''; paused = true; private position = 0; seeks = 0; volume = 1; loop = false;
  private listeners = new Map<string, (() => void)[]>();
  get currentTime() { return this.position; } set currentTime(value: number) { this.position = value; this.seeks++; }
  constructor() { state.players.push(this); }
  async initialize() {} async deinitialize() { this.disposed = true; }
  pause() { this.paused = true; } play() { this.paused = false; } load() {}
  addEventListener(k: string, fn: () => void) { this.listeners.set(k, [...(this.listeners.get(k) ?? []), fn]); }
  emit(k: string) { this.listeners.get(k)?.forEach(fn => fn()); }
} }));
import { AudioEngine } from '../src/stage/audio';
// These cover the per-line MediaSource fallback (SPEECH_SINGLE_SOURCE=false or attach failure).
const PER_LINE = { singleSourceSpeech: false };
afterEach(() => { state.players.length = 0; state.attached.length = 0; state.detach.mockClear(); state.hold = false; state.ready = undefined; });
describe('native speech element lifecycle', () => {
  it('keeps an overdue source silent even when its native ready callback beats the delayed fallback timer', async () => {
    const report = vi.fn(), engine = new AudioEngine(report, PER_LINE); await engine.preload();
    state.hold = true; let allowed = true;
    const voice = await engine.startSpeech('http://synthetic/tts?k=late', undefined, () => allowed);
    allowed = false; state.ready!();
    expect(voice!.positionMs).toBe(0);
    // Effect voices may still be warming their first atlas seek, at volume 0, from preload.
    expect(state.players.every(p => p.paused || p.src.endsWith('/sfx-atlas.ogg') && (p as unknown as { volume: number }).volume === 0)).toBe(true);
    expect(report).not.toHaveBeenCalledWith('voice-duck', expect.objectContaining({ voice: true }));
    voice!.stop(); await engine.dispose();
  });
  it('destroys a completed MSE player before warming its replacement, with one live voice element', async () => {
    const engine = new AudioEngine(() => {}, PER_LINE); await engine.preload();
    const first = await engine.startSpeech('http://synthetic/tts?k=memory'); first!.stop();
    const second = await engine.startSpeech('http://synthetic/tts?k=memory');
    expect(state.players.filter(p => p.disposed)).toHaveLength(1);
    expect(state.players.filter(p => !p.disposed)).toHaveLength(engine.policy.max + 7);
    expect(state.detach).toHaveBeenCalledWith(false);
    second!.stop(); await engine.dispose(); expect(state.players.every(p => p.disposed)).toBe(true);
  });
  it('buffers the next clip before its cue and consumes that prepared element without a second source setup', async () => {
    const engine = new AudioEngine(() => {}, PER_LINE); await engine.preload();
    const initialized = state.players.length;
    engine.prepareSpeech('http://synthetic/tts?k=next', new Uint8Array([1,2,3]).buffer);
    for (let i = 0; i < 12; i++) await Promise.resolve();
    const prepared = state.attached.at(-1)!; prepared.emit('playing'); expect(prepared.seeks).toBe(1);
    expect(state.players.length).toBe(initialized); // Borrow the initialized idle voice bank.
    const voice = await engine.startSpeech('http://synthetic/tts?k=next', new Uint8Array([1,2,3]).buffer);
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(voice).toBeDefined(); expect(state.players.filter(p => !p.disposed)).toHaveLength(engine.policy.max + 7);
    expect(prepared.seeks).toBe(1); // Decoder warmup did the only native seek.
    voice!.stop(); await engine.dispose(); expect(state.players.every(p => p.disposed)).toBe(true);
  });
});
