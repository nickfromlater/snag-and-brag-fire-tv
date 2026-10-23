import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, View } from '@amazon-devices/react-native-kepler';
import { BG_PALETTES, BG_RAY_SPEED, BG_SPOT, seededRng } from '@snag/shared';
import type { Mood, TvView } from '@snag/shared';
import { bitmap } from './assets';
import { frameClock } from './frame-clock';
import { monitorWork } from './work-monitor';
import { compactInterpolation } from './compact-interpolation';
import { VideoBackdrop } from './video-backdrop.native';
import { NATIVE_BACKDROP_SINGLE_DECODER } from './native-effects-policy';
import { diag } from './diag';
export { starD } from './background-geometry';
const moods: Mood[] = ['normal', 'urgent', 'tension', 'party', 'gold'];
interface Doodle { kind: number; x: number; y: number; size: number; r: number; vr: number; vy: number; color: string }
interface Frame { base: number[]; alpha: number[]; angle: number; time: number; doodles: Doodle[] }
interface FrameValue { clock: Animated.Value; frames: Frame[]; input: number[] }
const value = (f: FrameValue, select: (v: Frame) => number) => f.clock.interpolate({ ...compactInterpolation(f.input, f.frames.map(select)), extrapolate: 'clamp' });
const radians = (f: FrameValue, select: (v: Frame) => number) => { const samples = compactInterpolation(f.input, f.frames.map(select), .00001); return f.clock.interpolate({ inputRange: samples.inputRange, outputRange: samples.outputRange.map(v => v + 'rad'), extrapolate: 'clamp' }); };
function MoodLayer({ frame, index, rays: isRay = false, base = false }: { frame: FrameValue; index: number; rays?: boolean; base?: boolean }): React.ReactElement {
  const opacity = useMemo(() => value(frame, v => { let prefix = 0; for (let i = 0; i <= index; i++) prefix += v.alpha[i]!; return prefix > .00001 ? v.alpha[index]! / prefix : 0; }), [frame]);
  const mood = moods[index]!;
  return <Animated.Image source={bitmap('stage/' + (base ? 'base-' : isRay ? 'rays-' : 'overlay-') + mood)} style={{ position: 'absolute', width: base || !isRay ? 1280 : 1800, height: base || !isRay ? 720 : 1800, opacity }}/>;
}
function DoodleLayer({ frame, index, doodle }: { frame: FrameValue; index: number; doodle: Doodle }): React.ReactElement {
  const style = useMemo(() => ({ opacity: value(frame, v => {
    const d = v.doodles[index]!; if (d.y > 536) return 0;
    const distance = Math.hypot(d.x - 640, d.y - 426), glow = .6 * Math.max(0, Math.min(1, 1 - (distance - 40) / 363));
    return .55 * (1 - glow);
  }), transform: [{ translateX: doodle.x }, { translateY: value(frame, v => v.doodles[index]!.y) }, { rotate: radians(frame, v => v.doodles[index]!.r) }] }), [frame]);
  return <Animated.Image source={bitmap('stage/doodle-' + index)} style={[{ position: 'absolute', left: -40, top: -40, width: 80, height: 80 }, style]}/>;
}
function GridLine({ frame, index }: { frame: FrameValue; index: number }): React.ReactElement {
  const style = useMemo(() => ({ opacity: value(frame, v => .04 + (index + v.time * .35 % 1) / 9 * .22), transform: [{ translateY: value(frame, v => { const u = (index + v.time * .35 % 1) / 9; return 496 + 224 * u * u; }) }] }), [frame]);
  return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 1280, height: 2, backgroundColor: '#6E7CFF' }, style]} />;
}
function Spotlight({ frame, index, mood }: { frame: FrameValue; index: number; mood: Mood }): React.ReactElement {
  const [sx, speed, phase] = [[180, .55, 0], [1100, .47, 2.1], [640, .36, 4.2]][index]!;
  const cone = useMemo(() => ({ transform: [{ translateX: value(frame, v => Math.tan(Math.sin(v.time * speed! + phase!) * .36) * 338) }, { rotate: radians(frame, v => -Math.sin(v.time * speed! + phase!) * .36) }] }), [frame]);
  const pool = useMemo(() => ({ transform: [{ translateX: value(frame, v => Math.tan(Math.sin(v.time * speed! + phase!) * .36) * 676) }] }), [frame]);
  return <View style={{ opacity: index === 2 && BG_SPOT[mood] < .95 ? 0 : 1 }}><Animated.Image source={bitmap('stage/cone-' + mood)} style={[{ position: 'absolute', width: 264, height: 676, top: -70, left: sx! - 132 }, cone]} /><Animated.Image source={bitmap('stage/pool-' + mood)} style={[{ position: 'absolute', width: 300, height: 78, top: 523, left: sx! - 150 }, pool]} /></View>;
}
/** The reference geometry and color approach, projected from the current pose. */
function pose(start: Frame, mood: Mood, ms: number, reduced: boolean): Frame {
  const elapsed = Math.max(0, ms) / 1000, dt = reduced ? 0 : elapsed, k = 1 - Math.pow(1 - 2.5 / 30, elapsed * 30);
  return { base: start.base.map((x, i) => x + (BG_PALETTES[mood].base[i]! - x) * k), alpha: start.alpha.map((x, i) => x + ((moods[i] === mood ? 1 : 0) - x) * k), time: start.time + dt,
    angle: start.angle + dt * (mood === 'urgent' ? BG_RAY_SPEED.urgent : mood === 'party' || mood === 'gold' ? BG_RAY_SPEED.party : BG_RAY_SPEED.default),
    doodles: start.doodles.map(d => { const y = d.y + d.vy * dt; return { ...d, y: y < -50 ? 536 - (-50 - y) % 586 : y, r: d.r + d.vr * dt }; }) };
}
/** One native core Animated clock; no per-frame shared object writes from JS. */
export function Background({ mood, palette, held = false, atMs = 0, videoActive = false, videoPaused = false, onVideoStatus }: { mood: Mood; palette?: Mood; held?: boolean; atMs?: number; videoActive?: boolean; videoPaused?: boolean; onVideoStatus?(status: string): void }): React.ReactElement {
  const [failed, setFailed] = useState(false), videoMood = useRef<Mood>();
  const video = videoActive && !held && !failed;
  if (!video) videoMood.current = undefined; else videoMood.current ??= mood;
  const still = palette ? <Image source={bitmap('stage/base-' + palette)} style={{ position: 'absolute', width: 1280, height: 720 }}/> : undefined;
  if (video && NATIVE_BACKDROP_SINGLE_DECODER) {
    // One decoder for the whole game: mood changes and judge/finale palettes cover it with
    // a still instead of swapping src (a synchronous 120-730 ms native load per change).
    const cover = still ?? (mood !== videoMood.current ? <HeldBackground mood={mood} atMs={0}/> : undefined);
    return <><VideoBackdrop mood={videoMood.current!} paused={videoPaused} onStatus={onVideoStatus} onFailure={() => { onVideoStatus?.('error'); setFailed(true); }}/>{cover}</>;
  }
  if (still) return still;
  if (video) return <VideoBackdrop mood={mood} paused={videoPaused} onStatus={onVideoStatus} onFailure={() => { onVideoStatus?.('error'); setFailed(true); }}/>;
  return held ? <HeldBackground mood={mood} atMs={atMs}/> : <LiveBackground mood={mood}/>;
}
export function CaptureBackground({ view }: { view: TvView }): React.ReactElement | null {
  return view.paused ? <HeldBackground mood={view.backgroundMood} atMs={view.beatAt}/> : null;
}
function HeldBackground({ mood, atMs }: { mood: Mood; atMs: number }): React.ReactElement {
  const clock = useRef(new Animated.Value(0)).current;
  const frame = useMemo(() => {
    const random = seededRng(1397637447), doodles = Array.from({ length: 16 }, (_, i) => ({ kind: i % 5, x: random() * 1280, y: random() * 720, size: 14 + random() * 20, r: random() * 6.28, vr: random() * .8 - .4, vy: -10 + random() * 6, color: ['#FFD43B', '#FF4FA0', '#3FE0D0', '#B8F23B', '#FFF8EC'][i % 5]! }));
    const frozen = pose({ base: [...BG_PALETTES[mood].base], alpha: moods.map(m => m === mood ? 1 : 0), angle: 0, time: 0, doodles }, mood, atMs, false);
    return { clock, input: [0, 1], frames: [frozen, frozen] };
  }, [mood, atMs]);
  const angle = frame.frames[0]!.angle;
  return <View style={{ position: 'absolute', left: 0, top: 0, width: 1280, height: 720, overflow: 'hidden', zIndex: 0 }}>
    <Animated.Image source={bitmap('stage/base-' + mood)} style={{ position: 'absolute', width: 1280, height: 720 }}/>
    <View style={{ position: 'absolute', width: 1280, height: 494, overflow: 'hidden' }}>
      <Animated.Image source={bitmap('stage/rays-' + mood)} style={{ position: 'absolute', left: -260, top: -474, width: 1800, height: 1800, transform: [{ rotate: angle + 'rad' }] }}/>
      {frame.frames[0]!.doodles.map((d, i) => <DoodleLayer key={i} frame={frame} index={i} doodle={d}/>)}
    </View>
    {Array.from({ length: 9 }, (_, i) => <GridLine key={i} frame={frame} index={i}/>)}
    {[0, 1, 2].map(i => <Spotlight key={i} frame={frame} index={i} mood={mood}/>)}
    <Animated.Image source={bitmap('stage/halftone')} style={{ position: 'absolute', width: 1280, height: 720 }}/>
  </View>;
}
function LiveBackground({ mood }: { mood: Mood }): React.ReactElement {
  const initial = useMemo(() => { const rng = seededRng(1397637447); return Array.from({ length: 16 }, (_, i) => ({ kind: i % 5, x: rng() * 1280, y: rng() * 720, size: 14 + rng() * 20, r: rng() * 6.28, vr: rng() * .8 - .4, vy: -10 + rng() * 6, color: ['#FFD43B', '#FF4FA0', '#3FE0D0', '#B8F23B', '#FFF8EC'][i % 5]! })); }, []);
  const clock = useRef(new Animated.Value(0)).current, axis = useRef({ at: 0, wall: performance.now(), running: false });
  const now = () => axis.current.at + (axis.current.running ? performance.now() - axis.current.wall : 0);
  const model = useRef({ frame: { base: [...BG_PALETTES.normal.base], alpha: [1, 0, 0, 0, 0], angle: 0, time: 0, doodles: initial } as Frame, mood: 'normal' as Mood, at: 0, reduced: false });
  const [settings, setSettings] = useState({ paused: frameClock.paused, reduced: frameClock.reducedMotion }), previous = useRef(settings), [epoch, setEpoch] = useState(0), [laidOut, setLaidOut] = useState(false);
  const build = (start: Frame, target: Mood, at: number, reduced: boolean): FrameValue => monitorWork('background-table', () => ({ clock, input: Array.from({ length: 161 }, (_, i) => at + i * 50), frames: Array.from({ length: 161 }, (_, i) => pose(start, target, i * 50, reduced)) }));
  const [frame, setFrame] = useState(() => build(model.current.frame, mood, 0, false));
  useEffect(() => { const stop = frameClock.subscribe(() => { const next = { paused: frameClock.paused, reduced: frameClock.reducedMotion }; if (next.paused !== previous.current.paused || next.reduced !== previous.current.reduced) { previous.current = next; setSettings(next); } }, 15); const timer = setInterval(() => setEpoch(n => n + 1), 6000); return () => { stop(); clearInterval(timer); }; }, []);
  useEffect(() => {
    if (!laidOut) return;
    const elapsed = now(); axis.current = { at: elapsed, wall: performance.now(), running: !settings.paused }; clock.setValue(elapsed);
    if (settings.paused) return;
    // Core Animated serializes a 60 Hz frame table. Only send the visible
    // eight-second window; a one-hour clock rebuilt 216,000 entries every refresh.
    const end = frame.input[frame.input.length - 1]!;
    const animation = Animated.timing(clock, { toValue: end, duration: Math.max(1, end - elapsed), easing: Easing.linear, useNativeDriver: true, isInteraction: false }); animation.start(); return () => animation.stop();
  }, [settings.paused, laidOut, frame]);
  useEffect(() => { const at = now(), old = model.current, current = pose(old.frame, old.mood, at - old.at, old.reduced); model.current = { frame: current, mood, at, reduced: settings.reduced }; setFrame(build(current, mood, at, settings.reduced)); }, [mood, settings.reduced, epoch]);
  const rayRotation = useMemo(() => ({ transform: [{ rotate: radians(frame, v => v.angle) }] }), [frame]);
  const activeMoods = useMemo(() => moods.map((_, i) => i).filter(i => frame.frames.some(v => v.alpha[i]! > .00001)), [frame]);
  return <View collapsable={false} onLayout={() => setLaidOut(true)} style={{ position: 'absolute', left: 0, top: 0, width: 1280, height: 720, overflow: 'hidden', zIndex: 0 }}>
    {activeMoods.map(i => <MoodLayer key={'base-' + i} frame={frame} index={i} base/>)}
    <View style={{ position: 'absolute', width: 1280, height: 494, overflow: 'hidden' }}>
      {!diag.noRays && <Animated.View style={[{ position: 'absolute', left: -260, top: -474, width: 1800, height: 1800 }, rayRotation]}>{activeMoods.map(i => <MoodLayer key={i} frame={frame} index={i} rays />)}</Animated.View>}
      {!diag.noDoodles && initial.map((d, i) => <DoodleLayer key={i} frame={frame} index={i} doodle={d} />)}
    </View>
    {!diag.noGrid && Array.from({ length: 9 }, (_, i) => <GridLine key={i} frame={frame} index={i} />)}
    {!diag.noSpots && [0, 1, 2].map(i => <Spotlight key={i} frame={frame} index={i} mood={mood} />)}
    {!diag.noHalftone && <Animated.Image source={bitmap('stage/halftone')} style={{ position: 'absolute', width: 1280, height: 720 }} />}
  </View>;
}
