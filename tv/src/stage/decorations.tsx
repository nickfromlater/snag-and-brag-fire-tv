import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, View } from '@amazon-devices/react-native-kepler';
import { TOKENS } from '@snag/shared';
import { Path, Svg } from './platform';
import { useSession, useTvView } from './context';
import { useReducedMotion } from './motion-settings';
import { marqueePoints } from './display-math';
import { idleLoopsOff } from './motion-settings';

const disk = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
/** Two animated drawing layers for the entire frame, never a view per bulb. */
export function MarqueeLights({ x, y, width, height, fast = false, flash = false, beatAt, active = true }: {
  x: number; y: number; width: number; height: number; fast?: boolean; flash?: boolean; beatAt: number; active?: boolean;
}): React.ReactElement {
  const session = useSession(), view = useTvView(), reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const points = useMemo(() => marqueePoints(x, y, width, height), [x, y, width, height]);
  const period = fast ? 180 : 700;
  useEffect(() => {
    const age = Math.max(0, session.clock.now() - beatAt), hold = flash ? Math.max(0, 800 - age) : 0;
    const speed = (session.clock as { speed?: number }).speed ?? 1;
    const phase = age % period / period;
    progress.setValue(hold || reduced ? -1 : phase);
    if (view.paused || reduced || !active || idleLoopsOff()) return;
    const timing = (from: number) => Animated.timing(progress, { toValue: 1, duration: period * (1 - from) / speed, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' });
    let animation: Animated.CompositeAnimation | undefined;
    const start = () => {
      progress.setValue(hold ? 0 : phase); animation = timing(hold ? 0 : phase);
      animation.start(({ finished }) => { if (finished) { progress.setValue(0); animation = Animated.loop(timing(0)); animation.start(); } });
    };
    const timer = setTimeout(start, hold / speed);
    return () => { clearTimeout(timer); animation?.stop(); progress.stopAnimation(); };
  }, [fast, flash, beatAt, view.paused, reduced, active]);
  return <View pointerEvents="none" style={{ position: 'absolute', width: 1280, height: 720 }}>
    <Svg width={1280} height={720}><Path d={points.map(p => disk(p.x, p.y, 9)).join('')} fill="#8A7424" stroke={TOKENS.ink} strokeWidth={3} /></Svg>
    {[0, 1].map(parity => {
      const selected = points.filter((_, i) => i % 2 === parity);
      const opacity = progress.interpolate({ inputRange: [-1, 0, .4999, .5, 1], outputRange: parity ? [1, 0, 0, 1, 1] : [1, 1, 1, 0, 0], extrapolate: 'clamp' });
      return <Animated.View key={parity} style={{ position: 'absolute', width: 1280, height: 720, opacity }}><Svg width={1280} height={720}>
        {[22, 18, 14, 11].map((radius, i) => <Path key={radius} d={selected.map(p => disk(p.x, p.y, radius)).join('')} fill={TOKENS.yolk} opacity={[.05, .1, .18, .27][i]} />)}
        <Path d={selected.map(p => disk(p.x, p.y, 9)).join('')} fill="#FFF6C2" stroke={TOKENS.ink} strokeWidth={3} />
      </Svg></Animated.View>;
    })}
  </View>;
}
/** Reference 115-degree, 14px light stripes; only the texture translates. */
export function ScrollingStripes({ width, height, periodMs = 800, horizontalScale = 1 }: { width: number; height: number; periodMs?: number; horizontalScale?: number }): React.ReactElement {
  const view = useTvView(), session = useSession(), reduced = useReducedMotion();
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (view.paused || reduced || idleLoopsOff()) return;
    x.setValue(0);
    const animation = Animated.loop(Animated.timing(x, { toValue: 40 / horizontalScale, duration: periodMs / ((session.clock as { speed?: number }).speed ?? 1), easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }));
    animation.start(); return () => { animation.stop(); x.stopAnimation(); };
  }, [view.paused, reduced, periodMs, horizontalScale]);
  const d = useMemo(() => {
    const stripe = 14 / Math.cos(25 * Math.PI / 180) / horizontalScale, slant = height * Math.tan(25 * Math.PI / 180) / horizontalScale;
    return Array.from({ length: Math.ceil((width + height + 120 / horizontalScale) / (stripe * 2)) }, (_, i) => {
      const left = i * stripe * 2 - height - 60 / horizontalScale;
      return `M${left} 0h${stripe}l${-slant} ${height}h${-stripe}Z`;
    }).join('');
  }, [width, height, horizontalScale]);
  return <View pointerEvents="none" style={{ width, height, overflow: 'hidden' }}><Animated.View style={{ width: width + 80 / horizontalScale, height, transform: [{ translateX: x }] }}><Svg width={width + 80 / horizontalScale} height={height}><Path d={d} fill="#FFFFFF" opacity={.22} /></Svg></Animated.View></View>;
}
