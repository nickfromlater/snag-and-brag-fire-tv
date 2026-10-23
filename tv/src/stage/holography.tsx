import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, View } from '@amazon-devices/react-native-kepler';
import type { FindView, MotionFrame } from '@snag/shared';
import { OBJI } from '@snag/shared';
import { animationPose, transformMatrix } from './motion';
import { useSession, useTvView } from './context';
import { useReducedMotion } from './motion-settings';
import { DecorativeClock } from './decorative-clock';
import { FindSticker, GooglyEyes } from './primitives';
import type { BoxProps } from './primitives';
import { Svg, Defs, Mask, SvgImage, LinearGradient, Stop, Rect, Reanimated, useSharedValue, useAnimatedStyle, withTiming, withSequence, withRepeat, cancelAnimation, NativeEasing } from './platform';
import { bitmap, bitmapInfo } from './assets';
import { layers } from './effect-layout';
import { idleLoopsOff } from './motion-settings';

/** Follow authoritative live values using native transforms, with stable bounds. */
export function Follow({ children, translateX = 0, translateY = 0, scale = 1, width, height }: {
  children: React.ReactNode; translateX?: number; translateY?: number; scale?: number; width: number; height: number;
}): React.ReactElement {
  const session = useSession(), view = useTvView();
  if (session.capture && view.paused && Platform.OS !== 'web') return <View style={{ width, height, transform: [{ matrix: transformMatrix(translateX, translateY, scale, scale, 0) }] }}>{children}</View>;
  const props = { children, translateX, translateY, scale, width, height };
  return Platform.OS === 'web' ? <WebFollow {...props} /> : <NativeFollow {...props} />;
}
function NativeFollow({ children, translateX = 0, translateY = 0, scale = 1, width, height }: Parameters<typeof Follow>[0]): React.ReactElement {
  const reduced = useReducedMotion(), session = useSession();
  const progress = useSharedValue(1);
  const goal = useRef({ x: translateX, y: translateY, s: reduced ? 1 : scale });
  const { from, to } = useMemo(() => ({ from: goal.current, to: { x: translateX, y: translateY, s: reduced ? 1 : scale } }), [translateX, translateY, scale, reduced]);
  useEffect(() => {
    const duration = 50 / ((session.clock as { speed?: number }).speed ?? 1);
    goal.current = to; progress.value = 0;
    progress.value = withTiming(1, { duration, easing: NativeEasing.linear });
    return () => cancelAnimation(progress);
  }, [translateX, translateY, scale, reduced]);
  const style = useAnimatedStyle(() => {
    const p = progress.value, s = from.s + (to.s - from.s) * p;
    return { transform: [{ matrix: transformMatrix(from.x + (to.x - from.x) * p, from.y + (to.y - from.y) * p, s, s, 0) }] };
  });
  return <Reanimated.View collapsable={false} style={[{ width, height }, style]}>{children}</Reanimated.View>;
}
function WebFollow({ children, translateX = 0, translateY = 0, scale = 1, width, height }: Parameters<typeof Follow>[0]): React.ReactElement {
  const reduced = useReducedMotion(), session = useSession();
  const x = useRef(new Animated.Value(translateX)).current, y = useRef(new Animated.Value(translateY)).current;
  const s = useRef(new Animated.Value(reduced ? 1 : scale)).current;
  useEffect(() => {
    const duration = 50 / ((session.clock as { speed?: number }).speed ?? 1);
    const animation = Animated.parallel([
      Animated.timing(x, { toValue: translateX, duration, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(y, { toValue: translateY, duration, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(s, { toValue: reduced ? 1 : scale, duration, easing: Easing.linear, useNativeDriver: true }),
    ]);
    animation.start(); return () => animation.stop();
  }, [translateX, translateY, scale, reduced]);
  return <Animated.View style={{ width, height, transform: [{ translateX: x }, { translateY: y }, { scale: s }] }}>{children}</Animated.View>;
}

/** Ambient CSS-style keyframes. The core remains the source of phase/beat timing. */
export function Loop({ children, frames, durationMs, startedAt, x = 0, y = 0, width = 120, height = 120, style }: BoxProps & {
  frames: MotionFrame[]; durationMs: number; startedAt?: number;
}): React.ReactElement {
  const session = useSession(), view = useTvView();
  if (session.capture && view.paused && Platform.OS !== 'web') {
    const elapsed = Math.max(0, session.clock.now() - (startedAt ?? view.beatAt)) % durationMs;
    const p = animationPose({ target: 'decoration', frames, durationMs, easing: 'linear', delayMs: 0, fill: 'both', iterations: 1 }, elapsed, width, height);
    return <View style={[StyleSheet.flatten([{ position: 'absolute', left: x, top: y, width, height }, style]), { opacity: p.opacity, transform: [{ matrix: transformMatrix(p.x, p.y, p.sx, p.sy, p.rotation) }] }]}>{children}</View>;
  }
  const props = { children, frames, durationMs, startedAt, x, y, width, height, style };
  return Platform.OS === 'web' ? <WebLoop {...props} /> : <NativeLoop {...props} />;
}
function NativeLoop({ children, frames, durationMs, startedAt, x = 0, y = 0, width = 120, height = 120, style }: Parameters<typeof Loop>[0]): React.ReactElement {
  const session = useSession(), view = useTvView(), reduced = useReducedMotion();
  const clock = useRef(new DecorativeClock(startedAt ?? view.beatAt)).current;
  const progress = useSharedValue(0), recipe = JSON.stringify(frames);
  const poses = useMemo(() => Array.from({ length: 73 }, (_, i) => animationPose({ target: 'decoration', frames, durationMs, easing: 'linear', delayMs: 0, fill: 'both', iterations: 1 }, durationMs * i / 72, width, height)), [recipe, durationMs, width, height]);
  useEffect(() => {
    const elapsed = clock.elapsed(session.clock.now(), view.paused), from = reduced ? .5 : elapsed % durationMs / durationMs;
    const speed = (session.clock as { speed?: number }).speed ?? 1;
    cancelAnimation(progress); progress.value = from;
    if (!view.paused && !reduced && !idleLoopsOff()) progress.value = withSequence(
      withTiming(1, { duration: durationMs * (1 - from) / speed, easing: NativeEasing.linear }),
      withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: durationMs / speed, easing: NativeEasing.linear })), -1, false),
    );
    return () => cancelAnimation(progress);
  }, [view.paused, reduced, durationMs, recipe]);
  const animated = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, progress.value)) * 72, i = Math.min(71, Math.floor(p)), f = p - i, a = poses[i]!, b = poses[i + 1]!;
    return { opacity: a.opacity + (b.opacity - a.opacity) * f, transform: [{ matrix: transformMatrix(
      a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.sx + (b.sx - a.sx) * f, a.sy + (b.sy - a.sy) * f, a.rotation + (b.rotation - a.rotation) * f,
    ) }] };
  });
  return <Reanimated.View collapsable={false} style={[StyleSheet.flatten([{ position: 'absolute', left: x, top: y, width, height }, style]), animated]}>{children}</Reanimated.View>;
}
function WebLoop({ children, frames, durationMs, startedAt, x = 0, y = 0, width = 120, height = 120, style }: Parameters<typeof Loop>[0]): React.ReactElement {
  const session = useSession(), view = useTvView(), reduced = useReducedMotion();
  const clock = useRef(new DecorativeClock(startedAt ?? view.beatAt)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const recipe = JSON.stringify(frames);
  const poses = useMemo(() => Array.from({ length: 73 }, (_, i) => animationPose({
    target: 'decoration', frames, durationMs, easing: 'linear', delayMs: 0, fill: 'both', iterations: 1,
  }, durationMs * i / 72, width, height)), [recipe, durationMs, width, height]);
  useEffect(() => {
    const elapsed = clock.elapsed(session.clock.now(), view.paused), from = elapsed % durationMs / durationMs;
    progress.setValue(reduced ? .5 : from);
    if (view.paused || reduced || idleLoopsOff()) return;
    const speed = (session.clock as { speed?: number }).speed ?? 1;
    const timing = (ms: number) => Animated.timing(progress, { toValue: 1, duration: ms / speed, easing: Easing.linear, useNativeDriver: true });
    let active = true, animation: Animated.CompositeAnimation = timing(durationMs * (1 - from));
    animation.start(({ finished }) => {
      if (!finished || !active) return;
      progress.setValue(0); animation = Animated.loop(timing(durationMs)); animation.start();
    });
    return () => { active = false; animation.stop(); progress.stopAnimation(); };
  }, [view.paused, reduced, durationMs]);
  const range = poses.map((_, i) => i / 72);
  const field = (key: 'x' | 'y' | 'sx' | 'sy' | 'rotation' | 'opacity') => progress.interpolate({
    inputRange: range, outputRange: poses.map(p => key === 'rotation' ? p[key] + 'deg' : p[key]) as number[] | string[], extrapolate: 'clamp',
  });
  return <Animated.View style={[{ position: 'absolute', left: x, top: y, width, height, opacity: field('opacity'), transform: [
    { translateX: field('x') }, { translateY: field('y') }, { scaleX: field('sx') }, { scaleY: field('sy') }, { rotate: field('rotation') },
  ] }, style]}>{children}</Animated.View>;
}

let sheenSerial = 0;
const spectrum = ['#FF4FA0', '#3FE0D0', '#FFD43B', '#8B5CFF', '#FFF8EC'];

/** Subtle rainbow finish for a card; keeps the type legible under the sheen. */
export function Sheen({ width, height, radius = 28 }: { width: number; height: number; radius?: number }): React.ReactElement {
  const id = useRef('surface-sheen-' + (++sheenSerial)).current;
  return <Loop width={width} height={height} style={{ zIndex: layers.backdrop }} durationMs={3200} frames={[{ opacity: .08 }, { opacity: .24 }, { opacity: .08 }]}>
    <Svg width={width} height={height}><Defs><LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="65%">
      {spectrum.map((color, i) => <Stop key={color} offset={i / 4} stopColor={color} stopOpacity={i === 4 ? 0 : .8} />)}
    </LinearGradient></Defs><Rect width={width} height={height} rx={radius} fill={'url(#' + id + ')'} /></Svg>
  </Loop>;
}

/** Luminance masks keep the ink dark and eyes readable. Two native-opacity layers
 * crossfade rainbow bands across either the original art or the photo's die cut. */
export function HolographicSticker({ find, size, target, active = true }: {
  find: FindView; size: number; target?: string; active?: boolean;
}): React.ReactElement {
  const view = useTvView(), session = useSession();
  const id = useRef('sheen-' + (++sheenSerial)).current;
  const maskAsset = find.photoId ? 'photos/mask-384' : 'stickers/' + find.obj + '-384';
  const bounds = bitmapInfo[maskAsset]?.logicalBounds ?? { x: -40, y: -45, width: 200, height: 225 };
  const factor = size / 120;
  const eyes = find.eyes ?? (find.obj ? OBJI[find.obj]?.eyes : undefined);
  const nativeHue = Platform.OS !== 'web' && active && find.obj && bitmapInfo['holograms/' + find.obj + '-3'];
  const crown = view.motion['show.crown']?.at(-1), object = view.motion['champ.object']?.at(-1);
  const hueAt = session.capturePose === 'hologram' ? session.clock.now() - 1100 : view.content.k === 'show' && crown ? crown.startedAt - 250 : view.content.k === 'champ' && object ? object.startedAt : view.beatAt;
  return <View style={{ zIndex: layers.backdrop, width: size, height: size, overflow: 'visible' }}>
    <FindSticker find={find} size={size} target={target} eyes={false} />
    {nativeHue && [0, 1, 2, 3].map(layer => <Loop key={'hue-' + layer} x={bounds.x * factor} y={bounds.y * factor} width={bounds.width * factor} height={bounds.height * factor} startedAt={hueAt} durationMs={2200}
      frames={[0, 1, 2, 3, 4].map(n => ({ opacity: n % 4 === layer ? 1 : 0, offset: n / 4 }))}><Image source={bitmap('holograms/' + find.obj + '-' + layer)} style={{ width: bounds.width * factor, height: bounds.height * factor }}/></Loop>)}
    {active && [0, 1].map(layer => <Loop key={layer} x={bounds.x * factor} y={bounds.y * factor} width={bounds.width * factor} height={bounds.height * factor}
      style={{ zIndex: 1 }} durationMs={3200} frames={layer ? [{ opacity: .48 }, { opacity: .06 }, { opacity: .48 }] : [{ opacity: .06 }, { opacity: .48 }, { opacity: .06 }]}>
      <Svg width={bounds.width * factor} height={bounds.height * factor} viewBox={[bounds.x, bounds.y, bounds.width, bounds.height].join(' ')}>
        <Defs>
          <Mask id={id + '-mask-' + layer} x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} maskUnits="userSpaceOnUse">
            <SvgImage href={bitmap(maskAsset)} x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} />
          </Mask>
          <LinearGradient id={id + '-rainbow-' + layer} x1={layer ? '100%' : '0%'} y1="0%" x2={layer ? '0%' : '100%'} y2="65%">
            {spectrum.map((color, i) => <Stop key={color} offset={i / 4} stopColor={color} stopOpacity={i === 4 ? .08 : .85} />)}
          </LinearGradient>
        </Defs>
        <Rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill={'url(#' + id + '-rainbow-' + layer + ')'} mask={'url(#' + id + '-mask-' + layer + ')'} />
      </Svg>
    </Loop>)}
    {eyes && <View style={{ position: 'absolute', width: size, height: size, zIndex: 2 }}><GooglyEyes eyes={eyes} size={size} target={target} /></View>}
  </View>;
}
