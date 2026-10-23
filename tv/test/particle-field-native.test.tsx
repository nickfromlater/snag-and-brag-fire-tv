import React, { Profiler } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
const clock = vi.hoisted(() => ({ paused: false, callbacks: new Set<(dt: number) => void>(), scene: 'hunt' }));
// Production keeps native particles off everywhere; these tests exercise the drawing machinery itself.
vi.mock('../src/stage/native-effects-policy', () => ({ suppressNativeFinaleParticles: (scene: string) => scene === 'champ' }));
vi.mock('../src/stage/platform', () => ({ Svg: 'svg', Path: 'path' }));
vi.mock('../src/stage/context', () => ({ resolveAnchor: () => ({ x: 640, y: 300 }), useTvView: () => ({ scene: clock.scene }) }));
vi.mock('../src/stage/glyphs', () => ({ glyphCache: { get: () => ({ d: 'M1 2L11 17Z', width: 11, baseline: 17 }) } }));
vi.mock('../src/stage/frame-clock', () => ({ frameClock: { get paused() { return clock.paused; }, subscribe: (fn: (dt: number) => void) => { clock.callbacks.add(fn); return () => clock.callbacks.delete(fn); } } }));
import { ParticleField } from '../src/stage/particle-field.native';
import { particleEngine } from '../src/stage/particles';
import { AudioReadyContext } from '../src/stage/audio-ready';
afterEach(() => { particleEngine.clear(); clock.paused = false; clock.scene = 'hunt'; vi.useRealTimers(); });

it('updates real SVG props, stays idle without particles and releases every subscription on unmount', () => {
  vi.useFakeTimers(); particleEngine.clear(); let commits = 0;
  let root: ReturnType<typeof create>;
  act(() => { root = create(<AudioReadyContext.Provider value={true}><Profiler id="particles" onRender={() => commits++}><ParticleField/></Profiler></AudioReadyContext.Provider>); });
  try {
    act(() => { vi.advanceTimersByTime(0); }); const idle = commits;
    act(() => { for (let i = 0; i < 10; i++) for (const fn of clock.callbacks) fn(1 / 30); });
    expect(commits).toBe(idle);
    act(() => { particleEngine.add({ kind: 'rect', x: 300, y: 200, vx: 30, life: 1 }); vi.advanceTimersByTime(0); });
    const first = root!.root.findByType('path').props.d;
    act(() => { for (const fn of clock.callbacks) fn(1 / 30); });
    expect(root!.root.findByType('path').props.d).not.toBe(first);
    expect(root!.root.findByType('path').props.animatedProps).toBeUndefined();
    act(() => particleEngine.clear());
  } finally { act(() => root!.unmount()); }
  expect(clock.callbacks.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
});

it('keeps a dense burst within the native drawing budget', () => {
  vi.useFakeTimers(); particleEngine.clear();
  for (let i = 0; i < 200; i++) particleEngine.add({ kind: 'rect', x: i * 10, life: 1 });
  let root: ReturnType<typeof create>;
  act(() => { root = create(<AudioReadyContext.Provider value={true}><ParticleField/></AudioReadyContext.Provider>); });
  try {
    act(() => { vi.advanceTimersByTime(0); });
    const paths = root!.root.findAllByType('path');
    expect(paths.reduce((count, p) => count + (p.props.d.match(/Z/g)?.length ?? 0), 0)).toBe(120);
    expect(paths.every(p => typeof p.props.fill === 'string' && typeof p.props.stroke === 'string')).toBe(true);
  } finally { act(() => root!.unmount()); }
});

// This is a temporary cutoff, not a new celebration design.
it('disables the native finale layer and releases its running clock subscription', () => {
  vi.useFakeTimers(); let root: ReturnType<typeof create>;
  act(() => { root = create(<AudioReadyContext.Provider value={true}><ParticleField/></AudioReadyContext.Provider>); });
  try {
    expect(clock.callbacks.size).toBe(1);
    clock.scene = 'champ';
    act(() => root!.update(<AudioReadyContext.Provider value={true}><ParticleField/></AudioReadyContext.Provider>));
    expect(root!.root.findAllByType('svg')).toHaveLength(0);
    expect(clock.callbacks.size).toBe(0);
    clock.scene = 'hunt';
    act(() => root!.update(<AudioReadyContext.Provider value={true}><ParticleField/></AudioReadyContext.Provider>));
    expect(clock.callbacks.size).toBe(1);
  } finally { act(() => root!.unmount()); }
});
