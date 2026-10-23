import React from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ tick: undefined as undefined | ((dt: number, time: number) => void), mutate: vi.fn(), loops: 0 }));
vi.mock('@amazon-devices/react-native-kepler', async () => {
  const React = await import('react');
  const View = React.forwardRef((props: { children?: React.ReactNode }, ref) => React.createElement('view', { ref }, props.children));
  class Value { constructor(public v: number) {} interpolate() { return this; } }
  const loop = () => ({ start() { state.loops++; }, stop() {} });
  return { View, Image: View, Text: View, Platform: { OS: 'kepler' }, Easing: { linear: (x: number) => x },
    Animated: { View, Value, loop, timing: () => ({}) } };
});
vi.mock('../src/stage/platform', async () => {
  const React = await import('react');
  const { View } = await import('@amazon-devices/react-native-kepler');
  return { Reanimated: { View }, useSharedValue: (value: unknown) => React.useRef({ value }).current,
    useAnimatedStyle: (fn: () => unknown) => fn(), withTiming: (value: number) => value, withRepeat: (value: number) => value,
    cancelAnimation() {}, NativeEasing: { linear: (x: number) => x } };
});
vi.mock('../src/stage/mutate', () => ({ mutate: state.mutate }));
vi.mock('../src/stage/assets', () => ({ bitmap: (id: string) => id }));
vi.mock('../src/stage/primitives', async () => {
  const React = await import('react');
  const plain = (props: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, props.children);
  return { Bitmap: plain, Card: plain, Label: plain, Motion: plain };
});
vi.mock('../src/stage/context', () => ({
  useTvView: () => ({ paused: false, host: { visible: true, typing: false, reaction: 'norm', line: { text: '', brow: 'norm' } } }),
  useSession: () => ({ clock: { now: () => 1000 } }),
}));
vi.mock('../src/stage/cue-player', () => ({ audioEngine: undefined, hostVoice: undefined }));
vi.mock('../src/stage/frame-clock', () => ({ frameClock: { paused: false, reducedMotion: false,
  subscribe: (fn: typeof state.tick) => { state.tick = fn; return () => { state.tick = undefined; }; } } }));
import { Host } from '../src/stage/host';
import { diag } from '../src/stage/diag';

it('animates the actual native puppet without JS native-prop commits on each idle/blink frame', () => {
  diag.loopsOn = true; // idle loops are cut on the stick (native-effects-policy); this checks their driver
  let root: ReturnType<typeof create>;
  act(() => { root = create(<Host/>); });
  try {
    for (let frame = 0; frame < 180; frame++) act(() => state.tick!(1 / 30, frame / 30));
    expect(state.mutate).not.toHaveBeenCalled();
    expect(state.loops).toBe(3);
  } finally { act(() => root!.unmount()); }
  expect(state.tick).toBeUndefined();
});
