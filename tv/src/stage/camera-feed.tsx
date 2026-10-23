import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, View } from '@amazon-devices/react-native-kepler';
import { TOKENS, seededRng } from '@snag/shared';
import manifest from '../../../assets/manifest.json';
import { useSession, useTvView } from './context';
import { Bitmap, Card, Label, Motion } from './primitives';
import { layers } from './effect-layout';
import { FeedImage } from './feed';
import { Svg, Path, Rect } from './platform';
import { cameraTracking, panoramaOffset } from './instrument-math';
import { useReducedMotion } from './motion-settings';
import { DecorativeClock } from './decorative-clock';
import { compactInterpolation } from './compact-interpolation';
import { idleLoopsOff } from './motion-settings';
import { diag } from './diag';

const objects = Object.values(manifest.objects).map(o => ({ id: o.id, name: o.name, center: o.housePlacement.center, zone: o.housePlacement.zone }));

/** Short complete captions retain the mockup's voice without ellipses. */
function flavorCaption(name: string): string {
  const words = name.toLowerCase().split(' ');
  const noun = name.length <= 10 ? name.toLowerCase() : words.at(-1)!;
  return noun.length <= 7 ? 'Eyeing the ' + noun + '?' : 'Eyeing ' + noun + '?';
}

/** Camera treatment shared by a memory-only phone feed and a bot's house pan. */
function WebCameraFeed({ index, color, label = 'Hunting…', bot = false, locked = false, object, width = 274, height = 172, flashTarget, largeStatus = false }: { index: number; color: string; label?: string; bot?: boolean; locked?: boolean; object?: string; width?: number; height?: number; flashTarget?: string; largeStatus?: boolean }): React.ReactElement {
  const view = useTvView(), session = useSession(), reduced = useReducedMotion();
  const random = useRef(seededRng(8191 + index * 103)).current;
  const taken = useRef(new Set(view.feeds.map(f => f.find?.obj))); taken.current = new Set(view.feeds.map(f => f.find?.obj));
  const [selection, setSelection] = useState(() => objects[(index * 7 + 9) % objects.length]!);
  const x = useRef(new Animated.Value(selection.center[0]! * .3)).current, y = useRef(new Animated.Value(selection.center[1]! * .3)).current;
  const jitter = useRef(new Animated.Value(0)).current, blink = useRef(new Animated.Value(1)).current;
  const lockedObject = objects.find(o => o.id === object), destination = lockedObject ?? selection;
  useEffect(() => {
    if (!bot || locked || view.paused || reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const choose = () => {
      const pool = objects.filter(o => !taken.current.has(o.id));
      setSelection(pool[Math.floor(random() * pool.length)] ?? objects[0]!);
      timer = setTimeout(choose, (1100 + random() * 1200) / ((session.clock as { speed?: number }).speed ?? 1));
    };
    timer = setTimeout(choose, 1100 / ((session.clock as { speed?: number }).speed ?? 1));
    return () => clearTimeout(timer);
  }, [bot, locked, view.paused, reduced]);
  useEffect(() => {
    if (!bot || view.paused) return;
    const center = locked ? destination.center : [destination.center[0]! + (random() * 140 - 70), destination.center[1]! + (random() * 100 - 50)];
    const tracking = cameraTracking(locked ? 9 : 1.6 + random());
    const duration = tracking.durationMs / ((session.clock as { speed?: number }).speed ?? 1);
    const animation = Animated.parallel([Animated.timing(x, { toValue: center[0]! * .3, duration: reduced ? 0 : duration, easing: tracking.at, useNativeDriver: true }), Animated.timing(y, { toValue: center[1]! * .3, duration: reduced ? 0 : duration, easing: tracking.at, useNativeDriver: true })]);
    animation.start(); return () => animation.stop();
  }, [destination.id, locked, bot, view.paused, reduced]);
  useEffect(() => {
    if (view.paused || reduced || idleLoopsOff()) return;
    const a = Animated.loop(Animated.timing(jitter, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }));
    const b = Animated.loop(Animated.sequence([Animated.timing(blink, { toValue: 0, duration: 550, easing: Easing.step0, useNativeDriver: true }), Animated.timing(blink, { toValue: 1, duration: 550, easing: Easing.step0, useNativeDriver: true })]));
    a.start(); b.start(); return () => { a.stop(); b.stop(); };
  }, [view.paused, reduced]);
  const range = Array.from({ length: 91 }, (_, i) => i / 90);
  const jitterX = jitter.interpolate({ inputRange: range, outputRange: range.map(t => Math.sin((t * 9 + index) * 2.1) * 5 + Math.sin((t * 9 + index) * 5.3) * 2) });
  const jitterY = jitter.interpolate({ inputRange: range, outputRange: range.map(t => Math.cos((t * 9 + index) * 1.7) * 4) });
  const clampPan = (value: Animated.AnimatedAddition<number>, min: number) => value.interpolate({ inputRange: [min - 1, min, 0, 1], outputRange: [min, min, 0, 0], extrapolate: 'clamp' });
  const halfW = (width - 10) / 2, halfH = (height - 10) / 2;
  const panX = clampPan(Animated.subtract(halfW, Animated.add(x, jitterX)), width - 10 - 720);
  const panY = clampPan(Animated.subtract(halfH, Animated.add(y, jitterY)), height - 10 - 360);
  const reticleX = Animated.subtract(Animated.add(x, panX), halfW), reticleY = Animated.subtract(Animated.add(y, panY), halfH);
  let scan = ''; for (let n = 0; n < height; n += 5) scan += `M0 ${n}h${width}v2h-${width}z`;
  const bracketColor = locked ? TOKENS.yolk : '#FFFFFF';
  const caption = largeStatus ? bot ? flavorCaption(destination.name) : locked ? 'SNAGGED!' : 'Searching for glory!' : locked ? label : bot ? 'Eyeing the ' + selection.name.toLowerCase() + '?' : label;
  return <Card width={width} height={height} radius={24} fill="#05061F">
    <View style={{ flex: 1, borderRadius: 19, overflow: 'hidden' }}>
      {bot ? <Animated.View style={{ position: 'absolute', width: 720, height: 360, transform: [{ translateX: panX }, { translateY: panY }] }}><Bitmap id="house/panorama-0.5x" width={720} height={360}/></Animated.View> : <FeedImage index={index} width={width - 10} height={height - 10} raw/>}
      <Svg width={width - 10} height={height - 10} style={{ position: 'absolute' }}>
        <Path d={scan} fill="rgba(5,6,31,.2)"/>
        <Rect x={2} y={2} width={width - 14} height={height - 14} rx={17} fill="none" stroke={color} strokeWidth={4}/>
      </Svg>
      <Animated.View style={{ position: 'absolute', left: halfW - 32, top: halfH - 32, transform: bot ? [{ translateX: reticleX }, { translateY: reticleY }] : [] }}>
        <Svg width={64} height={64}><Path d="M2 18V8Q2 2 8 2H18M46 2H56Q62 2 62 8V18M2 46V56Q2 62 8 62H18M46 62H56Q62 62 62 56V46" stroke={TOKENS.ink} strokeWidth={6} fill="none" translateY={2}/><Path d="M2 18V8Q2 2 8 2H18M46 2H56Q62 2 62 8V18M2 46V56Q2 62 8 62H18M46 62H56Q62 62 62 56V46" stroke={bracketColor} strokeWidth={4} fill="none"/></Svg>
      </Animated.View>
      {flashTarget && <Motion target={flashTarget} width={width - 10} height={height - 10} opacity={0} style={{ backgroundColor: '#FFFFFF', zIndex: layers.effects }}/>}
      {!largeStatus && <View style={{ position: 'absolute', zIndex: layers.content, right: 12, top: largeStatus ? 68 : 24, backgroundColor: 'rgba(5,6,31,.78)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 5 }}><Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: TOKENS.red, opacity: blink }}/><Label size={largeStatus ? 20 : 16} weight={900} color="#FFFFFF" style={{ letterSpacing: largeStatus ? 0 : 1.5 }}>{largeStatus ? locked ? 'SNAGGED' : 'HUNTING' : 'CAM ' + (index + 1)}</Label></View>}
      <View style={{ position: 'absolute', zIndex: layers.content, left: 6, right: 6, bottom: 10, alignItems: 'center' }}><View style={{ maxWidth: '100%', backgroundColor: locked ? TOKENS.yolk : TOKENS.paper, borderWidth: 3, borderColor: TOKENS.ink, borderRadius: 9, paddingHorizontal: largeStatus ? 4 : 10, paddingVertical: 4, shadowColor: TOKENS.ink, shadowOpacity: 1, shadowOffset: { width: 0, height: 3 }, shadowRadius: 0 }}><Label size={largeStatus ? 24 : 16} weight={largeStatus ? 700 : 900} lines={1}>{caption}</Label></View></View>
    </View>
  </Card>;
}

type FeedProps = Parameters<typeof WebCameraFeed>[0];
/** Sample tracking, panorama clamps and jitter once per target. One native clock
 * drives the tile; there are no native add/subtract/clamp animation graphs. */
function NativeCameraFeed({ index, color, label = 'Hunting…', bot, locked, object, width = 274, height = 172, flashTarget, largeStatus = false }: FeedProps): React.ReactElement {
  const session = useSession(), view = useTvView(), reduced = useReducedMotion();
  const random = useRef(seededRng(8191 + index * 103)).current;
  const [selection, setSelection] = useState(() => objects[(index * 7 + 9) % objects.length]!);
  const taken = useRef(new Set<string | undefined>()); taken.current = new Set(view.feeds.map(f => f.find?.obj));
  const destination = objects.find(o => o.id === object) ?? selection;
  const presentation = useRef(new DecorativeClock(session.clock.now())).current;
  const previous = useRef({ from: [...selection.center], to: [...selection.center], at: 0, duration: 1, speed: 2 });
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!bot || locked || view.paused || reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const choose = () => {
      const pool = objects.filter(o => !taken.current.has(o.id));
      setSelection(pool[Math.floor(random() * pool.length)] ?? objects[0]!);
      timer = setTimeout(choose, (1100 + random() * 1200) / ((session.clock as { speed?: number }).speed ?? 1));
    };
    timer = setTimeout(choose, 1100 / ((session.clock as { speed?: number }).speed ?? 1));
    return () => clearTimeout(timer);
  }, [bot, locked, view.paused, reduced]);
  const table = useMemo(() => {
    if (!bot) return { duration: 1, points: [0, 1].map(t => ({ t, x: 0, y: 0, rx: 0, ry: 0, rec: 1 })) };
    const now = presentation.elapsed(session.clock.now(),view.paused);
    const old = previous.current, age = Math.max(0, now - old.at), weight = cameraTracking(old.speed).at(Math.min(1, age / old.duration));
    const from = old.from.map((v, i) => v + (old.to[i]! - v) * weight);
    const to = locked ? [...destination.center] : [destination.center[0]! + random() * 140 - 70, destination.center[1]! + random() * 100 - 50];
    const speed = locked ? 9 : 1.6 + random(), tracking = cameraTracking(speed);
    const duration = tracking.durationMs;
    previous.current = { from, to, at: now, duration, speed };
    const count = Math.ceil(duration / (1000 / 60));
    return { duration, points: Array.from({ length: count + 1 }, (_, i) => {
      const t = i / count, w = reduced ? 1 : tracking.at(t), center = from.map((v, j) => v + (to[j]! - v) * w);
      const pan = panoramaOffset(center, width - 10, height - 10, reduced ? 0 : duration * t / 1000 + index);
      return { t, x: -pan.x, y: -pan.y, rx: center[0]! * .3 - pan.x - (width - 10) / 2, ry: center[1]! * .3 - pan.y - (height - 10) / 2,
        rec: Math.floor(duration * t / 550) % 2 ? 0 : 1 };
    }) };
  }, [destination.id, locked, reduced, view.paused, width, height, bot]);
  useEffect(() => { if(bot&&!view.paused) session.telemetry('camera-target',{round:view.round,target:'feed-'+index,name:destination.id,case:destination.zone}); },[destination.id,locked,bot,view.paused]);
  useEffect(() => {
    progress.setValue(0); if (view.paused || reduced || !bot) return;
    const motion = Animated.timing(progress, { toValue: 1, duration: table.duration / ((session.clock as { speed?: number }).speed ?? 1), easing: Easing.linear, useNativeDriver: true });
    motion.start(); return () => { motion.stop(); progress.stopAnimation(); };
  }, [table, view.paused, reduced, bot]);
  const fields = useMemo(() => ({
    x: progress.interpolate(compactInterpolation(table.points.map(p=>p.t),table.points.map(p=>p.x),.01)),
    y: progress.interpolate(compactInterpolation(table.points.map(p=>p.t),table.points.map(p=>p.y),.01)),
    rx: progress.interpolate(compactInterpolation(table.points.map(p=>p.t),table.points.map(p=>p.rx),.01)),
    ry: progress.interpolate(compactInterpolation(table.points.map(p=>p.t),table.points.map(p=>p.ry),.01)),
    rec: progress.interpolate(compactInterpolation(table.points.map(p=>p.t),table.points.map(p=>p.rec),.01)),
  }),[table,progress]);
  const field = (key: keyof typeof fields) => fields[key];
  let scan = ''; for (let n = 0; n < height; n += 5) scan += `M0 ${n}h${width}v2h-${width}z`;
  const caption = largeStatus ? bot ? flavorCaption(destination.name) : locked ? 'SNAGGED!' : 'Searching for glory!' : locked ? label : bot ? 'Eyeing the ' + selection.name.toLowerCase() + '?' : label;
  return <Card width={width} height={height} radius={24} fill="#05061F"><View style={{ flex: 1, borderRadius: diag.feedSquare ? 0 : 19, overflow: 'hidden' }}>
    {diag.feedNoPan ? null : bot ? <Animated.View style={{ position: 'absolute', width: 720, height: 360, transform: [{ translateX: field('x') }, { translateY: field('y') }] }}><Bitmap id="house/panorama-0.5x" width={720} height={360}/></Animated.View> : <FeedImage index={index} width={width - 10} height={height - 10} raw/>}
    {!diag.feedNoOverlay && <Svg width={width - 10} height={height - 10} style={{ position: 'absolute' }}>{!diag.feedScanOff && <Path d={scan} fill="rgba(5,6,31,.2)"/>}<Rect x={2} y={2} width={width - 14} height={height - 14} rx={17} fill="none" stroke={color} strokeWidth={4}/></Svg>}
    {!diag.feedNoReticle && <Animated.View style={{ position: 'absolute', left: (width - 10) / 2 - 32, top: (height - 10) / 2 - 32, transform: bot ? [{ translateX: field('rx') }, { translateY: field('ry') }] : [] }}><Svg width={64} height={64}><Path d="M2 18V8Q2 2 8 2H18M46 2H56Q62 2 62 8V18M2 46V56Q2 62 8 62H18M46 62H56Q62 62 62 56V46" stroke={TOKENS.ink} strokeWidth={6} fill="none" translateY={2}/><Path d="M2 18V8Q2 2 8 2H18M46 2H56Q62 2 62 8V18M2 46V56Q2 62 8 62H18M46 62H56Q62 62 62 56V46" stroke={locked ? TOKENS.yolk : '#FFFFFF'} strokeWidth={4} fill="none"/></Svg></Animated.View>}
    {flashTarget && <Motion target={flashTarget} width={width - 10} height={height - 10} opacity={0} style={{ backgroundColor: '#FFFFFF', zIndex: layers.effects }}/>}
      {!largeStatus && <View style={{ position: 'absolute', zIndex: layers.content, right: 12, top: largeStatus ? 68 : 24, backgroundColor: 'rgba(5,6,31,.78)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 5 }}><Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: TOKENS.red, opacity: bot ? field('rec') : 1 }}/><Label size={largeStatus ? 20 : 16} weight={900} color="#FFFFFF" style={{ letterSpacing: largeStatus ? 0 : 1.5 }}>{largeStatus ? locked ? 'SNAGGED' : 'HUNTING' : 'CAM ' + (index + 1)}</Label></View>}
    {!diag.feedNoCaption && <View style={{ position: 'absolute', zIndex: layers.content, left: 6, right: 6, bottom: 10, alignItems: 'center' }}><View style={{ maxWidth: '100%', backgroundColor: locked ? TOKENS.yolk : TOKENS.paper, borderWidth: 3, borderColor: TOKENS.ink, borderRadius: 9, paddingHorizontal: largeStatus ? 4 : 10, paddingVertical: 4 }}><Label size={largeStatus ? 24 : 16} weight={largeStatus ? 700 : 900} lines={1}>{caption}</Label></View></View>}
  </View></Card>;
}
export function CameraFeed(props: FeedProps): React.ReactElement {
  return Platform.OS === 'web' ? <WebCameraFeed {...props}/> : <NativeCameraFeed {...props}/>;
}
