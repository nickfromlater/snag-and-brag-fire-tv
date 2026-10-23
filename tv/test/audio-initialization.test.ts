import { afterEach, describe, expect, it, vi } from 'vitest';

const players = vi.hoisted(() => ({ instances: [] as { release(): void; disposed: boolean }[], automatic: false }));
vi.mock('@amazon-devices/react-native-kepler', () => ({ Platform: { OS: 'web' } }));
vi.mock('../src/stage/platform', () => ({
  AudioPlayer: class {
    disposed = false; paused = true; currentTime = 0; autoplay = false; volume = 1; src = ''; loop = false;
    release!: () => void;
    private initialized = new Promise<void>(resolve => { this.release = resolve; });
    constructor() { players.instances.push(this); }
    initialize() { if (players.automatic) this.release(); return this.initialized; }
    async deinitialize() { this.disposed = true; }
    addEventListener() {}
    pause() { this.paused = true; }
    play() { this.paused = false; }
    load() {}
  },
}));
import { AudioEngine } from '../src/stage/audio';
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
afterEach(() => { vi.useRealTimers(); players.instances.length = 0; players.automatic = false; });
describe('slow native audio initialization', () => {
  it('shares a pool while retriggers arrive before initialization completes', async () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    const engine = new AudioEngine(() => {}), first = engine.play('mash');
    vi.setSystemTime(50); // performance time advances explicitly below.
    vi.advanceTimersByTime(50);
    const second = engine.play('mash');
    expect(players.instances).toHaveLength(1);
    players.instances[0]!.release(); await flush();
    expect(players.instances).toHaveLength(2);
    players.automatic = true; players.instances[1]!.release(); await Promise.all([first, second]);
    expect(players.instances).toHaveLength(engine.policy.max);
    await engine.dispose(); expect(players.instances.every(p => p.disposed)).toBe(true);
  });
  it('releases a player whose initialization finishes after the scene is disposed', async () => {
    const engine = new AudioEngine(() => {}), pending = engine.play('slam');
    await engine.dispose(); players.instances[0]!.release(); await pending;
    expect(players.instances).toHaveLength(1);
    expect(players.instances[0]!.disposed).toBe(true);
    expect(engine.policy.active.size).toBe(0);
  });
  it('bounds native instances across different effects and repeated preloads', async () => {
    players.automatic = true;
    const engine = new AudioEngine(() => {});
    await Promise.all([engine.preload(), engine.mood('off'), engine.preload()]);
    for (const effect of ['boom', 'thump', 'riser', 'ko', 'reveal', 'scan', 'whoosh', 'horn', 'shutter', 'mtick'] as const) await engine.play(effect);
    await engine.preload();
    expect(players.instances).toHaveLength(engine.policy.max + 7);
    await engine.dispose(); expect(players.instances.every(p => p.disposed)).toBe(true);
  });
});
