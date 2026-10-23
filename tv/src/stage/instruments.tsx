import { diag } from './diag';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing as RNEasing, Image, Platform, Text, TextInput, View } from '@amazon-devices/react-native-kepler';
import Reanimated, { cancelAnimation, Easing, useAnimatedProps, useSharedValue, withTiming } from '@amazon-devices/react-native-reanimated';
import { TOKENS } from '@snag/shared';
import { bitmap } from './assets';
import { Svg, Circle, Path, Rect } from './platform';
import { useSession, useTvView } from './context';
import { frameClock } from './frame-clock';
import { mutate } from './mutate';
import { dialReading, flipFront, flipSwapMs, meterReading, pixelPaths } from './instrument-math';
import { useReducedMotion } from './motion-settings';
import { Motion } from './primitives';
import { idleLoopsOff } from './motion-settings';

const NativeArc = Platform.OS === 'web' ? Circle : Reanimated.createAnimatedComponent(Circle);
const noProps = () => ({});

function WebCountdownDial({ deadline, total, paused, width = 236, numberSize = 104 }: { deadline?: number; total?: number; paused: boolean; width?: number; numberSize?: number }): React.ReactElement {
  const session = useSession(), reduced = useReducedMotion(), last = useRef(dialReading(deadline, total, session.clock.now()));
  const [seconds, setSeconds] = useState(last.current.seconds), arc = useRef<Circle>(null);
  const remaining = useSharedValue(last.current.fraction);
  useEffect(() => {
    cancelAnimation(remaining);
    if (paused) return;
    last.current = dialReading(deadline, total, session.clock.now());
    remaining.value = last.current.fraction;
    const speed = (session.clock as { speed?: number }).speed ?? 1;
    remaining.value = withTiming(0, { duration: Math.max(0, (deadline ?? session.clock.now()) - session.clock.now()) / speed, easing: Easing.linear });
    return () => cancelAnimation(remaining);
  }, [deadline, total, paused]);
  const props = useAnimatedProps(Platform.OS === 'web' ? noProps : () => ({ strokeDashoffset: 527.8 * (1 - remaining.value) }));
  useEffect(() => frameClock.subscribe(() => {
    if (paused) return;
    const reading = dialReading(deadline, total, session.clock.now());
    last.current = reading;
    setSeconds(previous => previous === reading.seconds ? previous : reading.seconds);
    if (Platform.OS === 'web') mutate(arc.current, { 'stroke-dashoffset': 527.8 * (1 - reading.fraction) });
  }, 16), [deadline, total, paused]);
  const urgent = seconds <= 10, color = urgent ? TOKENS.red : TOKENS.lime;
  const scale = width / 236;
  return <View style={{ width, height: width, transform: [{ scale }] }}>
    <Svg width={236} height={236} viewBox="0 0 236 236">
      <Rect x={98} y={2} width={40} height={26} rx={8} fill={TOKENS.paper} stroke={TOKENS.ink} strokeWidth={6}/>
      <Circle cx={118} cy={132} r={100} fill={TOKENS.paper} stroke={TOKENS.ink} strokeWidth={8}/>
      <Circle cx={118} cy={132} r={84} fill="none" stroke="#E8DECB" strokeWidth={16}/>
      <NativeArc ref={arc} animatedProps={props} cx={118} cy={132} r={84} fill="none" stroke={color} strokeWidth={16} strokeLinecap="round" strokeDasharray="527.8" strokeDashoffset={527.8 * (1 - last.current.fraction)} rotation={-90} origin="118,132"/>
    </Svg>
    <View style={{ position: 'absolute', left: 0, top: 78, width: 236, height: 110, justifyContent: 'center' }}>
      <DisplayNumber value={seconds} size={numberSize} color={urgent ? TOKENS.red : TOKENS.ink} pulse={urgent && !paused && !reduced}/>
    </View>
  </View>;
}

/** Numbers update their text in place; no per-frame React rendering or layout. */
function WebMotionNumber({ target, value, suffix = '', size = 30, width = 62, color = TOKENS.ink }: { target: string; value: number; suffix?: string; size?: number; width?: number; color?: string }): React.ReactElement {
  const session = useSession(), view = useTvView(), ref = useRef<TextInput>(null), snapshot = useRef({ view, at: session.clock.now() });
  snapshot.current = { view, at: session.clock.now() };
  const initial = meterReading(value, view.motion[target] ?? [], 0) + suffix;
  useEffect(() => {
    let previous = '';
    return frameClock.subscribe(() => {
      const s = snapshot.current, text = meterReading(value, s.view.motion[target] ?? [], s.view.paused ? 0 : session.clock.now() - s.at) + suffix;
      if (text === previous) return;
      previous = text;
      if (Platform.OS === 'web') { const node = ref.current as unknown as { value: string } | null; if (node) node.value = text; }

    }, 30);
  }, [target, value, suffix]);
  return <TextInput ref={ref} editable={false} caretHidden defaultValue={initial} style={{ width, height: size * 1.2, padding: 0, borderWidth: 0, backgroundColor: 'transparent', fontFamily: 'Lilita One', fontSize: size, color, textAlign: 'right' }} />;
}

function DisplayNumber({ value, size, color, pulse }: { value: number; size: number; color: string; pulse: boolean }): React.ReactElement {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!pulse || idleLoopsOff()) { scale.setValue(1); return; }
    const timing = (toValue: number) => Animated.timing(scale, { toValue, duration: 250, easing: RNEasing.inOut(RNEasing.ease), useNativeDriver: true });
    const animation = Animated.loop(Animated.sequence([timing(1.12), timing(1)])); animation.start();
    return () => animation.stop();
  }, [pulse]);
  // Countdown changes once per second. Its geometry remains fixed.
  return <Animated.View style={{ transform: [{ scale }] }}><Text style={{width:236,height:size*1.22,fontFamily:'Lilita One',fontSize:size,color,textAlign:'center'}}>{value}</Text></Animated.View>;
}

/** A procedural 10×10 shimmer, timed by the authoritative scan motion. */
function WebPixelShimmer({ target, hex, size = 136 }: { target: string; hex: string; size?: number }): React.ReactElement {
  const session = useSession(), view = useTvView(), nodes = useRef<(Path | null)[]>([]), reduced = useReducedMotion();
  const state = view.motion[target]?.at(-1), at = session.clock.now(), initial = pixelPaths(hex, 1);
  useEffect(() => {
    if (!state || view.paused || reduced || state.elapsedMs >= 950) return;
    const stop = frameClock.subscribe(() => {
      const elapsed = state.elapsedMs + session.clock.now() - at;
      if (elapsed >= 950) { nodes.current.forEach(node => mutate(node, { opacity: 0 })); stop(); return; }
      const opacity = elapsed < 135 ? elapsed / 135 * .95 : elapsed < 630 ? .95 : Math.max(0, (900 - elapsed) / 270) * .95;
      if (elapsed < 0) return;
      pixelPaths(hex, Math.floor(elapsed / 60) + 1).forEach((p, i) => mutate(nodes.current[i], { d: p.d, fill: p.fill, opacity }));
    }, 16);
    return stop;
  }, [state?.startedAt, view.paused, reduced, hex]);
  return <Svg width={size} height={size} viewBox="0 0 10 10" style={{ borderRadius: 14, overflow: 'hidden' }}>{initial.map((p, i) => <Path key={i} ref={node => { nodes.current[i] = node; }} d={p.d} fill={p.fill} opacity={0}/>)}</Svg>;
}

/** A repeatable paper halftone made from one SVG path. */
/** Card-back dots as one raster (clipped by the card): SVG circles re-tessellated every frame on the stick. */
export function DotTexture({ width, height }: { width: number; height: number; color?: string; step?: number; radius?: number }): React.ReactElement {
  return <View pointerEvents="none" style={{ position: 'absolute', width, height, overflow: 'hidden' }}><Image source={bitmap('stage/card-dots')} style={{ position: 'absolute', width: 280, height: 340 }}/></View>;
}

/** Swap faces at the core flip's midpoint; Vega's cosine squash needs an unmirror. */
export function FlipFaces({ target, front, back, width, height }: { target: string; front: React.ReactNode; back: React.ReactNode; width: number; height: number }): React.ReactElement {
  const view = useTvView(), session = useSession(), reduced = useReducedMotion(), state = view.motion[target]?.at(-1);
  const [showFront, setShowFront] = useState(() => flipFront(state));
  useEffect(() => {
    setShowFront(flipFront(state));
    if (!state || view.paused || flipFront(state)) return;
    const timer = setTimeout(() => setShowFront(true), Math.max(0, flipSwapMs(state) - state.elapsedMs) / ((session.clock as { speed?: number }).speed ?? 1));
    return () => clearTimeout(timer);
  }, [state?.startedAt, state?.elapsedMs, view.paused]);
  return <Motion target={target} width={width} height={height}><View style={{ flex: 1, transform: showFront && !reduced ? Platform.OS === 'web' ? [{ rotateY: '180deg' }] : [{ scaleX: -1 }] : [] }}>{showFront ? front : back}</View></Motion>;
}

/** Clip two fixed half arcs; only native-driver transforms change during the countdown. */
function NativeCountdownDial({ deadline, total, paused, width = 236, numberSize = 104 }: Parameters<typeof WebCountdownDial>[0]): React.ReactElement {
  const session = useSession();
  const reading = dialReading(deadline, total, session.clock.now());
  const [seconds, setSeconds] = useState(reading.seconds);
  const remaining = useRef(new Animated.Value(reading.fraction)).current;
  useEffect(() => {
    const r = dialReading(deadline, total, session.clock.now()); remaining.setValue(r.fraction);
    if (paused) return;
    const motion = Animated.timing(remaining, { toValue: 0, duration: Math.max(0, (deadline ?? session.clock.now()) - session.clock.now()) / ((session.clock as { speed?: number }).speed ?? 1), easing: RNEasing.linear, useNativeDriver: true });
    motion.start(); return () => { motion.stop(); remaining.stopAnimation(); };
  }, [deadline, total, paused]);
  useEffect(() => frameClock.subscribe(() => {
    if (!paused) { const n = dialReading(deadline, total, session.clock.now()).seconds; setSeconds(old => old === n ? old : n); }
  }, 16), [deadline, total, paused]);
  const rotations = useMemo(()=>[remaining.interpolate({inputRange:[0,.5,1],outputRange:['-180deg','0deg','0deg'],extrapolate:'clamp'}),remaining.interpolate({inputRange:[0,.5,1],outputRange:['0deg','0deg','180deg'],extrapolate:'clamp'})],[remaining]);
  const color = seconds <= 10 ? TOKENS.red : TOKENS.lime;
  return <View style={{ width, height: width, transform: [{ scale: width / 236 }] }}>
    {!diag.dialNoFace && <Svg width={236} height={236}><Rect x={98} y={2} width={40} height={26} rx={8} fill={TOKENS.paper} stroke={TOKENS.ink} strokeWidth={6}/><Circle cx={118} cy={132} r={100} fill={TOKENS.paper} stroke={TOKENS.ink} strokeWidth={8}/><Circle cx={118} cy={132} r={84} fill="none" stroke="#E8DECB" strokeWidth={16}/></Svg>}
    {!diag.dialNoArcs && [false, true].map(left => <View key={String(left)} style={{ position: 'absolute', left: left ? 26 : 118, top: 40, width: 92, height: 184, overflow: 'hidden' }}>
      <Animated.View style={{ position: 'absolute', left: left ? 0 : -92, width: 184, height: 184, transform: [{ rotate: rotations[left?1:0]! }] }}>
        <Svg width={184} height={184}><Path d="M92 8A84 84 0 0 1 92 176" fill="none" stroke={color} strokeWidth={16} strokeLinecap="round"/></Svg>
      </Animated.View>
    </View>)}
    {!diag.dialNoNumber && <View style={{position:'absolute',left:0,top:78,width:236,height:110,justifyContent:'center'}}><DisplayNumber value={seconds} size={numberSize} color={seconds<=10?TOKENS.red:TOKENS.ink} pulse={seconds<=10&&!paused&&!frameClock.reducedMotion}/></View>}
  </View>;
}
export function CountdownDial(props: Parameters<typeof WebCountdownDial>[0]): React.ReactElement {
  return Platform.OS === 'web' ? <WebCountdownDial {...props}/> : <NativeCountdownDial {...props}/>;
}

function NativeMotionNumber({ target, value, suffix = '', size = 30, width = 62, color = TOKENS.ink }: Parameters<typeof WebMotionNumber>[0]): React.ReactElement {
  const session = useSession(), view = useTvView(), at = session.clock.now();
  const [number, setNumber] = useState(meterReading(value, view.motion[target] ?? [], 0));
  useEffect(() => {
    const draw = () => { const n = meterReading(value, view.motion[target] ?? [], view.paused ? 0 : session.clock.now() - at); setNumber(old => old === n ? old : n); };
    draw(); return frameClock.subscribe(draw, 16);
  }, [view.motion[target], value, view.paused]);
  return <Text style={{width,height:size*1.2,fontFamily:'Lilita One',fontSize:size,color,textAlign:'right'}}>{number}{suffix}</Text>;
}
export function MotionNumber(props: Parameters<typeof WebMotionNumber>[0]): React.ReactElement {
  return Platform.OS === 'web' ? <WebMotionNumber {...props}/> : <NativeMotionNumber {...props}/>;
}
function NativePixelShimmer({ target, hex, size = 136 }: Parameters<typeof WebPixelShimmer>[0]): React.ReactElement {
  const session = useSession(), view = useTvView(), state = view.motion[target]?.at(-1), reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const elapsed = state ? view.paused ? state.elapsedMs : session.clock.now() - state.startedAt : 950;
    progress.setValue(Math.max(0, Math.min(1, elapsed / 950)));
    if (!state || view.paused || reduced || elapsed >= 950) return;
    const motion = Animated.timing(progress, {toValue:1,duration:(950-Math.max(0,elapsed))/((session.clock as {speed?:number}).speed??1),easing:RNEasing.linear,useNativeDriver:true});
    motion.start(); return () => {motion.stop();progress.stopAnimation();};
  }, [state?.startedAt, view.paused, reduced]);
  const range = useMemo(()=>Array.from({length:96},(_,i)=>i/95),[]);
  const opacity = useMemo(()=>[0,1,2].map(layer=>progress.interpolate({inputRange:range,outputRange:range.map(t=>{const ms=t*950;return Math.floor(ms/60)%3===layer ? ms<135?ms/135*.95:ms<630?.95:Math.max(0,(900-ms)/270)*.95:0;})})),[progress,range]);
  const patterns = useMemo(()=>[0,1,2].map(layer=>pixelPaths(hex,layer+1)),[hex]);
  return <View pointerEvents="none" style={{width:size,height:size,overflow:'hidden',borderRadius:14}}>{[0,1,2].map(layer => <Animated.View key={layer} style={{position:'absolute',width:size,height:size,opacity:opacity[layer]!}}><Svg width={size} height={size} viewBox="0 0 10 10">{patterns[layer]!.map((p,i)=><Path key={i} d={p.d} fill={p.fill}/>)}</Svg></Animated.View>)}</View>;
}
export function PixelShimmer(props: Parameters<typeof WebPixelShimmer>[0]): React.ReactElement {
  return Platform.OS === 'web' ? <WebPixelShimmer {...props}/> : <NativePixelShimmer {...props}/>;
}
