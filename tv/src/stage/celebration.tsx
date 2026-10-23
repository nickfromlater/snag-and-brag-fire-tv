import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from '@amazon-devices/react-native-kepler';
import { bitmap } from './assets';
import { useTvView } from './context';
import { useReducedMotion } from './motion-settings';

const LAYERS = [
  { id: 'stage/confetti-far', durationMs: 3000, opacity: .7 },
  { id: 'stage/confetti-near', durationMs: 2300, opacity: 1 },
] as const;

/** One confetti burst per payoff: two pre-rendered layers, one native-driver transform each,
 *  falling through once and gone. Vega stalls on many independently animated nodes. */
export function CelebrationBurst(): React.ReactElement | null {
  const reduced = useReducedMotion(), paused = useTvView().paused;
  const fall = useRef(LAYERS.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (reduced) return;
    const run = Animated.parallel(LAYERS.map((layer, i) => Animated.timing(fall[i]!, {
      toValue: 1, duration: layer.durationMs, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web', isInteraction: false })));
    run.start(); return () => run.stop();
  }, [reduced]);
  if (reduced || paused) return null;
  return <>{LAYERS.map((layer, i) => <Animated.Image key={layer.id} source={bitmap(layer.id)} style={{
    position: 'absolute', left: 0, top: 0, width: 1280, height: 1440, zIndex: 40,
    opacity: fall[i]!.interpolate({ inputRange: [0, .7, 1], outputRange: [layer.opacity, layer.opacity, 0] }),
    transform: [{ translateY: fall[i]!.interpolate({ inputRange: [0, 1], outputRange: [-1300, 640] }) }] }}/>)}</>;
}
