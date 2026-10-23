import React, { useEffect, useMemo, useState } from 'react';
import type { TvView, TeamView } from '@snag/shared';
import { TOKENS } from '@snag/shared';
import { StageProvider, useSession } from './context';
import { Box, Card, Label, PhotoSticker } from './primitives';
import { JudgeMask } from './judge-mask';
import { JudgeScene } from '../scenes/judge';
import { ShowScene } from '../scenes/show';
import { HuntScene } from '../scenes/hunt';
import { Hud } from './hud';

export type PhotoProbeMode = 'photo' | 'clip' | 'eyes' | 'mask' | 'judge' | 'show' | 'hunt';
/** Debug-only synthetic fixtures. One reset timer; no image-bearing telemetry. */
export function PhotoProbe({ mode, count = 4 }: { mode: PhotoProbeMode; count?: number }): React.ReactElement {
  const session = useSession(), [cycle, setCycle] = useState(0);
  useEffect(() => { const timer = setInterval(() => setCycle(n => n + 1), 4000); return () => clearInterval(timer); }, []);
  const fixture = useMemo(() => {
    const startedAt = session.clock.now(), target = 'judge-beam:probe-0';
    const teams: TeamView[] = Array.from({ length: count }, (_, i) => ({ id: 'probe-' + i, name: ['Sock Goblins', 'Couch Potatoes', 'Junk Drawer Gang', "Grandma's Revenge"][i]!, mono: ['SG', 'CP', 'JD', 'GR'][i]!, color: ['#FF4FA0', '#FF7A1F', '#B8F23B', '#3FE0D0'][i]!, score: 0, bot: false, connected: true }));
    const mask = '/'.repeat(96);
    const view: TvView = { ...session.getView(), scene: 'judge', phase: 'judge', round: 0, beatAt: startedAt, teams, paused: false, menu: null,
      prompt: { kind: 'color', a: 'Snag the most', b: 'RED', c: 'thing in the house', col: '#F23B2E', hex: '#F23B2E' },
      content: { k: 'judge', crown: false, cards: teams.map(team => ({ stage: 'scan', speedBonus: 0, find: { team: team.id, round: 0, photoId: 'fixture', name: 'Captain Cup', thing: 'synthetic photo', brag: 'Born for this.', match: 88, hex: '#F23B2E', eyes: [[50, 51], [70, 51], 8], mask } })) },
      motion: Object.fromEntries(teams.map(team => ['judge-beam:' + team.id, [{ startedAt, elapsedMs: 0, durationMs: 800, active: true, animation: { target: 'judge-beam:' + team.id, frames: [{ opacity: 0, top: '30px' }, { opacity: 1, top: '40px', offset: .1 }, { opacity: 1, top: '200px', offset: .9 }, { opacity: 0, top: '210px' }], durationMs: 800, easing: 'ease-in-out', delayMs: 0, fill: 'both', iterations: 1 } }]])) };
    for (const team of teams) view.motion['judge-card-inner:' + team.id] = [{ startedAt: startedAt - 620, elapsedMs: 620, durationMs: 620, active: false, animation: { target: 'judge-card-inner:' + team.id, frames: [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], durationMs: 620, delayMs: 0, fill: 'both', iterations: 1 } }];
    if (mode === 'show' && view.content.k === 'judge') { view.scene = 'show'; view.phase = 'runway'; view.round = 2; view.content = { k: 'show', pedestals: view.content.cards.map(card => ({ find: card.find, visible: true, spotlight: 1, voters: [] })), voting: false, holographic: false, crown: false }; }
    // Four bot feeds panning mid-hunt: the stick's costliest steady scene, held for layer ablation.
    if (mode === 'hunt') { view.scene = 'hunt'; view.phase = 'hunt'; view.deadline = startedAt + 35000; view.total = 35000; view.teams = teams.map(t => ({ ...t, bot: true })); view.feeds = teams.map(t => ({ team: t.id, state: 'hunting', label: 'Hunting…', connected: true })); view.content = { k: 'hunt', glowing: false, snagOrder: [] }; view.motion = {}; }
    return { view, target, mask, session: { clock: session.clock, getView: () => view, subscribe: () => () => {}, cues: () => () => {}, photoUrl: (id: string) => session.photoUrl(id), remote: () => {}, telemetry: session.telemetry.bind(session) } };
  }, [mode, count, cycle]);
  useEffect(() => { session.telemetry('photo-probe', { case: mode, frames: cycle, teams: count, ready: true }); }, [mode, cycle, count]);
  return <StageProvider session={fixture.session}>
    <Box x={380} y={90} width={520}><Label size={24} color={TOKENS.paper} style={{ textAlign: 'center' }}>{mode.toUpperCase()} · SYNTHETIC · {cycle}</Label></Box>
    {(mode === 'judge' || mode === 'show' || mode === 'hunt') && <Hud/>}
    {mode === 'judge' ? <JudgeScene view={fixture.view}/> : mode === 'show' ? <ShowScene view={fixture.view}/> : mode === 'hunt' ? <HuntScene view={fixture.view}/> : <Card x={460} y={170} width={360} height={350}><Box x={60} y={45} width={240} height={240}>
      <PhotoSticker photoId="fixture" size={240} probePlain={mode === 'photo'} eyes={mode === 'eyes' || mode === 'mask' ? [[50, 51], [70, 51], 8] : undefined}
        overlay={mode === 'mask' ? <Box x={20} y={20} width={200} height={200}><JudgeMask mask={fixture.mask} target={fixture.target} hex="#F23B2E" size={200}/></Box> : undefined}/>
    </Box></Card>}
  </StageProvider>;
}
