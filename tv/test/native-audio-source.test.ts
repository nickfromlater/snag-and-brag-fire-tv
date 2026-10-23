import { afterEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ players: [] as NativePlayer[], blockDispose: false }));
interface NativePlayer { sources: string[]; explicitLoads: number; disposed: boolean; paused: boolean; currentTime: number; releaseDispose?: () => void }
vi.mock('@amazon-devices/react-native-kepler', () => ({ Platform: { OS: 'kepler' } }));
vi.mock('../src/stage/platform', () => ({ AudioPlayer: class implements NativePlayer {
  sources: string[] = []; explicitLoads = 0; disposed = false; paused = true;
  currentTime = 0; volume = 1; autoplay = false; loop = false;
  releaseDispose?: () => void;
  constructor() { native.players.push(this); }
  // Vega W3CMedia's URL setter already invokes its native load algorithm.
  set src(value: string) { this.sources.push(value); this.currentTime = 0; }
  get src() { return this.sources.at(-1) ?? ''; }
  async initialize() {} deinitialize() { this.disposed = true; return native.blockDispose ? new Promise<void>(resolve => { this.releaseDispose = resolve; }) : Promise.resolve(); }
  pause() { this.paused = true; } play() { this.paused = false; }
  load() { this.explicitLoads++; throw new Error('Duplicate native decoder load'); }
  addEventListener() {}
} }));
import { AudioEngine } from '../src/stage/audio';

afterEach(() => { native.players.length = 0; native.blockDispose = false; vi.useRealTimers(); });
describe('native packaged audio source lifecycle', () => {
  it('starts every decoder release before awaiting completion when JS is about to suspend', async () => {
    const engine = new AudioEngine(() => {}); await engine.preload();
    native.blockDispose = true;
    const disposed = engine.dispose();
    try { expect(native.players.every(p => p.disposed && p.paused)).toBe(true); expect(engine.dispose()).toBe(disposed); }
    finally { native.players.forEach(p => p.releaseDispose?.()); await disposed; }
  });
  it('loads the effects atlas once per voice and only seeks during play', async () => {
    const engine = new AudioEngine(() => {});
    try {
      await engine.preload();
      const effects = native.players.filter(p => p.sources.some(src => src.endsWith('/sfx-atlas.ogg')));
      expect(effects).toHaveLength(engine.policy.max);
      for (const effect of ['horn', 'whoosh', 'tick', 'buzzer', 'horn', 'mash', 'react', 'voice', 'pop', 'boom'] as const) await engine.play(effect);
      // A src assignment is a synchronous native load on Vega; play must never reassign one.
      expect(effects.every(p => p.sources.length === 1)).toBe(true);
      expect(effects.some(p => !p.paused && p.currentTime > 0)).toBe(true);
      expect(native.players.every(p => p.explicitLoads === 0)).toBe(true);
      expect(native.players.filter(p => !p.disposed)).toHaveLength(engine.policy.max + 7);
    } finally { await engine.dispose(); }
  });
  it('crossfades through the game music moods without loading any source after startup', async () => {
    vi.useFakeTimers(); const engine = new AudioEngine(() => {});
    try {
      await engine.preload();
      const music = native.players.filter(p => p.sources.some(src => src.includes('/music-')));
      expect(music).toHaveLength(6);
      for (const mood of ['lobby', 'tension', 'hunt', 'tension', 'brag', 'win'] as const) {
        await engine.mood(mood); await vi.advanceTimersByTimeAsync(10000);
        // Exactly the current track is audible; every other track is paused.
        expect(music.filter(p => !p.paused).map(p => p.sources[0])).toEqual(['/pkg/assets/raw/music-' + mood + '.ogg']);
      }
      expect(music.every(p => p.sources.length === 1)).toBe(true);
      expect(native.players.every(p => p.explicitLoads === 0)).toBe(true);
    } finally { await engine.dispose(); }
  });
});
