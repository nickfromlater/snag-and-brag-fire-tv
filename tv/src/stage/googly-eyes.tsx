import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Text, View } from '@amazon-devices/react-native-kepler';
import { TOKENS } from '@snag/shared';
import { useSession } from './context';
import { createEye, EYE_HZ, eyeAt, sampleEyeSway, sampleEyeTrajectory } from './eyes';
import type { EyeState, EyeTrajectory } from './eyes';
import { frameClock } from './frame-clock';
import { useReducedMotion } from './motion-settings';
import { bitmap, bitmapInfo } from './assets';
import { compactInterpolation } from './compact-interpolation';
import { idleLoopsOff } from './motion-settings';

export interface GooglyEyesProps {
  eyes: [[number, number], [number, number], number]; size: number; target?: string;
  parentMotion?: (now: number) => { x: number; y: number };
}
export type EyeParentMotion = (offsetSeconds?: number) => { x: number; y: number; width: number };
let eyesEnabled = true;
const eyeSwitchListeners = new Set<(enabled: boolean) => void>();
export function setEyesEnabled(enabled: boolean): void { eyesEnabled = enabled; for (const listener of eyeSwitchListeners) listener(enabled); }
export function useEyesEnabled(): boolean {
  const [enabled, setEnabled] = useState(eyesEnabled);
  useEffect(() => { eyeSwitchListeners.add(setEnabled); return () => { eyeSwitchListeners.delete(setEnabled); }; }, []);
  return enabled;
}

/** Diagnostic only: one eye on an ordinary ready card, with a slow frame heartbeat. */
export function EyeProbe({ driver, count = 1 }: { driver: 'native' | 'sampled' | 'still'; count?: number }): React.ReactElement {
  const [progress] = useState(() => new Animated.Value(0)), [seconds, setSeconds] = useState(0);
  const path = useMemo(() => sampleEyeTrajectory(createEye(() => .5), { power: 14, direction: { x: .8, y: -.6 } }), []);
  useEffect(() => {
    const timer = setInterval(() => setSeconds(s => s + 1), 1000);
    if (driver !== 'native') return () => clearInterval(timer);
    progress.setValue(0);
    const animation = Animated.loop(Animated.timing(progress, { toValue: 1, duration: path.duration * 1000,
      easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    animation.start();
    return () => { clearInterval(timer); animation.stop(); progress.stopAnimation(); };
  }, [driver, path, progress]);
  const Pupil = driver === 'native' ? Animated.View : View;
  const inputRange = path.samples.map(s => s.time / path.duration);
  const transform = driver === 'native' ? [
    { translateX: progress.interpolate({ inputRange, outputRange: path.samples.map(s => s.x * 32 * 1.08 * .42) }) },
    { translateY: progress.interpolate({ inputRange, outputRange: path.samples.map(s => s.y * 32 * 1.08 * .42) }) },
  ] : [{ translateY: 8 }];
  return <View collapsable={false} style={{ position: 'absolute', left: 280, top: 230, width: 720, height: 280, zIndex: 20,
    borderRadius: 28, borderWidth: 5, borderColor: TOKENS.ink, backgroundColor: TOKENS.paper }}>
    <Text style={{ fontFamily: 'Rubik', fontSize: 30, color: TOKENS.ink, margin: 30 }}>Studio ready · single {driver} eye · {seconds}s</Text>
    {driver==='sampled'?<View collapsable={false} style={{position:'absolute',left:300,top:100,width:120,height:120}}><SampledGooglyEyes eyes={[[60,60],[60,60],28]} size={120} target="eyes.probe" inherited={null} count={count}/></View>:Array.from({length:count},(_,index)=><View key={index} collapsable={false} style={{ position: 'absolute', left: 280 + index * 90, top: 130, width: 70, height: 70,
      borderRadius: 35, borderWidth: 3, borderColor: TOKENS.ink, backgroundColor: '#FFFFFF' }}>
      <Pupil collapsable={false} style={{ position: 'absolute', left: 32 * .46, top: 32 * .46, width: 32 * 1.08,
        height: 32 * 1.08, borderRadius: 32, backgroundColor: TOKENS.ink, transform }} />
    </View>)}
  </View>;
}
interface Playback {
  paths: [EyeTrajectory, EyeTrajectory]; duration: number; loop: boolean;
  startedAt: number; elapsed: number; playing: boolean;
}
const playback = (paths: Playback['paths'], loop = false): Playback => ({ paths,
  duration: Math.max(paths[0].duration, paths[1].duration), loop, startedAt: 0, elapsed: 0, playing: false });
const elapsedAt = (p: Playback) => p.elapsed + (p.playing ? (performance.now() - p.startedAt) / 1000 : 0);
const statesAt = (p: Playback): [EyeState, EyeState] => {
  const elapsed = elapsedAt(p);
  return [eyeAt(p.paths[0], elapsed, p.loop), eyeAt(p.paths[1], elapsed, p.loop)];
};

/** One core Animated clock per sticker. JS runs only at kicks, pauses and idle entry. */
export function SampledGooglyEyes({ eyes, size, target, parentMotion, inherited, count = 2 }: GooglyEyesProps & { inherited: EyeParentMotion | null; count?: number }): React.ReactElement {
  const session = useSession(), reduced = useReducedMotion();
  const [paused, setPaused] = useState(() => session.getView().paused);
  const [laidOut, setLaidOut] = useState(Platform.OS === 'web');
  const [progress] = useState(() => new Animated.Value(0));
  const [phase] = useState(() => Math.random() * Math.PI * 2);
  const [plan, setPlan] = useState(() => playback([sampleEyeTrajectory(createEye()), sampleEyeTrajectory(createEye())]));
  const current = useRef(plan), animation = useRef<Animated.CompositeAnimation>();
  const parents = useRef({ parentMotion, inherited, size }); parents.current = { parentMotion, inherited, size };
  const r = eyes[2] * size / 120;
  const table = useMemo(() => {
    const frames = Math.round(plan.duration * EYE_HZ), times = Array.from({ length: frames + 1 }, (_, i) => i / EYE_HZ);
    return { inputRange: times.map(t => t / plan.duration), paths: plan.paths.map(path => times.map(t => eyeAt(path, t))) };
  }, [plan]);
  const translations = useMemo(() => table.paths.map(path => ({ transform: [
    { translateX: progress.interpolate({ ...compactInterpolation(table.inputRange, path.map(e => e.x * r * 1.08 * .42), .02), extrapolate: 'clamp' }) },
    { translateY: progress.interpolate({ ...compactInterpolation(table.inputRange, path.map(e => e.y * r * 1.08 * .42), .02), extrapolate: 'clamp' }) },
  ] })), [table, progress, r]);

  useEffect(() => {
    const p = plan;
    if (!laidOut) return;
    let active = true;
    const elapsed = elapsedAt(p), offset = p.loop ? elapsed % p.duration : Math.min(p.duration, elapsed);
    progress.setValue(offset / p.duration);
    if (paused || reduced || (p.loop && idleLoopsOff())) return;
    p.elapsed = elapsed; p.startedAt = performance.now(); p.playing = true;
    const timing = (seconds: number) => Animated.timing(progress, { toValue: 1, duration: seconds * 1000,
      easing: Easing.linear, useNativeDriver: Platform.OS !== 'web', isInteraction: false });
    const loop = () => { animation.current = Animated.loop(timing(p.duration)); animation.current.start(); };
    if (p.loop && offset === 0) loop();
    else {
      animation.current = timing(p.duration - offset);
      animation.current.start(({ finished }) => {
        if (!active || !finished || current.current !== p) return;
        if (p.loop) { progress.setValue(0); loop(); }
        else {
          const states = statesAt(p), idle = playback([sampleEyeSway(states[0], phase), sampleEyeSway(states[1], phase + .7)], true);
          current.current = idle; setPlan(idle);
        }
      });
    }
    return () => {
      active = false; p.elapsed = elapsedAt(p); p.playing = false;
      animation.current?.stop(); progress.stopAnimation();
    };
  }, [plan, paused, reduced, progress, phase, laidOut]);

  useEffect(() => {
    const pending = new Set<unknown>();
    const kick = (power: number) => {
      const states = statesAt(current.current), parent = parents.current, now = frameClock.now();
      const before = parent.parentMotion?.(now - 1 / EYE_HZ) ?? parent.inherited?.(-1 / EYE_HZ);
      const position = parent.parentMotion?.(now) ?? parent.inherited?.();
      const impulse = before && position ? { x: position.x - before.x, y: position.y - before.y,
        width: 'width' in position && typeof position.width === 'number' ? position.width : parent.size } : undefined;
      const paths = states.map(state => sampleEyeTrajectory(state, { power,
        direction: { x: Math.random() * 2 - 1, y: Math.random() * 1.3 - 1 }, parentImpulse: impulse })) as Playback['paths'];
      animation.current?.stop();
      const next = playback(paths); current.current = next; setPlan(next);
    };
    const unsubscribe = session.cues(event => {
      const c = event.cue;
      if (c.k === 'pause') setPaused(c.paused);
      if (c.k === 'scene') setPaused(session.getView().paused);
      if (c.k === 'eyes' && (!c.target || !target || target.startsWith(c.target))) kick(c.power);
      if (c.k === 'slam' && c.target === target && c.eyesPower) {
        const timer = session.clock.setTimeout(() => { pending.delete(timer); kick(c.eyesPower); }, Math.max(0, event.at + c.impactAtMs - session.clock.now()));
        pending.add(timer);
      }
    });
    return () => { unsubscribe(); for (const timer of pending) session.clock.clearTimeout(timer); };
  }, [session, target]);

  return <>{eyes.slice(0, count).map((point, index) => {
    const p = point as [number, number];
    const scale=size/120, nativeId='eyes/native-white-r'+Number(r.toFixed(5)), exact=bitmapInfo[nativeId];
    const id=exact?nativeId:'eyes/white-r'+eyes[2], whiteScale=exact?1:scale, whiteBounds=bitmapInfo[id]!.logicalBounds;
    const bounds=bitmapInfo['eyes/pupil-r'+eyes[2]]!.logicalBounds;
    const left=p[0]*scale-r+bounds.x*scale, top=p[1]*scale-r+bounds.y*scale, width=bounds.width*scale, height=bounds.height*scale;
    return <React.Fragment key={index}>
      <Image source={bitmap(id)} resizeMode="stretch" style={{position:'absolute',left:p[0]*scale-r+whiteBounds.x*whiteScale,top:p[1]*scale-r+whiteBounds.y*whiteScale,width:whiteBounds.width*whiteScale,height:whiteBounds.height*whiteScale}}/>
      <Animated.View pointerEvents="none" testID={'eye-pupil:' + (target ?? 'sticker') + ':' + index} collapsable={false} onLayout={laidOut?undefined:()=>setLaidOut(true)} style={{ position: 'absolute', left, top, width, height, ...translations[index] }}>
        <Image source={bitmap('eyes/pupil-r'+eyes[2])} resizeMode="stretch" style={{width,height}}/>
      </Animated.View>
    </React.Fragment>;
  })}</>;
}
