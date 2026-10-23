import { mutate } from './mutate';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Text, View } from '@amazon-devices/react-native-kepler';
import { TOKENS, clamp } from '@snag/shared';
import type { TvView } from '@snag/shared';
import { bitmap } from './assets';
import { Bitmap, Card, Label, Motion } from './primitives';
import { diag } from './diag';
import { useSession, useTvView } from './context';
import { layers as paintLayers } from './effect-layout';
import { frameClock } from './frame-clock';
import { audioEngine, hostVoice } from './cue-player';
import { smoothJaw } from './speech-track';
import { Reanimated, useSharedValue, useAnimatedStyle } from './platform';
import { idleLoopsOff } from './motion-settings';
const PuppetView = Platform.OS === 'web' ? View : Reanimated.View;
const initialFace = { jaw: 0, lid: 0, mouth: 0, reaction: 0, talking: false, reduced: false };
const layers = ['lower', 'upper', 'white-left', 'white-right', 'pupil-left', 'pupil-right', 'lid-left-closed', 'lid-right-closed', 'happy', 'monocle'];
export function boldSegments(text: string, characters = Infinity): { text: string; bold: boolean }[] {
  let bold = false, remaining = characters; const parts: { text: string; bold: boolean }[] = [];
  for (const part of text.split('**')) { const shown = part.slice(0, Math.max(0, remaining)); if (shown) parts.push({ text: shown, bold }); remaining -= part.length; bold = !bold; }
  return parts;
}
// Vega stalls on per-frame React renders and shared-value writes: the bubble reveals whole words at
// most ~8 times a second and the face updates at most ~12 times a second (puppet animation on twos).
const REVEAL_INTERVAL = .12, FACE_INTERVAL = .08;
const loopSamples = <T,>(count: number, f: (phase: number) => T): T[] => Array.from({ length: count + 1 }, (_, k) => f(2 * Math.PI * k / count));
const LOOP_IN = Array.from({ length: 25 }, (_, k) => k / 24);
const SWAY = { ms: 2 * Math.PI / 1.6 * 1000, out: loopSamples(24, a => Math.sin(a) * 2.5 + 'deg') };
const PUPIL_X = { ms: 2 * Math.PI / .7 * 1000, out: loopSamples(24, a => Math.sin(a) * 3) };
const PUPIL_Y = { ms: 2 * Math.PI / 1.3 * 1000, out: loopSamples(24, a => Math.cos(a) * 2) };
function useNativeLoop(durationMs: number, active: boolean): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration: durationMs, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    loop.start(); return () => loop.stop();
  }, [active]);
  return value;
}
export function revealedCharacters(text: string, characters: number): number {
  if (characters >= text.length) return text.length;
  const space = text.lastIndexOf(' ', characters);
  return space < 0 ? 0 : space;
}
/** Screens whose headline already says what the host says: the voice carries on, the bubble stays off
 *  so it doesn't stack a fourth layer (fresh-eye review, Oct 20). */
export function headlineSaysIt(view: TvView): boolean {
  const c = view.content;
  return view.phase === 'title' || view.phase === 'reel' || view.phase === 'countdown' || view.phase === 'knockout' || view.phase === 'vote'
    || (c?.k === 'judge' && !!c.banner) || (c?.k === 'show' && !!c.winner);
}
export function Host(): React.ReactElement {
  const view = useTvView(), session = useSession(), model = useRef(view.host); model.current = view.host;
  const upper = useRef<View>(null), lower = useRef<View>(null), puppet = useRef<View>(null), pupils = useRef<unknown[]>([]), lids = useRef<unknown[]>([]), monocle = useRef<View>(null);
  const mouth = useRef<View>(null), tongue = useRef<View>(null), open = useRef(0), lid = useRef(0), blink = useRef({ next: 2.5, remaining: 0 }), lastVoice = useRef(-1), [characters, setCharacters] = useState(0);
  const cachedCharacters = useRef(-1), lastReveal = useRef(-Infinity), lastFaceAt = useRef(-Infinity);
  const drawn = useRef({ jaw: NaN, lid: NaN, mouth: -1, shock: false, initialized: false });
  const face = useSharedValue(initialFace), idle = Platform.OS !== 'web' && !view.paused && !frameClock.reducedMotion && !idleLoopsOff();
  const sway = useNativeLoop(SWAY.ms, idle && !diag.noSway), pupilX = useNativeLoop(PUPIL_X.ms, idle && !diag.noDrift), pupilY = useNativeLoop(PUPIL_Y.ms, idle && !diag.noDrift);
  const swayStyle = { transform: [{ rotate: sway.interpolate({ inputRange: LOOP_IN, outputRange: SWAY.out }) }] };
  const driftStyle = { transform: [{ translateX: pupilX.interpolate({ inputRange: LOOP_IN, outputRange: PUPIL_X.out }) }, { translateY: pupilY.interpolate({ inputRange: LOOP_IN, outputRange: PUPIL_Y.out }) }] };
  const lastFace = useRef(initialFace);
  const pupilStyle = useAnimatedStyle(() => ({ transform: [{ scale: face.value.reaction === 2 ? .55 : 1 }] }));
  const lowerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: face.value.jaw * 14 }] }));
  const upperStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -face.value.jaw * 5 }] }));
  const lidStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: face.value.lid }], opacity: face.value.lid ? 1 : 0 }));
  const mouthStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -(face.value.mouth % 8) * 118 }, { translateY: -Math.floor(face.value.mouth / 8) * 48 }] }));
  const tongueStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -(face.value.mouth % 8) * 56 }, { translateY: -Math.floor(face.value.mouth / 8) * 24 }] }));
  const monocleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: face.value.reaction === 2 ? 5 : 0 }, { translateY: face.value.reaction === 2 ? -14 : 0 }, { rotate: face.value.reaction === 2 ? '16deg' : '0deg' }] }));
  // A held director seek paints the supplied typing position before the shared
  // animation clock is paused. Ordinary rooms continue to use the voice track.
  useEffect(() => {
    if (!view.paused) return;
    const text = (view.host.line?.text ?? '').replace(/\*\*/g, '');
    const chars = view.host.typing ? Math.min(text.length, Math.max(0, Math.floor((session.clock.now() - (view.host.startedAt ?? session.clock.now())) / 34) * 2)) : text.length;
    cachedCharacters.current = chars; setCharacters(chars);
  }, [view.paused, view.host.line?.text, view.host.startedAt]);
  useEffect(() => frameClock.subscribe((dt, time) => {
    if (frameClock.paused) return;
    const host = model.current, full = host.line?.text ?? '', text = full.replace(/\*\*/g, ''), speech = hostVoice?.frame(full);
    const chars = speech?.characters ?? (host.typing ? Math.min(text.length, Math.floor((session.clock.now() - (host.startedAt ?? session.clock.now())) / 34) * 2) : text.length);
    const shown = revealedCharacters(text, chars);
    if (shown !== cachedCharacters.current && (shown >= text.length || time - lastReveal.current >= REVEAL_INTERVAL)) { lastReveal.current = time; cachedCharacters.current = shown; setCharacters(shown); }
    const beat = Math.floor(chars / 4);
    if (!speech && host.typing && beat !== lastVoice.current && chars > 0 && dt) { lastVoice.current = beat; void audioEngine?.play('voice'); }
    if (!dt) return;
    blink.current.next -= dt; blink.current.remaining -= dt;
    if (blink.current.next <= 0) { blink.current.remaining = .13; blink.current.next = 2.2 + Math.random() * 2.8; }
    const talking = speech?.talking ?? host.typing;
    const mood = host.reaction, base = mood === 'shock' ? .8 : mood === 'glee' ? .5 : 0, target = speech?.target ?? (host.typing ? chars % 4 === 0 ? .4 + Math.random() * .6 : Math.random() * .35 : 0);
    open.current = smoothJaw(open.current, Math.max(target, base), dt, talking);
    lid.current += ((mood === 'glee' || blink.current.remaining > 0 ? 1 : 0) - lid.current) * Math.min(1, dt * (blink.current.remaining > 0 ? 45 : 16));
    const amount = Math.round(clamp(open.current, 0, 1) * 8) / 8, mouthFrame = Math.round(amount * 32), lidAmount = lid.current < .04 ? 0 : Math.round(lid.current * 4) / 4;
    if (Platform.OS !== 'web') {
      const next = { jaw: amount, lid: lidAmount, mouth: mouthFrame, reaction: mood === 'shock' ? 2 : mood === 'glee' ? 1 : 0, talking, reduced: frameClock.reducedMotion }, previous = lastFace.current;
      const changed = next.jaw !== previous.jaw || next.lid !== previous.lid || next.mouth !== previous.mouth, state = next.reaction !== previous.reaction || next.talking !== previous.talking || next.reduced !== previous.reduced;
      if (state || (changed && time - lastFaceAt.current >= FACE_INTERVAL)) { lastFaceAt.current = time; lastFace.current = next; face.value = next; }
      return;
    }
    const previous = drawn.current;
    if (!previous.initialized || Math.abs(amount - previous.jaw) > .001) {
      mutate(lower.current, { style: { transform: [{ translateY: amount * 14 }] } });
      mutate(upper.current, { style: { transform: [{ translateY: -amount * 5 }] } });
      previous.jaw = amount;
    }
    const sway = frameClock.reducedMotion ? 0 : Math.sin(time * 1.6) * 2.5 + (talking ? Math.sin(time * 9) * 1.6 : 0) + (mood === 'glee' ? Math.sin(time * 16) * 4 : 0) + (mood === 'shock' ? Math.sin(time * 40) * 1.2 : 0);
    mutate(puppet.current, { style: { transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: sway + 'deg' }] } });
    const shift = [{ translateX: Math.sin(time * .7) * 3 }, { translateY: Math.cos(time * 1.3) * 2 }, { scale: mood === 'shock' ? .55 : 1 }];
    pupils.current.forEach(p => mutate(p, { style: { transform: shift } }));
    if (!previous.initialized || previous.lid !== lidAmount) { lids.current.forEach(p => mutate(p, { style: { transform: [{ scaleY: lidAmount }], opacity: lidAmount ? 1 : 0 } })); previous.lid = lidAmount; }
    if (!previous.initialized || previous.mouth !== mouthFrame) {
      mutate(mouth.current, { style: { transform: [{ translateX: -(mouthFrame % 8) * 118 }, { translateY: -Math.floor(mouthFrame / 8) * 48 }] } });
      mutate(tongue.current, { style: { transform: [{ translateX: -(mouthFrame % 8) * 56 }, { translateY: -Math.floor(mouthFrame / 8) * 24 }] } });
      previous.mouth = mouthFrame;
    }
    const shock = mood === 'shock';
    if (!previous.initialized || previous.shock !== shock) { mutate(monocle.current, { style: { transform: shock ? [{ translateX: 5 }, { translateY: -14 }, { rotate: '16deg' }] : [] } }); previous.shock = shock; }
    previous.initialized = true;
  }, 30), []);
  // Typing changes only the speech bubble. Keep the puppet/native animation
  // subtree stable until its expression or brow changes.
  const puppetElement = useMemo(() => (
    <Motion target="host" x={30} y={520} width={200} height={200} style={{ zIndex: paintLayers.host }}>
      {/* An axis-aligned clip (a scissor) only: a rotated, rounded clip around the
          moving puppet cost the stick about 9 fps every frame. */}
      <View style={{ position: 'absolute', width: 180, height: 168, overflow: 'hidden' }}>
        <Image source={bitmap('host/frame-back')} style={{ position: 'absolute', width: 180, height: 176 }} />
        <View style={{ position: 'absolute', left: 8, top: 6, width: 164, height: 197, transform: [{ scale: .82 }, { translateX: -18 }, { translateY: -22 }] }}>
          <Animated.View ref={puppet} style={[{ position: 'absolute', width: 200, height: 240 }, Platform.OS !== 'web' && swayStyle]}>
            <PuppetView ref={lower} style={Platform.OS !== 'web' ? lowerStyle : undefined}><Bitmap id="host/lower" /></PuppetView>
            <View style={{ position: 'absolute', left: 43, top: 113, width: 118, height: 48, overflow: 'hidden' }}><PuppetView ref={mouth} style={[{ position: 'absolute', width: 944, height: 240 }, Platform.OS !== 'web' && mouthStyle]}><Image source={bitmap('host/mouth-atlas')} style={{ width: 944, height: 240 }}/></PuppetView></View>
            <View style={{ position: 'absolute', left: 84, top: 122, width: 56, height: 24, overflow: 'hidden' }}><PuppetView ref={tongue} style={[{ position: 'absolute', width: 448, height: 120 }, Platform.OS !== 'web' && tongueStyle]}><Image source={bitmap('host/tongue-atlas')} style={{ width: 448, height: 120 }}/></PuppetView></View>
            <PuppetView ref={upper} style={[{ position: 'absolute', width: 200, height: 240 }, Platform.OS !== 'web' && upperStyle]}>
              <Bitmap id="host/upper" /><Bitmap id="host/white-left" /><Bitmap id="host/white-right" />
              {['left', 'right'].map((side, i) => <Animated.View key={side} ref={r => { pupils.current[i] = r; }} style={[{ position: 'absolute', width: 200, height: 240 }, Platform.OS !== 'web' && driftStyle]}><PuppetView style={[{ position: 'absolute', width: 200, height: 240 }, Platform.OS !== 'web' && pupilStyle]}><Bitmap id={'host/pupil-' + side} /></PuppetView></Animated.View>)}
              {['left', 'right'].map((side, i) => <PuppetView key={side} ref={r => { lids.current[i] = r; }} style={[{ position: 'absolute', width: 200, height: 240, opacity: 0 }, Platform.OS !== 'web' && lidStyle]}><Bitmap id={'host/lid-' + side + '-closed'} /></PuppetView>)}
              {view.host.reaction === 'glee' && <Bitmap id="host/happy" />}
              <Bitmap id={'host/brow-' + (view.host.line?.brow ?? 'norm') + '-left'} /><Bitmap id={'host/brow-' + (view.host.line?.brow ?? 'norm') + '-right'} />
              <PuppetView ref={monocle} style={[{ position: 'absolute', width: 200, height: 240 }, Platform.OS !== 'web' && monocleStyle]}><Bitmap id="host/monocle" /></PuppetView>
            </PuppetView>
          </Animated.View>
        </View>
        <Image source={bitmap('host/frame-front')} style={{ position: 'absolute', width: 180, height: 176 }} />
      </View>
      <View style={{ position: 'absolute', left: 14, top: 142, width: 206, height: 30, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: TOKENS.ink, transform: [{ rotate: '-3deg' }] }}><Label weight={900} size={16} lines={1} color={TOKENS.yolk} style={{ letterSpacing: 2 }}>SIR SOCKSWORTH</Label></View>
    </Motion>
  ), [view.host.reaction, view.host.line?.brow]);
  const full = view.host.line?.text ?? '', visible = view.host.visible && !headlineSaysIt(view);
  const shownCharacters = session.capture && view.paused ? full.replace(/\*\*/g, '').length : characters;
  // The reference bubble width is 720 + borders. Height grows to the number of wrapped lines.
  return <>
    {puppetElement}
    {visible && <View style={{ position: 'absolute', zIndex: paintLayers.host, left: 226, bottom: 42, width: 720, minHeight: 92, paddingHorizontal: 26, paddingTop: 16, paddingBottom: 18, borderWidth: 5, borderRadius: 26, borderColor: TOKENS.ink, backgroundColor: TOKENS.paper, shadowColor: TOKENS.ink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 1, shadowRadius: 0 }}>
      <View style={{ position: 'absolute', left: -22, top: 30, width: 30, height: 30, backgroundColor: TOKENS.paper, borderLeftWidth: 5, borderBottomWidth: 5, borderColor: TOKENS.ink, transform: [{ skewY: '-30deg' }, { rotate: '10deg' }] }} />
      <Text style={{ fontFamily: 'Rubik', color: TOKENS.ink, fontSize: 27, lineHeight: 32.94 }}>{boldSegments(full, shownCharacters).map((p, i) => <Text key={i} style={{ color: p.bold ? TOKENS.bubble : TOKENS.ink }}>{p.text}</Text>)}</Text>
    </View>}
  </>;
}
