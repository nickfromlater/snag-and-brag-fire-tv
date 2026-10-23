import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';

const live = vi.hoisted(() => ({ scene: 0, particles: 0, host: 0, audio: 0, foreground: [] as boolean[], cacheRelease: [] as number[], session: { telemetry() {} }, view: { scene: 'lobby', backgroundMood: 'normal', paused: false }, lifecycle: new Map<string, (value: unknown) => void>() }));
vi.mock('../src/stage', async () => {
  const React = await import('react');
  const plain = (props: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, props.children);
  const tracked = (kind: 'scene' | 'particles' | 'host') => function Layer(props: { view?: { scene: string } }) {
    React.useEffect(() => { live[kind]++; return () => { live[kind]--; }; }, []);
    return React.createElement(kind, null, kind === 'scene' ? props.view?.scene : null);
  };
  const audio = (props: { children?: React.ReactNode }) => {
    React.useEffect(() => { live.audio++; return () => { live.audio--; }; }, []);
    return plain(props);
  };
  return { React, useTvView: () => live.view, useSession: () => live.session, ParticleField: tracked('particles'), Host: tracked('host'),
    AppState: { currentState: 'active', addEventListener: (name: string, fn: (value: unknown) => void) => { live.lifecycle.set(name, fn); return { remove: () => live.lifecycle.delete(name) }; } },
    Background: plain, CaptureBackground: plain, Benchmark: plain, Box: plain, CuePlayer: audio, Hud: plain,
    Label: plain, PerfHud: plain, Remote: plain, Stage: plain, StageProvider: plain, Ticker: plain, MediaTransport: plain,
    useFonts: () => [true], fonts: {}, Bitmap: plain, observeExceptions: () => () => {}, FixtureView: plain,
    EyeProbe: plain, setEyesEnabled: () => {}, Layout: plain, cueControls: undefined,
    releaseGraphicsMemory: async () => { live.cacheRelease.push(live.scene + live.particles + live.host + live.audio); } };
});
vi.mock('../src/scenes', async () => {
  const React = await import('react');
  return { SceneRegistry: (props: { view: { scene: string } }) => {
    React.useEffect(() => { live.scene++; return () => { live.scene--; }; }, []);
    return React.createElement('section', null, props.view.scene);
  } };
});
vi.mock('../src/runtime/session', () => ({ TvSession: class {
  ready = true; presentationRevision = 0; clock = { now: () => 0 }; private listener?: () => void;
  subscribe(fn: () => void) { this.listener = fn; return () => {}; }
  start() { this.listener?.(); } dispose() {} telemetry() {} foreground(active: boolean) { live.foreground.push(active); }
  getView() { return live.view; }
} }));
vi.mock('../src/config', () => ({ config: { showcase: false } }));
vi.mock('../src/stage/photo-probe', () => ({ PhotoProbe: () => null }));
vi.mock('../src/stage/frame-debug', () => ({ FrameDebugHud: () => null }));
import { App, Show } from '../src/App';

it('keeps one scene/effects/host mounted through staged startup, view updates and a new presentation', () => {
  const props = { fixture: false, probe: null, perf: false, onBenchmark() {}, onPerf() {}, onFrames() {}, frames: false, presentation: 0 };
  let root: ReactTestRenderer | undefined;
  try {
    for (let layer = 0; layer <= 7; layer++) act(() => {
      const element = <Show {...props} layer={layer}/>;
      if (root) root.update(element); else root = create(element);
    });
    for (const scene of ['lobby', 'intro', 'hunt', 'judge', 'stand', 'brag', 'show', 'champ']) {
      live.view = { ...live.view, scene };
      act(() => root!.update(<Show {...props} layer={7}/>));
      expect({ scene: live.scene, particles: live.particles, host: live.host }).toEqual({ scene: 1, particles: 1, host: 1 });
      expect(root!.root.findAllByType('section')).toHaveLength(1);
      expect(root!.root.findByType('section').children).toEqual([scene]);
    }
    act(() => root!.update(<Show {...props} presentation={1} layer={7}/>));
    expect({ scene: live.scene, particles: live.particles, host: live.host }).toEqual({ scene: 1, particles: 1, host: 1 });
  } finally { if (root) act(() => root!.unmount()); }
  expect({ scene: live.scene, particles: live.particles, host: live.host }).toEqual({ scene: 0, particles: 0, host: 0 });
});

it('releases the rendered scene, audio and particle layers in the background, then mounts one copy on return', () => {
  vi.stubGlobal('HermesInternal', {}); vi.useFakeTimers();
  live.view = { scene: 'lobby', backgroundMood: 'normal', paused: false };
  live.cacheRelease = []; live.foreground = [];
  let root: ReactTestRenderer;
  act(() => { root = create(<App/>); });
  try {
    expect(live.foreground).toEqual([true]);
    act(() => { vi.advanceTimersByTime(1100); });
    expect({ scene: live.scene, particles: live.particles, host: live.host, audio: live.audio }).toEqual({ scene: 1, particles: 1, host: 1, audio: 1 });
    act(() => live.lifecycle.get('moduleChange')!([{ module_name: 'com.snagbrag.tv.main', module_state: 'background' }]));
    expect({ scene: live.scene, particles: live.particles, host: live.host, audio: live.audio }).toEqual({ scene: 0, particles: 0, host: 0, audio: 0 });
    expect(live.cacheRelease).toEqual([4, 0]);
    act(() => live.lifecycle.get('change')!('background'));
    expect(live.cacheRelease).toEqual([4, 0]);
    act(() => live.lifecycle.get('change')!('active'));
    expect(live.foreground).toEqual([true, false, true]);
    act(() => { vi.advanceTimersByTime(1100); });
    expect({ scene: live.scene, particles: live.particles, host: live.host, audio: live.audio }).toEqual({ scene: 1, particles: 1, host: 1, audio: 1 });
  } finally { act(() => root!.unmount()); vi.unstubAllGlobals(); vi.useRealTimers(); }
  expect(live.lifecycle.size).toBe(0);
});

it('evicts retired scene images after commit and does not repeatedly clear on updates within a scene', () => {
  vi.useFakeTimers(); live.view = { scene: 'lobby', backgroundMood: 'normal', paused: false }; live.cacheRelease = [];
  const props = { fixture: false, probe: null, perf: false, onBenchmark() {}, onPerf() {}, onFrames() {}, frames: false, presentation: 0, layer: 7 };
  let root: ReactTestRenderer;
  act(() => { root = create(<Show {...props}/>); });
  try {
    act(() => { vi.advanceTimersByTime(32); }); expect(live.cacheRelease).toEqual([]);
    live.view = { ...live.view, scene: 'intro' };
    act(() => root!.update(<Show {...props}/>));
    expect(live.cacheRelease).toEqual([]);
    act(() => { vi.advanceTimersByTime(32); });
    expect(live.cacheRelease).toEqual([4]);
    act(() => root!.update(<Show {...props}/>));
    act(() => { vi.advanceTimersByTime(100); }); expect(live.cacheRelease).toEqual([4]);
  } finally { act(() => root!.unmount()); vi.useRealTimers(); }
});
