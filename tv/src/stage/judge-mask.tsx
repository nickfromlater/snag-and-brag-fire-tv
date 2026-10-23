import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform } from '@amazon-devices/react-native-kepler';
import { Svg, Path, Rect, Defs, ClipPath, Reanimated, useSharedValue, useAnimatedProps, useAnimatedStyle, withTiming, cancelAnimation, NativeEasing } from './platform';
import { useSession, useTvView } from './context';
import { maskDrawing, maskClipHeight, MASK_METER_SETTLE_MS, MASK_HOLD_MS, MASK_FADE_MS } from './judge-mask-math';
import { TOKENS } from '@snag/shared';
import type { Animation } from '@snag/shared';
const NativeRect = Platform.OS === 'web' ? Rect : Reanimated.createAnimatedComponent(Rect);
const WebRect = Animated.createAnimatedComponent(Rect);
let serial = 0;
interface MaskProps { d: string; animation?: Animation; elapsed: number; duration: number; hold: number; paused: boolean; startedAt?: number; size: number; hex: string; id: string }
/** One merged Path, revealed by one Rect clip on one scalar clock. */
export function JudgeMask({ mask, target, hex, size }: { mask: string; target: string; hex: string; size: number }): React.ReactElement | null {
  const session = useSession(), view = useTvView(), state = view.motion[target]?.at(-1);
  const id = useRef('judge-mask-' + (++serial)).current;
  const drawing = useMemo(() => maskDrawing(mask), [mask]);
  const scan = state?.durationMs ?? 800, meterDone = scan + MASK_METER_SETTLE_MS, hold = meterDone + MASK_HOLD_MS, duration = hold + MASK_FADE_MS;
  const elapsed = state ? view.paused ? state.elapsedMs : session.clock.now() - state.startedAt : duration;
  useEffect(() => {
    if (!state || !drawing || view.paused || elapsed >= duration) return;
    session.telemetry('judge-mask', { round: view.round, target, cells: drawing.cells, bytes: 72, players: 1, ready: true });
    const speed = (session.clock as { speed?: number }).speed ?? 1;
    const timer = setTimeout(() => session.telemetry('judge-mask-hold', { round: view.round, target, cells: drawing.cells, ready: true }), Math.max(0, meterDone - elapsed) / speed);
    return () => clearTimeout(timer);
  }, [state?.startedAt, view.paused, drawing, duration]);
  if (!drawing) return null;
  const props: MaskProps = { d: drawing.d, animation: state?.animation, elapsed, duration, hold, paused: view.paused, startedAt: state?.startedAt, size, hex: session.capturePose === 'judge-mask' ? TOKENS.lime : hex, id };
  if (session.capture && view.paused && Platform.OS !== 'web') return <Svg width={size} height={size} viewBox="0 0 24 24" opacity={state ? .85 * Math.max(0, Math.min(1, (duration - elapsed) / (duration - hold))) : 0}><Defs><ClipPath id={id}><Rect width={24} height={state ? maskClipHeight(state.animation, elapsed) : 0}/></ClipPath></Defs><Path d={drawing.d} fill={props.hex} stroke={props.hex} strokeWidth={.1} clipPath={'url(#' + id + ')'}/></Svg>;
  return Platform.OS === 'web' ? <WebMask {...props}/> : <NativeMask {...props}/>;
}
function clipTable(animation: Animation | undefined, duration: number): number[] {
  return Array.from({ length: 121 }, (_, i) => animation ? maskClipHeight(animation, duration * i / 120) : 0);
}
function NativeMask({ d, animation, elapsed, duration, hold, paused, startedAt, size, hex, id }: MaskProps): React.ReactElement {
  const session = useSession(), progress = useSharedValue(1);
  const heights = useMemo(() => clipTable(animation, duration), [startedAt, duration]);
  useEffect(() => {
    cancelAnimation(progress); progress.value = Math.max(0, Math.min(1, elapsed / duration));
    if (animation && !paused && elapsed < duration) progress.value = withTiming(1, { duration: (duration - Math.max(0, elapsed)) / ((session.clock as { speed?: number }).speed ?? 1), easing: NativeEasing.linear });
    return () => cancelAnimation(progress);
  }, [startedAt, paused, duration]);
  const clip = useAnimatedProps(() => {
    const p = Math.max(0, Math.min(1, progress.value)) * 120, i = Math.min(119, Math.floor(p)), f = p - i;
    return { height: String(heights[i]! + (heights[i + 1]! - heights[i]!) * f) };
  });
  const fade = useAnimatedStyle(() => ({ opacity: !animation ? 0 : .85 * Math.max(0, Math.min(1, (duration - progress.value * duration) / (duration - hold))) }));
  return <Reanimated.View pointerEvents="none" style={[{ width: size, height: size }, fade]}><Svg width={size} height={size} viewBox="0 0 24 24">
    <Defs><ClipPath id={id}><NativeRect x={0} y={0} width={24} height="0" animatedProps={clip}/></ClipPath></Defs>
    <Path d={d} fill={hex} stroke={hex} strokeWidth={.1} clipPath={'url(#' + id + ')'}/>
  </Svg></Reanimated.View>;
}
function WebMask({ d, animation, elapsed, duration, hold, paused, startedAt, size, hex, id }: MaskProps): React.ReactElement {
  const session = useSession(), progress = useRef(new Animated.Value(1)).current;
  const heights = useMemo(() => clipTable(animation, duration), [startedAt, duration]);
  useEffect(() => {
    progress.setValue(Math.max(0, Math.min(1, elapsed / duration)));
    if (!animation || paused || elapsed >= duration) return;
    const motion = Animated.timing(progress, { toValue: 1, duration: (duration - Math.max(0, elapsed)) / ((session.clock as { speed?: number }).speed ?? 1), easing: Easing.linear, useNativeDriver: false });
    motion.start(); return () => { motion.stop(); progress.stopAnimation(); };
  }, [startedAt, paused, duration]);
  const height = useMemo(() => progress.interpolate({ inputRange: heights.map((_, i) => i / 120), outputRange: heights, extrapolate: 'clamp' }), [heights]);
  const opacity = useMemo(() => progress.interpolate({ inputRange: [0, hold / duration, 1], outputRange: [.85, .85, 0], extrapolate: 'clamp' }), [hold, duration]);
  return <Animated.View pointerEvents="none" style={{ width: size, height: size, opacity: animation ? opacity : 0 }}><Svg width={size} height={size} viewBox="0 0 24 24">
    <Defs><ClipPath id={id}><WebRect x={0} y={0} width={24} height={height}/></ClipPath></Defs>
    <Path d={d} fill={hex} stroke={hex} strokeWidth={.1} clipPath={'url(#' + id + ')'}/>
  </Svg></Animated.View>;
}
