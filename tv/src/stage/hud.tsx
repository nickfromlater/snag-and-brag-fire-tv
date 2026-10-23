import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Text, View } from '@amazon-devices/react-native-kepler';
import { TICKER, TOKENS } from '@snag/shared';
import type { TeamView } from '@snag/shared';
import { bitmap } from './assets';
import { Badge, Box, Card, Label, LogoBug, Motion } from './primitives';
import { useSession, useTvView } from './context';
import { layers } from './effect-layout';
import { frameClock } from './frame-clock';
import { useReducedMotion } from './motion-settings';
import { audioEngine } from './cue-player';
import { glyphCache } from './glyphs';
import { TeamName } from './team-name';
import { diag } from './diag';
import { fitTeamName } from './team-name-math';
import tickerRasters from './generated/ticker-rasters.json';
import { idleLoopsOff } from './motion-settings';
export function RollingNumber({ team, size = 29 }: { team: TeamView; size?: number }): React.ReactElement {
  const session = useSession(), [score, setScore] = useState(team.score), rolling = useRef<{ from: number; to: number; at: number; duration: number }>();
  useEffect(() => session.cues(e => { if (e.cue.k === 'score' && e.cue.team === team.id) rolling.current = { from: e.cue.from, to: e.cue.total, at: session.clock.now(), duration: e.cue.rollMs }; }), [team.id]);
  useEffect(() => { if (!rolling.current) setScore(team.score); }, [team.score]);
  useEffect(() => frameClock.subscribe(() => {
    const r = rolling.current; if (!r || frameClock.paused) return;
    const p = Math.min(1, (session.clock.now() - r.at) / r.duration);
    setScore(Math.round(r.from + (r.to - r.from) * (1 - Math.pow(1 - p, 3))));
    if (p >= 1) rolling.current = undefined;
  }, 10), []); // ten count steps a second: four chips rolling at 60 Hz stalled the stick
  return <Text style={{ fontFamily: 'Lilita One', fontSize: size, color: TOKENS.ink }}>{score}</Text>;
}
export function Chip({ team, index, leader = false }: { team?: TeamView; index: number; leader?: boolean }): React.ReactElement {
  const x = 232 + index * 227, width = 217;
  const scoreWidth = team ? Math.max(32, glyphCache.measure(String(team.score), 29) + 2) : 0;
  const plan = team ? fitTeamName(team.name, 149, 16, .6, scoreWidth + 8) : undefined;
  return <Motion target={team ? 'chip:' + team.id : 'empty-chip:' + index} x={x} y={18} width={width} height={60}>
    <View style={{ position: 'absolute', top: team ? 6 : 0, width, height: 60, borderRadius: 18, backgroundColor: team ? TOKENS.ink : 'transparent' }} />
    <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 5, paddingRight: 10, borderRadius: 18, borderWidth: 4, borderStyle: 'solid', borderColor: team ? TOKENS.ink : 'rgba(255,248,236,.5)', backgroundColor: team ? TOKENS.paper : 'rgba(14,11,43,.25)' }}>
      {team?<Badge team={team} size={40}/>:<View accessibilityLabel={'Team slot '+(index+1)+' waiting'} style={{width:40,height:40,borderRadius:20,borderWidth:2,borderStyle:'solid',borderColor:'#A5A7B8',backgroundColor:'rgba(14,11,43,.15)',alignItems:'center',justifyContent:'center'}}><Text style={{fontFamily:'Lilita One',fontSize:20,color:'#A5A7B8'}}>?</Text></View>}
      {team ? <><Box x={56} y={7} width={149} height={38}><TeamName name={team.name} width={149} height={38} reserveWidth={scoreWidth+8}/></Box><Box x={203-scoreWidth} y={plan?.lines.length===1?12:plan?.scoreLine===1?21:4} width={scoreWidth} height={36} style={{alignItems:'flex-end'}}><RollingNumber team={team}/></Box></> : <Label weight={900} size={16} color="#A9B2FF" style={{flex:1,lineHeight:17.28}}>WAITING…</Label>}
    </View>
    {leader && <Image source={bitmap('props/crown-leader-2.4x')} style={{ position: 'absolute', left: -8, top: -24, width: 40, height: 30, transform: [{ rotate: '-16deg' }] }} resizeMode="contain" />}
  </Motion>;
}
export function Hud(): React.ReactElement {
  const view = useTvView(), session = useSession(), teams = view.teams.filter(t=>t.joined!==false), score = Math.max(...teams.map(t => t.score), 0), code = view.content.k === 'lobby' ? view.content.code : session.roomCode ?? '';
  const room = useRef(code); if (code) room.current = code;
  return <Box width={1280} height={96} style={{ zIndex: layers.hud }}>{view.scene !== 'lobby' && <LogoBug />}{Array.from({ length: view.round < 0 ? 4 : teams.length }, (_, i) => <Chip key={teams[i]?.id ?? 'empty-' + i} team={teams[i]} index={i} leader={score > 0 && teams[i]?.score === score} />)}
    <Box x={1130} y={20} width={134} height={58}><View style={{ alignItems: 'flex-end', gap: 6 }}><View style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: TOKENS.ink }}><Label size={16} lines={1} weight={900} color={TOKENS.paper} style={{ letterSpacing: .5 }}>ROOM {room.current}</Label></View><View style={{ flexDirection: 'row', gap: 6 }}>{[0, 1, 2].map(n => <View key={n} style={{ width: 30, height: 12, borderRadius: 6, borderWidth: 2, borderColor: TOKENS.ink, backgroundColor: view.round > n ? TOKENS.paper : view.round === n ? TOKENS.yolk : 'rgba(14,11,43,.5)' }} />)}</View></View></Box>
  </Box>;
}
export function Ticker(): React.ReactElement {
  const view=useTvView(),reduced=useReducedMotion();
  const translate = useRef(new Animated.Value(0)).current;
  const text = TICKER.join('   ●   ') + '   ●   ', native = Platform.OS !== 'web', width = native ? tickerRasters.width : text.length * 10;
  useEffect(() => { if(view.paused||reduced||diag.noTicker||idleLoopsOff())return;const a = Animated.loop(Animated.timing(translate, { toValue: -width, duration: 70000, easing: Easing.linear, useNativeDriver: true })); a.start(); return () => a.stop(); }, [view.paused,reduced]);
  return <View style={{ position: 'absolute', zIndex: layers.host, left: 0, top: 692, height: 28, width: 1280, backgroundColor: TOKENS.ink, flexDirection: 'row', overflow: 'hidden' }}><View style={{ width: 343, paddingLeft: 236, height: 28, justifyContent: 'center', backgroundColor: TOKENS.yolk }}><Text style={{ fontFamily: 'Lilita One', fontSize: 17, color: TOKENS.ink, letterSpacing: .5, width: 108 }}>SNAG NEWS</Text></View><View style={{ flex: 1, overflow: 'hidden', justifyContent: 'center' }}><Animated.View style={{ flexDirection: 'row', width: width * 2, height: 28, transform: [{ translateX: translate }] }}>{[0, 1].map(n => native ? <View key={n} style={{ width, height: 28 }}>{tickerRasters.pieces.map(piece => <Image key={piece.id} source={bitmap(piece.id)} resizeMode="stretch" style={{ position: 'absolute', left: piece.x, top: 0, width: piece.width, height: piece.height }}/>)}</View> : <Text key={n} style={{ fontFamily: 'Rubik', fontSize: 16, color: TOKENS.paper, letterSpacing: .8, width, paddingLeft: 20 }} numberOfLines={1}>{TICKER.map((line,i)=><Text key={i}>{line}<Text style={{color:TOKENS.bubble}}>{'   ●   '}</Text></Text>)}</Text>)}</Animated.View></View></View>;
}
