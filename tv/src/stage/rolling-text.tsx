import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, View } from '@amazon-devices/react-native-kepler';
import type { MotionState } from '@snag/shared';
import { TOKENS } from '@snag/shared';
import { G, Path, Svg, Reanimated, useAnimatedProps, useSharedValue, withTiming, cancelAnimation, NativeEasing } from './platform';
import type { SharedValue } from '@amazon-devices/react-native-reanimated';
import { useSession, useTvView } from './context';
import { glyphCache } from './glyphs';
import { StrokedText } from './primitives';
import { frameClock } from './frame-clock';
import { mutate } from './mutate';
import { rollValue } from './display-math';

const AnimatedPath = Platform.OS === 'web' ? Path : Reanimated.createAnimatedComponent(Path);
interface Props { from: number; value: number; timeline?: MotionState; size?: number; width?: number; color?: string; stroke?: number; shadow?: number }
function NativeDigit({ paths, divisor, progress, from, value, color, stroke, shadow }: {
  paths: string[]; divisor: number; progress: SharedValue<number>; from: number; value: number; color: string; stroke: number; shadow: number;
}): React.ReactElement {
  const props = useAnimatedProps(() => {
    const p = Math.max(0, Math.min(1, progress.value)), score = Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3)));
    return { d: divisor > 1 && score < divisor ? '' : paths[Math.floor(score / divisor) % 10] };
  });
  return <><AnimatedPath animatedProps={props} fill={TOKENS.ink} stroke={TOKENS.ink} strokeWidth={stroke} strokeLinejoin="round" translateY={shadow} />
    <AnimatedPath animatedProps={props} fill={TOKENS.ink} stroke={TOKENS.ink} strokeWidth={stroke} strokeLinejoin="round" /><AnimatedPath animatedProps={props} fill={color} /></>;
}
/** Cached digit outlines update on the native UI thread, with no frame-by-frame React state. */
function WebRollingText({ from, value, timeline, size = 52, width = 116, color = TOKENS.paper, stroke = 7, shadow = 5 }: Props): React.ReactElement {
  const view = useTvView(), session = useSession(), progress = useSharedValue(timeline ? 0 : 1);
  const data = useMemo(() => {
    const shapes = Array.from({ length: 10 }, (_, i) => glyphCache.get(String(i), size));
    return { shapes, paths: shapes.map(s => s.d), cell: Math.max(...shapes.map(s => s.width)), digits: Math.max(String(value).length, String(from).length) };
  }, [size, from, value]);
  const paths = useRef<unknown[][]>([]), timelineRef = useRef(timeline); timelineRef.current = timeline;
  const elapsed = () => { const t = timelineRef.current; return t ? (view.paused ? t.elapsedMs : session.clock.now() - t.startedAt) / t.durationMs : 1; };
  useEffect(() => {
    if (Platform.OS === 'web') return;
    cancelAnimation(progress); const start = Math.max(0, Math.min(1, elapsed())); progress.value = start;
    if (!view.paused && timeline?.active) progress.value = withTiming(1, { duration: timeline.durationMs * (1 - start) / ((session.clock as { speed?: number }).speed ?? 1), easing: NativeEasing.linear });
    return () => cancelAnimation(progress);
  }, [from, value, timeline?.startedAt, view.paused]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const draw = () => {
      const score = rollValue(from, value, elapsed());
      for (let i = 0; i < data.digits; i++) {
        const divisor = Math.pow(10, data.digits - i - 1), d = divisor > 1 && score < divisor ? '' : data.paths[Math.floor(score / divisor) % 10]!;
        paths.current[i]?.forEach(path => mutate(path, { d }));
      }
    };
    draw(); if (view.paused || !timeline?.active) return;
    return frameClock.subscribe(draw, 30);
  }, [from, value, timeline?.startedAt, timeline?.active, view.paused, data]);
  const shape = data.shapes[0]!, pad = stroke / 2 + 2;
  return <View style={{ width, height: size * .9, overflow: 'visible' }}><Svg width={width + pad} height={shape.height + shadow + stroke} style={{ position: 'absolute', top: size * .9 - shape.baseline }}>
    {Array.from({ length: data.digits }, (_, i) => <G key={i} x={width - (data.digits - i) * data.cell}>
      {Platform.OS === 'web' ? [0, 1, 2].map(layer => <Path key={layer} ref={node => { (paths.current[i] ??= [])[layer] = node; }} d="" fill={layer === 2 ? color : TOKENS.ink} stroke={layer === 2 ? undefined : TOKENS.ink} strokeWidth={layer === 2 ? 0 : stroke} strokeLinejoin="round" translateY={layer === 0 ? shadow : 0} />)
        : <NativeDigit paths={data.paths} divisor={Math.pow(10, data.digits - i - 1)} progress={progress} from={from} value={value} color={color} stroke={stroke} shadow={shadow} />}
    </G>)}
  </Svg></View>;
}

function NativeRollingText({ from, value, timeline, size = 52, width = 116, color = TOKENS.paper, stroke = 7, shadow = 5 }: Props): React.ReactElement {
  const view = useTvView(), session = useSession();
  const [score, setScore] = React.useState(value);
  useEffect(() => {
    const draw = () => { const elapsed = timeline ? (view.paused ? timeline.elapsedMs : session.clock.now() - timeline.startedAt) / timeline.durationMs : 1; const n = rollValue(from, value, elapsed); setScore(old => old === n ? old : n); };
    draw(); if (view.paused || !timeline?.active) return; return frameClock.subscribe(draw, 16);
  }, [from, value, timeline?.startedAt, timeline?.active, view.paused]);
  return <StrokedText text={String(score)} size={size} width={width} color={color} stroke={stroke} shadow={shadow} spacing={0} align="right"/>;
}
export function RollingText(props: Props): React.ReactElement {
  return Platform.OS === 'web' ? <WebRollingText {...props}/> : <NativeRollingText {...props}/>;
}
