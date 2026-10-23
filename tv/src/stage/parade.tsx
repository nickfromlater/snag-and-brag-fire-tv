import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from '@amazon-devices/react-native-kepler';
import { Sticker } from './primitives';
import { frameClock } from './frame-clock';
const hop = (time: number) => (1 - Math.cos(time / .84 * Math.PI * 2)) / 2;
function Walker({ obj, index }: { obj: string; index: number }): React.ReactElement {
  const x = useRef(new Animated.Value(1340 - index * 2.1 / 16.8 * 1470)).current, y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (frameClock.reducedMotion) return;
    const initial = 1340 - index * 183.75, remaining = (initial + 130) / 1470 * 16800;
    const fullWalk = Animated.timing(x, { toValue: -130, duration: 16800, useNativeDriver: true, easing: Easing.linear });
    const a = Animated.timing(x, { toValue: -130, duration: remaining, useNativeDriver: true, easing: Easing.linear });
    let loop: Animated.CompositeAnimation | undefined;
    a.start(({ finished }) => { if (finished) { x.setValue(1340); loop = Animated.loop(fullWalk); loop.start(); } });
    y.setValue(hop(index * .17));
    const b = Animated.loop(Animated.sequence([Animated.timing(y, { toValue: 1, duration: 420, easing: Easing.bezier(.3, 0, .5, 1), useNativeDriver: true }), Animated.timing(y, { toValue: 0, duration: 420, easing: Easing.bezier(.3, 0, .5, 1), useNativeDriver: true })]));
    b.start(); return () => { a.stop(); b.stop(); loop?.stop(); };
  }, []);
  return <Animated.View style={{ position: 'absolute', left: 0, top: 502, width: 78, height: 78, transform: [{ translateX: x }] }}><Animated.View style={{ width: 78, height: 78, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, -24] }) }, { rotate: y.interpolate({ inputRange: [0, 1], outputRange: ['-7deg', '6deg'] }) }, { scaleX: y.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] }) }, { scaleY: y.interpolate({ inputRange: [0, 1], outputRange: [.96, 1] }) }] }}><Sticker obj={obj} size={78} target={'parade:' + obj} parentMotion={time => ({ x: 1340 - ((time + index * 2.1) % 16.8) / 16.8 * 1470, y: -24 * hop(time + index * .17) })} /></Animated.View></Animated.View>;
}
export function Parade({ objects }: { objects: string[] }): React.ReactElement { return <>{objects.map((obj, i) => <Walker key={obj} obj={obj} index={i} />)}</>; }
