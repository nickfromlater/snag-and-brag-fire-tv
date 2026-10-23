import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, View } from '@amazon-devices/react-native-kepler';
import { TOKENS } from '@snag/shared';
import type { RemoteKey, TvMenu } from '@snag/shared';
import { useTVEventHandler } from './platform';
import { useSession, useTvView } from './context';
import { Card, Label, StrokedText } from './primitives';
import { layers } from './effect-layout';
import { frameClock } from './frame-clock';
import { cueControls } from './cue-player';
import { config } from '../config';
export const PERF_SEQUENCE = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'];
export function remoteKey(type: string): RemoteKey | undefined {
  return ({ select: 'select', back: 'back', playpause: 'playpause', skip_forward: 'ff', fastforward: 'ff', up: 'up', down: 'down', left: 'left', right: 'right' } as Record<string, RemoteKey>)[type];
}
export function Remote({ onDebug, onPerf, onFrames, frames }: { onDebug(): void; onPerf(): void; onFrames(): void; frames: boolean }): React.ReactElement {
  const session = useSession(), view = useTvView(), [debug, setDebug] = useState(false), [settings, setSettings] = useState(false), [focus, setFocus] = useState(0), [reduced, setReduced] = useState(frameClock.reducedMotion);
  const current = useRef({ debug, settings, focus, view }); current.current = { debug, settings, focus, view };
  const sequence = useRef<string[]>([]), lastBack = useRef(0);
  const dispatch = (key: RemoteKey) => {
    const s = current.current;
    if (key === 'back') { const now = performance.now(); if (now - lastBack.current < 100) return; lastBack.current = now; }
    sequence.current.push(key); sequence.current = sequence.current.slice(-PERF_SEQUENCE.length);
    if (config.debug && sequence.current.join(',') === PERF_SEQUENCE.join(',')) { onPerf(); sequence.current = []; return; }
    if(s.debug){
      if(key==='back'||key==='playpause'){setDebug(false);return;}
      if(key==='down'||key==='right')setFocus((s.focus+1)%5);
      if(key==='up'||key==='left')setFocus((s.focus+4)%5);
      if(key==='select'){if(s.focus===0){setDebug(false);onDebug();}else if(s.focus===1)onPerf();else if(s.focus===2)onFrames();else if(s.focus===3){const v=!frameClock.reducedMotion;cueControls?.reduced(v);setReduced(v);}else setDebug(false);}
      return;
    }
    if (s.settings) {
      if (key === 'back' || key === 'playpause') { setSettings(false); return; }
      if (key === 'down' || key === 'right') setFocus((s.focus + 1) % 5);
      else if (key === 'up' || key === 'left') setFocus((s.focus + 4) % 5);
      else if (key === 'select') {
        if (s.focus === 3) { const value = !frameClock.reducedMotion; cueControls?.reduced(value); setReduced(value); }
        else if (s.focus === 4) setSettings(false);
        else {
          const target = s.focus + 2, menu = session.getView().menu;
          if (!menu || target >= menu.options.length) return;
          const moves = (target - menu.focus + menu.options.length) % menu.options.length;
          for (let i = 0; i < moves; i++) session.remote('down');
          session.remote('select');
        }
      }
      return;
    }
    if (key === 'select' && s.view.menu?.kind === 'lobby' && s.view.menu.focus >= 2) { setFocus(0); setSettings(true); return; }
    session.remote(key);
    if (s.view.menu?.kind === 'lobby' && ['up', 'down', 'left', 'right'].includes(key)) for (let i = 0; i < s.view.menu.options.length && (session.getView().menu?.focus ?? 0) > 2; i++) session.remote(key);
  };
  useTVEventHandler(event => {
    const e = event as { eventType: string; eventKeyAction?: number };
    if (e.eventKeyAction !== undefined && e.eventKeyAction !== 0) return;
    // Vega also emits hardwareBackPress for this key. Its callback can arrive
    // hundreds of milliseconds later; use one source so Back cannot undo itself.
    if (e.eventType === 'back' && Platform.OS !== 'web') return;
    if (e.eventType === 'menu') {
      setFocus(0);
      if (config.debug) setDebug(!current.current.debug);
      else {
        const core = session.getView();
        if (core.menu?.kind === 'confirm-end') session.remote('back');
        else if (!core.menu) session.remote(core.phase === 'lobby' ? 'select' : 'playpause');
        setSettings(!current.current.settings);
      }
      return;
    }
    const key = remoteKey(e.eventType); if (key) dispatch(key);
  });
  useEffect(() => { const s = BackHandler.addEventListener('hardwareBackPress', () => { dispatch('back'); return true; }); return () => s.remove(); }, []);
  const menu = debug ? {kind:'debug',options:['Workload benchmark','Performance HUD','Frame clock','Reduced motion','Back'],focus} : settings ? { kind: 'settings', options: ['Sound', 'Music', 'Voice', 'Reduced motion', 'Back'], focus } : view.menu ? { ...view.menu, options: view.menu.kind === 'lobby' ? view.menu.options.slice(0, 2).concat('Settings') : view.menu.options, focus: view.menu.kind === 'lobby' ? Math.min(2, view.menu.focus) : view.menu.focus } : null;
  if (!menu) return <></>;
  return <View style={{ position: 'absolute', zIndex: layers.menu, width: 1280, height: 720, backgroundColor: 'rgba(14,11,43,.72)', alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 560, height: 150 + menu.options.length * 66 }}><Card width={560} height={150 + menu.options.length * 66} radius={28} shadow={10}><View style={{ padding: 28, gap: 10 }}><StrokedText text={menu.kind==='debug'?'Studio tools':menu.kind === 'lobby' ? 'Join the show' : menu.kind === 'settings' ? 'Settings' : menu.kind === 'confirm-end' ? 'End the show?' : 'Show paused'} size={48} color={TOKENS.ink} stroke={0} shadow={0} />
      {menu.options.map((label, i) => <View key={label} focusable={true} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: i === menu.focus }} style={{ height: 56, borderRadius: 15, borderWidth: 4, borderColor: i === menu.focus ? TOKENS.yolk : 'transparent', backgroundColor: i === menu.focus ? TOKENS.ink : '#F1E5CF', paddingHorizontal: 16, justifyContent: 'center', transform: [{ scale: i === menu.focus ? 1.02 : 1 }] }}><Label size={24} weight={900} color={i === menu.focus ? TOKENS.paper : TOKENS.ink}>{label}{label === 'Sound' ? '  ' + (view.sound ? 'ON' : 'OFF') : label === 'Music' ? '  ' + (view.music ? 'ON' : 'OFF') : label === 'Voice' ? '  ' + ((view.voice ?? true) ? 'ON' : 'OFF') : label === 'Frame clock' ? '  ' + (frames ? 'ON' : 'OFF') : label === 'Reduced motion' ? '  ' + (reduced ? 'ON' : 'OFF') : ''}</Label></View>)}
    </View></Card></View>
  </View>;
}
