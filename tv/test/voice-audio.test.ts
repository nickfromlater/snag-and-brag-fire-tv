import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ players: [] as FakePlayer[] }));
interface FakePlayer { src: string; loop: boolean; volume: number; paused: boolean; disposed: boolean; currentTime: number; error: { code: number; message: string } | null; emit(k: string): void }
vi.mock('@amazon-devices/react-native-kepler', () => ({ Platform: { OS: 'web' } }));
vi.mock('../src/stage/platform', () => ({ AudioPlayer: class implements FakePlayer {
  src = ''; loop = false; volume = 1; paused = true; disposed = false; currentTime = 0; error = null;
  private listeners = new Map<string, (() => void)[]>();
  constructor() { fake.players.push(this); }
  async initialize() {} async deinitialize() { this.disposed = true; }
  pause() { this.paused = true; } play() { this.paused = false; } load() { this.currentTime = 0; }
  addEventListener(k: string, fn: () => void) { this.listeners.set(k, [...(this.listeners.get(k) ?? []), fn]); }
  emit(k: string) { this.listeners.get(k)?.forEach(fn => fn()); }
} }));
import { AudioEngine, VOICE_DUCK_GAIN } from '../src/stage/audio';
afterEach(() => { fake.players.length = 0; vi.useRealTimers(); });
describe('Polly voice bus', () => {
  it('ducks both music crossfade players by 6dB, restores gain, and leaves effects at unity', async () => {
    vi.useFakeTimers(); const engine = new AudioEngine(() => {}); await engine.preload();
    await engine.mood('lobby'); vi.advanceTimersByTime(600);
    const music = fake.players.filter(p => p.loop), speech = await engine.startSpeech('http://synthetic/tts/one');
    expect(music.some(p => p.volume > 0)).toBe(true);
    expect(Math.max(...music.map(p => p.volume))).toBeCloseTo(engine.masterGain * VOICE_DUCK_GAIN);
    await engine.play('mash'); const effect = fake.players.find(p => !p.paused && !p.loop && p.src !== 'http://synthetic/tts/one')!;
    expect(effect.volume).toBe(engine.masterGain);
    speech!.stop(); expect(Math.max(...music.map(p => p.volume))).toBeCloseTo(engine.masterGain);
    await engine.dispose();
  });
  it('uses one initialized voice player across lines and handles pause, mute, errors and disposal', async () => {
    vi.useFakeTimers(); const report = vi.fn(), engine = new AudioEngine(report); await engine.preload();
    const first = await engine.startSpeech('http://synthetic/tts/one');
    const player = fake.players.find(p => p.src === 'http://synthetic/tts/one')!;
    player.currentTime = .25; expect(first!.positionMs).toBe(250);
    engine.pause(true); expect(player.paused).toBe(true); engine.pause(false); expect(player.paused).toBe(false);
    const next = await engine.startSpeech('http://synthetic/tts/two'); first!.stop(); expect(player.paused).toBe(false);
    player.error = { code: 4, message: 'http://synthetic/tts/two?k=private-key' }; player.emit('error'); expect(next!.failed).toBe(true);
    expect(JSON.stringify(report.mock.calls)).not.toContain('private-key');
    engine.settings(false, true); expect(player.paused).toBe(true); expect(await engine.startSpeech('http://synthetic/tts/three')).toBeUndefined();
    expect(fake.players).toHaveLength(engine.policy.max + 7);
    await engine.dispose(); expect(fake.players.every(p => p.disposed)).toBe(true);
  });
});
