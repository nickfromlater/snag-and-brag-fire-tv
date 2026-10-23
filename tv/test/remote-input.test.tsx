import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { GameHost, seededRng } from '@snag/shared';

const input = vi.hoisted(() => ({ tv: undefined as ((e: { eventType: string; eventKeyAction: number }) => void) | undefined, back: undefined as (() => boolean) | undefined, remote: vi.fn(), debug: true, game: undefined as GameHost | undefined }));
vi.mock('../src/config', () => ({ config: { get debug() { return input.debug; } } }));
vi.mock('@amazon-devices/react-native-kepler', () => ({ Platform: { OS: 'kepler' }, View: 'div', BackHandler: { addEventListener: (_event: string, fn: () => boolean) => { input.back = fn; return { remove() { input.back = undefined; } }; } } }));
vi.mock('../src/stage/platform', () => ({ useTVEventHandler: (fn: typeof input.tv) => { input.tv = fn; } }));
vi.mock('../src/stage/context', () => ({ useSession: () => ({ remote: input.remote, getView: () => input.game?.getView() ?? {} }), useTvView: () => input.game?.getView() ?? { menu: null } }));
vi.mock('../src/stage/primitives', () => ({ Card: () => null, Label: () => null, StrokedText: () => null }));
vi.mock('../src/stage/cue-player', () => ({ cueControls: undefined }));
import { Remote } from '../src/stage/remote';

afterEach(() => { input.remote.mockReset(); input.debug = true; input.game?.dispose(); input.game = undefined; });
it.each(['tv-first', 'hardware-first'])('handles a native Back press once when both SDK callbacks fire: %s', order => {
  let root: ReturnType<typeof create>;
  act(() => { root = create(<Remote frames={false} onDebug={() => {}} onPerf={() => {}} onFrames={() => {}}/>); });
  try {
    act(() => {
      if (order === 'hardware-first') input.back!();
      input.tv!({ eventType: 'back', eventKeyAction: 0 });
      input.tv!({ eventType: 'back', eventKeyAction: 1 });
      if (order === 'tv-first') input.back!();
    });
    expect(input.remote.mock.calls).toEqual([['back']]);
    act(() => input.tv!({ eventType: 'select', eventKeyAction: 0 }));
    expect(input.remote.mock.calls.at(-1)).toEqual(['select']);
  } finally { act(() => root!.unmount()); }
});

it.each(['lobby', 'live'])('opens working production settings from Menu, without studio tools: %s', phase => {
  input.debug = false;
  const game = new GameHost({ clock: { now: () => 0, setTimeout: () => 0, clearTimeout() {} }, rng: seededRng(1),
    room: { code: 'BCDF', joinUrl: 'https://example.com/?r=BCDF' }, send() {}, cue() {}, view() {} });
  input.game = game; input.remote.mockImplementation(key => game.remote(key));
  if (phase === 'live') { game.setBots(true); game.remote('select'); game.remote('down'); game.remote('select'); }
  const onDebug = vi.fn(), onPerf = vi.fn(); let root: ReturnType<typeof create>;
  act(() => { root = create(<Remote frames={false} onDebug={onDebug} onPerf={onPerf} onFrames={() => {}}/>); });
  try {
    act(() => input.tv!({ eventType: 'menu', eventKeyAction: 0 }));
    if (phase === 'live') expect(game.getView().paused).toBe(true);
    act(() => input.tv!({ eventType: 'select', eventKeyAction: 0 }));
    expect(game.getView().sound).toBe(false);
    expect(onDebug).not.toHaveBeenCalled(); expect(onPerf).not.toHaveBeenCalled();
  } finally { act(() => root!.unmount()); }
});
