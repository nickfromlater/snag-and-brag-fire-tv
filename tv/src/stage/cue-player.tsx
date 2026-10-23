import React, { useEffect, useRef, useState } from 'react';
import { speechPrepareDelay } from './speech-schedule';
import { Animated, Easing, Image, Platform, View } from '@amazon-devices/react-native-kepler';
import { TOKENS, clamp } from '@snag/shared';
import type { CueEvent, TvCue } from '@snag/shared';
import { AudioEngine } from './audio';
import { Timeline, periodicOffsets, meterTicks } from './tasks';
import { useSession, useTvView, resolveAnchor } from './context';
import { frameClock } from './frame-clock';
import { particleEngine } from './particles';
import { Badge, Box, Card, FindSticker, Motion, StrokedText } from './primitives';
import { bitmap } from './assets';
import { memoryPhotos, feedSlots } from './memory-images';
import { Reanimated, useSharedValue, useAnimatedStyle, withTiming, withSequence, cancelAnimation, NativeEasing } from './platform';
import { shakeOffset } from './effects';
import { setReducedMotion } from './motion-settings';
import { VoiceDirector, VOICE_DEADLINE_MS, NATIVE_VOICE_DEADLINE_MS } from './voice';
import { fireworkBesideName, layers } from './effect-layout';
import { displayWidth } from './display-math';
import { AudioReadyContext } from './audio-ready';
import { suppressNativeFinaleParticles } from './native-effects-policy';
import { diag } from './diag';
export let audioEngine: AudioEngine | undefined;
export let hostVoice: VoiceDirector | undefined;
export let cueControls: { probe(codec: 'wav' | 'ogg'): Promise<void>; effects(codec: 'wav' | 'ogg', ids?: readonly string[]): Promise<void>; reduced(value: boolean): void; suspend(): void } | undefined;
export class CueQueue {
  last = 0; private readonly pending = new Map<number, CueEvent>();
  constructor(private readonly consume: (event: CueEvent) => void) {}
  /** Duplicates are ignored; bursts can be delivered out of order. A late renderer sets seq. */
  reset(sequence = 0): void { this.last = sequence; this.pending.clear(); }
  push(event: CueEvent): void {
    if (event.seq <= this.last) return; this.pending.set(event.seq, event);
    while (this.pending.has(this.last + 1)) { const next = this.pending.get(++this.last)!; this.pending.delete(this.last); this.consume(next); }
  }
}
type FlightCue = Extract<TvCue, { k: 'fly-points' | 'sticker-flight' | 'vote' }>;
interface FlightRecord { id: number; cue: FlightCue }
function Flight({ record }: { record: FlightRecord }): React.ReactElement {
  const session = useSession(), view = useTvView(), c = record.cue, p = useRef(new Animated.Value(0)).current;
  const from = resolveAnchor(c.from), to = resolveAnchor(c.to), dx = to.x - from.x, dy = to.y - from.y;
  const team = view.teams.find(t => t.id === (c.k === 'vote' ? c.voter : c.team)), find = view.feeds.find(f => f.team === (c.k === 'vote' ? '' : c.team))?.find;
  const duration = c.durationMs, speed = (session.clock as { speed?: number }).speed ?? 1;
  useEffect(() => { const a = Animated.timing(p, { toValue: 1, duration: duration / speed, easing: Easing.bezier(.45, 0, c.k === 'sticker-flight' ? .3 : .4, 1), useNativeDriver: true }); a.start(); return () => a.stop(); }, []);
  const range = c.k === 'fly-points' ? [0, .2, .42, .72, 1] : [0, .5, 1], xs = c.k === 'fly-points' ? [0, 0, 0, dx * .45, dx] : [0, dx * .5, dx], ys = c.k === 'fly-points' ? [0, -44, -36, Math.min(dy * .45, 0) - 110, dy] : [0, dy * .5 - (c.k === 'sticker-flight' ? c.middle.arc : c.arc), dy];
  const scales = c.k === 'fly-points' ? [.2, 1.3, 1, .9, .42] : c.k === 'vote' ? [1, c.middleScale, c.endScale] : [1, c.middle.scale, Math.max(c.end.minScale, Math.min(to.width, to.height) * c.end.targetFill / 120)];
  useEffect(() => {
    if (c.k !== 'fly-points') return;
    const start = session.clock.now();
    const timer = setInterval(() => {
      const t = clamp((session.clock.now() - start) / duration, 0, 1); if (t * duration < c.trail.startMs || view.paused) return;
      particleEngine.add({ x: from.x + dx * t, y: from.y + dy * t - Math.sin(t * Math.PI) * 110, vx: Math.random() * 80 - 40, vy: Math.random() * 60 + 20, gravity: 200, drag: .96, w: 8 + Math.random() * 6, life: .45, color: team?.color ?? TOKENS.yolk });
    }, c.trail.intervalMs / speed);
    return () => clearInterval(timer);
  }, []);
  return <Animated.View style={{ position: 'absolute', left: from.x - 60, top: from.y - 40, width: 120, height: 100, zIndex: layers.effects, transform: [{ translateX: p.interpolate({ inputRange: range, outputRange: xs }) }, { translateY: p.interpolate({ inputRange: range, outputRange: ys }) }, { scale: p.interpolate({ inputRange: range, outputRange: scales }) }, { rotate: p.interpolate({ inputRange: range, outputRange: c.k === 'fly-points' ? ['-25deg', '-6deg', '-6deg', '6deg', '0deg'] : c.k === 'sticker-flight' ? ['0deg', '-200deg', '-360deg'] : ['0deg', '-12deg', '0deg'] }) }] }}>
    {c.k === 'fly-points' ? <Card width={140} height={72} fill={team?.color ?? TOKENS.yolk} radius={999} border={5} shadow={6}><View style={{ paddingTop: 9 }}><StrokedText text={'+' + c.pts} size={46} color={TOKENS.ink} stroke={0} shadow={0} width={130} align="center" /></View></Card> : c.k === 'vote' && team ? <Badge team={team} size={44} /> : find ? <FindSticker find={{ ...find, eyes: c.k === 'sticker-flight' && !c.eyes ? undefined : find.eyes }} size={120} /> : null}
  </Animated.View>;
}
export function CuePlayer({ children }: { children: React.ReactNode }): React.ReactElement {
  const session = useSession(), view = useTvView(), shake = useRef(new Animated.Value(0)).current, flash = useRef(new Animated.Value(0)).current, zoom = useRef(new Animated.Value(1)).current;
  const amplitude=useRef(new Animated.Value(12)).current;
  const nativeShake=useSharedValue(0), nativeAmplitude=useSharedValue(0), nativeZoom=useSharedValue(1), nativeFlash=useSharedValue(0);
  // The world wraps the whole show: an identity transform on it is not free on the stick, so
  // the transform exists only while a shake or zoom is running.
  const nativeWorldStyle=useAnimatedStyle(()=>{const x=shakeOffset(nativeShake.value,nativeAmplitude.value),k=nativeZoom.value;return x===0&&k===1?{transform:[]}:{transform:[{translateX:x},{scale:k}]};});
  const nativeFlashStyle=useAnimatedStyle(()=>({opacity:nativeFlash.value}));
  const [flights, setFlights] = useState<FlightRecord[]>([]), timeline = useRef(new Timeline(session.clock)).current, phaseTasks = useRef(new Set<number>());
  const [flashing,setFlashing]=useState(false);
  const resetPresentation = useRef<() => void>(() => {});
  useEffect(() => { resetPresentation.current(); }, [session.presentationRevision]);
  useEffect(() => { frameClock.paused = view.paused; audioEngine?.pause(view.paused); hostVoice?.pause(view.paused); }, [view.paused]);
  const [audioReady,setAudioReady]=useState(false);
  const scoped = (ms: number, fn: () => void) => { let id = 0; id = timeline.after(ms, () => { phaseTasks.current.delete(id); fn(); }); phaseTasks.current.add(id); };
  useEffect(() => {
    let mounted = true;
    particleEngine.particles.length = 0;
    const engine = new AudioEngine((kind, fields) => session.telemetry(kind, fields)); audioEngine = engine;
    const voice = session.speech ? new VoiceDirector(session.speech, engine, () => performance.now(),
      (kind, fields) => session.telemetry(kind, fields), (text, ms) => session.speechTiming?.(text, ms),
      { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: h => clearTimeout(h as ReturnType<typeof setTimeout>) }, Platform.OS === 'web' ? VOICE_DEADLINE_MS : NATIVE_VOICE_DEADLINE_MS) : undefined;
    hostVoice = voice;
    let preparation: ReturnType<typeof setTimeout> | undefined;
    // Never attach the next voice clip while a scene or phase is entering (speech-schedule.ts).
    let enteredAt = -Infinity;
    const prepareNext = (delay = 0) => { if (preparation) return; preparation = setTimeout(() => {
      preparation = undefined; const wait = speechPrepareDelay(enteredAt, performance.now());
      if (Platform.OS !== 'web' && wait > 0) { prepareNext(wait); return; }
      const clip = session.speech?.upcoming(); if (clip) engine.prepareSpeech(clip.uri, clip.nativeAudio, clip.durationMs); }, delay); };
    const stopPreparation = session.speech?.subscribe(() => prepareNext()); prepareNext();
    const initial = session.getView(); engine.settings(initial.sound, initial.music); voice?.settings(initial.sound, initial.voice ?? true);
    frameClock.paused = initial.paused; engine.pause(initial.paused); voice?.pause(initial.paused);
    cueControls = { probe: codec => engine.probeCodec(codec), effects: (codec, ids) => engine.probeEffects(codec, ids), reduced: value => { setReducedMotion(value); particleEngine.reduced = value; }, suspend: () => { voice?.stop('background'); void engine.dispose(); } };
    void engine.preload().then(() => { if (mounted) setAudioReady(true); return engine.mood(session.getView().musicMood); });
    let serial = 0;
    const consume = (event: CueEvent) => {
      const c = event.cue;
      if (c.k === 'scene' || c.k === 'phase') enteredAt = performance.now();
      if (Platform.OS !== 'web' && suppressNativeFinaleParticles(session.getView().scene)
        && ['confetti', 'stars', 'ring', 'reaction', 'mash-spark', 'firework'].includes(c.k)) return;
      if (c.k === 'pause') { frameClock.paused = c.paused; engine.pause(c.paused); voice?.pause(c.paused); if (c.paused) { timeline.pause(); shake.stopAnimation(); zoom.stopAnimation(); flash.stopAnimation(); cancelAnimation(nativeShake);cancelAnimation(nativeZoom);cancelAnimation(nativeFlash); } else timeline.resume(); }
      else if (c.k === 'settings') { engine.settings(c.sound, c.music); voice?.settings(c.sound, c.voice ?? true); }
      else if (c.k === 'host') {
        const current = session.getView(); voice?.settings(current.sound, current.voice ?? true);
        voice?.start(event.seq, c);
      }
      else if (c.k === 'host-finish') voice?.finish(c.forced);
      else if (c.k === 'host-hide') voice?.stop();
      else if (c.k === 'music') void engine.mood(c.mood);
      else if (c.k === 'sfx') scoped(c.delayMs, () => { void engine.play(c.name, c.args); });
      else if (c.k === 'scene') { voice?.stop('scene'); phaseTasks.current.forEach(id => timeline.cancel(id)); phaseTasks.current.clear(); setFlights([]); setFlashing(false); particleEngine.clear(); }
      else if (c.k === 'game-ended') { voice?.stop('game-ended'); memoryPhotos.clear(); feedSlots.clear(); particleEngine.clear(); }
      else if (c.k === 'slam') scoped(c.impactAtMs, () => {
        if (c.sound) void engine.play('slam');
        if (c.shakePx) consume({ ...event, cue: { k: 'shake', px: c.shakePx, durationMs: c.shakeMs, steps: 8, easing: 'linear' } });
        if (c.ring && !(Platform.OS !== 'web' && suppressNativeFinaleParticles(session.getView().scene))) { const bounds = resolveAnchor({target:c.target}), radius = Math.max(c.ringMinRadius,bounds.width*c.ringWidthFactor); particleEngine.cue({ k: 'ring', at: {target:c.target}, color:c.ringColor, radius:c.target==='intro.title'?Math.min(radius,bounds.height*1.05):radius, lifeMs:500, recipe:{startRadius:.2,radiusGrowth:.9,startWidth:16,endWidth:2} }); }
      });
      else if (c.k === 'shake' && !frameClock.reducedMotion) {
        if(Platform.OS==='web'){amplitude.setValue(c.px); shake.setValue(0); Animated.timing(shake, { toValue: 1, duration: c.durationMs / ((session.clock as { speed?: number }).speed ?? 1), useNativeDriver: false, easing: Easing.linear }).start();}
        else{nativeAmplitude.value=c.px;nativeShake.value=0;nativeShake.value=withTiming(1,{duration:c.durationMs/((session.clock as {speed?:number}).speed??1),easing:NativeEasing.linear});}
      } else if (c.k === 'flash') {
        setFlashing(true);scoped(c.durationMs,()=>setFlashing(false));
        if(Platform.OS==='web'){flash.setValue(c.opacity); Animated.timing(flash, { toValue: 0, duration: c.durationMs, useNativeDriver: false }).start();}
        else{nativeFlash.value=c.opacity;nativeFlash.value=withTiming(0,{duration:c.durationMs,easing:NativeEasing.linear});}
      }
      else if (c.k === 'punch' && !frameClock.reducedMotion) {
        if(Platform.OS==='web')Animated.sequence([Animated.timing(zoom, { toValue: c.scale, duration: c.durationMs / 2, useNativeDriver: false }), Animated.timing(zoom, { toValue: 1, duration: c.durationMs / 2, useNativeDriver: false })]).start();
        else nativeZoom.value=withSequence(withTiming(c.scale,{duration:c.durationMs/2}),withTiming(1,{duration:c.durationMs/2}));
      }
      else if (c.k === 'confetti') scoped(c.delayMs, () => particleEngine.cue(c));
      else if (c.k === 'stars' || c.k === 'ring' || c.k === 'reaction' || c.k === 'mash-spark') particleEngine.cue(c);
      else if (c.k === 'firework') {
        const current = session.getView(), id = current.content.k === 'champ' ? current.content.ranking[0] : undefined;
        const champion = current.teams.find(t => t.id === id);
        const size = Math.round(clamp(1300 / Math.max(8, champion?.name.length ?? 8), 58, 104));
        const width = displayWidth(champion?.name ?? '', size, 1) + 28;
        const safe = champion ? fireworkBesideName(c, { x: (1280 - width) / 2, width }) : c;
        particleEngine.cue(safe); scoped(safe.rocket.durationMs, () => { particleEngine.burst(safe); void engine.play(safe.burst.sound); });
      }
      else if (c.k === 'fly-points' || c.k === 'vote' || c.k === 'sticker-flight') {
        const id = ++serial, delay = 'delayMs' in c ? c.delayMs : 0;
        scoped(delay, () => { setFlights(old => old.concat({ id, cue: c }).slice(-12)); scoped(c.durationMs, () => setFlights(old => old.filter(f => f.id !== id))); });
      } else if (c.k === 'reel') for (const at of c.tickAtMs) scoped(at, () => { void engine.play('tick'); });
      else if (c.k === 'meter') for (const tick of meterTicks(c.durationMs, c.ticks.probability)) scoped(tick.at, () => { void engine.play(c.ticks.name, [tick.progress]); });
      else if (c.k === 'roll') for (const at of periodicOffsets(c.durationMs, c.tickMs)) scoped(at, () => { void engine.play(c.sound); });
    };
    // Snapshot is authoritative; previous transient effects are not replayed when mounting late.
    const queue = new CueQueue(consume);
    resetPresentation.current = () => {
      first = true; queue.reset(); timeline.clear(); phaseTasks.current.clear(); setFlights([]); setFlashing(false); particleEngine.clear(); voice?.stop('reset');
      shake.stopAnimation(); zoom.stopAnimation(); flash.stopAnimation(); shake.setValue(0); zoom.setValue(1); flash.setValue(0);
      cancelAnimation(nativeShake); cancelAnimation(nativeZoom); cancelAnimation(nativeFlash); nativeShake.value = 0; nativeZoom.value = 1; nativeFlash.value = 0;
    };
    const latestHost = session.latestHost?.();
    if (initial.host.visible && latestHost?.cue.k === 'host') voice?.start(latestHost.seq, latestHost.cue, Math.max(0, session.clock.now() - latestHost.cue.startedAt));
    let first = true;
    const stop = session.cues(event => { if (first || event.seq === 1) { queue.reset(event.seq - 1); first = false; if (event.seq === 1) { engine.clearPreparedSpeech(); voice?.stop('reset'); voice?.pause(false); voice?.settings(true, true); frameClock.paused = false; engine.pause(false); engine.settings(true, true); prepareNext(); } } queue.push(event); });
    return () => { mounted = false; stop(); stopPreparation?.(); clearTimeout(preparation); voice?.stop('disposed'); timeline.clear(); cancelAnimation(nativeShake);cancelAnimation(nativeZoom);cancelAnimation(nativeFlash);void engine.dispose(); if (audioEngine === engine) audioEngine = undefined; if (hostVoice === voice) hostVoice = undefined; };
  }, [session]);
  const World=Platform.OS==='web'?Animated.View:diag.worldView?View:Reanimated.View;
  return <AudioReadyContext.Provider value={audioReady}><World collapsable={false} style={[{ position: 'absolute',left:0,top:0,width: 1280, height: 720,...(diag.worldNoZ?{}:{zIndex:5}) },Platform.OS==='web'?{transform:[{ translateX: Animated.multiply(amplitude,shake.interpolate({ inputRange: [0, .125, .25, .375, .5, .625, .75, .875, 1], outputRange: [0, -1, .833, -.667, .5, -.333, .25, -.083, 0] })) }, { scale: zoom }]}:(diag.worldPlain||diag.worldView?{}:nativeWorldStyle)]}>
    {children}
    {flashing&&<World pointerEvents="none" style={[{ position: 'absolute',left:0,top:0,width: 1280, height: 720, backgroundColor: '#FFFFFF',zIndex:layers.effects },Platform.OS==='web'?{opacity:flash}:nativeFlashStyle]} />}
    {flights.map(f => <Flight key={f.id} record={f} />)}
    {view.transition && <Motion target="wipe" x={-400} y={-300} width={2100} height={1320} style={{zIndex:layers.effects}}><View style={{ flex: 1, flexDirection: 'row' }}>{[.35, .25, 1.4, .25, .35].map((flex, i) => <View key={i} style={{ flex, backgroundColor: i === 2 ? TOKENS.ink : i % 2 ? TOKENS.bubble : TOKENS.yolk, justifyContent: 'center', alignItems: 'center' }}>{i === 2 && <View style={{ flexDirection: 'row', alignItems: 'center', transform: [{ rotate: '14deg' }, { scale: .8 }] }}>{/* pre-rendered logo rasters on native: live 150 px text paths stalled the sweep on the stick */}<StrokedText text="SNAG" size={188} color={TOKENS.yolk} stroke={14} shadow={10} spacing={1} /><StrokedText text="&" size={96} color={TOKENS.bubble} stroke={5} shadow={0} spacing={1} /><StrokedText text="BRAG" size={188} color={TOKENS.bubble} stroke={14} shadow={10} spacing={1} /></View>}</View>)}</View></Motion>}
  </World></AudioReadyContext.Provider>;
}
