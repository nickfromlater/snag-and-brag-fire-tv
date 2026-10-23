import React from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ durations: [] as number[] }));
vi.mock('@amazon-devices/react-native-kepler', () => ({
  View: 'view', Image: 'image', Easing: { linear: (x: number) => x },
  Animated: { View: 'animated-view', Image: 'animated-image',
    Value: class { interpolate() { return 0; } setValue() {} },
    timing: (_value: unknown, options: { duration: number }) => { native.durations.push(options.duration); return { start() {}, stop() {} }; } },
}));
vi.mock('../src/stage/assets', () => ({ bitmap: (id: string) => id }));
vi.mock('../src/stage/video-backdrop.native', () => ({ VideoBackdrop: (props: { mood: string }) => React.createElement('video-backdrop', props) }));
vi.mock('../src/stage/frame-clock', () => ({ frameClock: { paused: false, reducedMotion: false, subscribe: () => () => {} } }));
import { Background } from '../src/stage/background.native';

it('bounds every native background frame table to its sampled window across refreshes', () => {
  vi.useFakeTimers(); native.durations.length = 0;
  let root: ReturnType<typeof create>;
  act(() => { root = create(<Background mood="normal"/>); });
  try {
    act(() => root!.root.findAllByType('view').find(node => typeof node.props.onLayout === 'function')!.props.onLayout());
    act(() => { vi.advanceTimersByTime(6000); });
    act(() => { vi.advanceTimersByTime(6000); });
    expect(native.durations.length).toBeGreaterThanOrEqual(3);
    expect(native.durations.every(duration => duration > 0 && duration <= 8000)).toBe(true);
  } finally { act(() => root!.unmount()); vi.useRealTimers(); }
});

it('keeps one backdrop decoder for the whole game: mood and palette changes cover it, never reload it', () => {
  let root: ReturnType<typeof create>;
  act(() => { root = create(<Background mood="normal" videoActive/>); });
  try {
    const decoder = () => root!.root.findAllByType('video-backdrop' as never);
    expect(decoder()).toHaveLength(1); expect(decoder()[0]!.props.mood).toBe('normal');
    const first = decoder()[0]!;
    act(() => root!.update(<Background mood="urgent" videoActive/>));
    expect(decoder()).toHaveLength(1); expect(decoder()[0]!.props.mood).toBe('normal'); expect(decoder()[0]).toBe(first);
    expect(root!.root.findAll(node => node.props.source === 'stage/base-urgent').length).toBeGreaterThan(0);
    act(() => root!.update(<Background mood="party" palette="party" videoActive/>));
    expect(decoder()).toHaveLength(1); expect(decoder()[0]!.props.mood).toBe('normal');
    act(() => root!.update(<Background mood="normal" videoActive/>));
    expect(root!.root.findAll(node => typeof node.props.source === 'string' && node.props.source.startsWith('stage/base-'))).toHaveLength(0);
  } finally { act(() => root!.unmount()); }
});
