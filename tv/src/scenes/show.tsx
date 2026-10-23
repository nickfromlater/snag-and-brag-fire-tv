import { React, Box, Label, Motion, StrokedText, Pill, Card, Badge, FindSticker, HolographicSticker, Bitmap, Timer, Svg, Path, Defs, LinearGradient, Stop, TeamName, CelebrationBurst } from '../stage';
import { TOKENS } from '@snag/shared';
import type { PedestalView, TeamView, TvView } from '@snag/shared';

function Pedestal({ pedestal, team, x, view, holographic }: { pedestal: PedestalView; team: TeamView; x: number; view: TvView; holographic: boolean }): React.ReactElement {
  const findTarget = 'show-find:' + team.id, cone = 'runway-cone-' + team.id;
  const votersWidth = pedestal.voters.length * 36 - 4;
  return <Motion target={'pedestal:' + team.id} x={x} y={112} width={272} height={392}>
    <Motion target={'show-spot:' + team.id} x={-14} y={-120} width={300} height={700} opacity={0} anchor={{ x: x - 14, y: -8 }}>
      <Svg width={300} height={700}><Defs><LinearGradient id={cone} x1="0%" y1="0%" x2="0%" y2="100%"><Stop offset={0} stopColor={TOKENS.paper} stopOpacity={.26} /><Stop offset={.85} stopColor={TOKENS.paper} stopOpacity={0} /></LinearGradient></Defs><Path d="M120 0H180L300 700H0Z" fill={'url(#' + cone + ')'} /></Svg>
    </Motion>
    <Motion target={findTarget} x={40} y={18} width={192} height={192} opacity={pedestal.visible ? 1 : 0} anchor={{ x: x + 40, y: 130 }}>
      {holographic ? <HolographicSticker find={pedestal.find} size={192} target={findTarget} /> : <FindSticker find={pedestal.find} size={192} target={findTarget} />}
    </Motion>
    <Box x={6} y={222} width={260} height={164}>
      <Box x={0} y={10} width={260} height={164} style={{ backgroundColor: TOKENS.ink, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }} />
      <Box x={0} y={0} width={260} height={164} style={{ backgroundColor: TOKENS.paper, borderWidth: 5, borderColor: TOKENS.ink, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }} />
      <Box x={0} y={0} width={260} height={22} style={{ backgroundColor: team.color, borderWidth: 5, borderColor: TOKENS.ink, borderTopLeftRadius: 20, borderTopRightRadius: 20 }} />
    </Box>
    <Box x={20} y={247} width={232} height={31} style={{ overflow: 'hidden' }}><StrokedText text={pedestal.find.name} size={27} color={TOKENS.ink} stroke={0} shadow={0} spacing={0} width={232} align="center" /></Box>
    <Box x={22} y={277} width={228} height={38} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Badge team={team} size={22} border={2} /><TeamName name={team.name} width={196} height={38} color="#6A6290"/></Box>
    <Box x={16} y={309} width={240} height={44}><Label size={19} weight={800} color="#2A2450" lines={2} style={{ textAlign: 'center', lineHeight: 21 }}>{pedestal.find.brag}</Label></Box>
    {pedestal.voters.map((voter, i) => {
      const voterTeam = view.teams.find(t => t.id === voter); if (!voterTeam) return null;
      const target = 'vote-badge:' + team.id + ':' + voter, badgeX = (272 - votersWidth) / 2 + i * 36;
      return <Motion key={voter} target={target} x={badgeX} y={356} width={32} height={32} opacity={view.motion[target]?.length ? 1 : 0} anchor={{ x: x + badgeX, y: 466 }}><Badge team={voterTeam} size={32} /></Motion>;
    })}
  </Motion>;
}

export function ShowScene({ view }: { view: TvView }): React.ReactElement | null {
  if (view.content.k !== 'show') return null;
  const content = view.content, count = content.pedestals.length;
  // Keep the four-player positions exact; center the remaining finds after a dropout.
  const startX = (1280 - (count * 272 + Math.max(0, count - 1) * 32)) / 2;
  const winnerIndex = content.pedestals.findIndex(p => p.find.team === content.winner), winnerX = startX + winnerIndex * 304;
  return <>
    {content.pedestals.map((pedestal, i) => {
      const team = view.teams.find(t => t.id === pedestal.find.team); if (!team) return null;
      return <Pedestal key={team.id} pedestal={pedestal} team={team} x={startX + i * 304} view={view} holographic={content.holographic && content.winner === team.id} />;
    })}
    {!(content.voting && view.phase === 'vote') && !content.winner && <Pill x={516} y={104} width={248} height={49} text="DOUBLE POINTS" fill={TOKENS.yolk} color={TOKENS.ink} size={20} style={{zIndex:20}} />}
    {!count && <Pill x={362} y={260} width={556} height={70} text="NO FINDS ON THE RUNWAY" size={26} fill={TOKENS.paper} color={TOKENS.ink} />}
    {content.voting && view.phase === 'vote' && <Motion target="show.vote-timer" x={350} y={505} width={580} height={60} style={{zIndex:20}}>
      <Pill width={500} height={58} text="VOTE ON YOUR PHONE" fill={TOKENS.bubble} size={30} />
      <Card x={514} y={0} width={58} height={58} border={5} radius={29} shadow={6}><Box x={0} y={5} width={48} height={42}><Timer deadline={view.deadline} total={view.total} paused={view.paused} size={34} width={48} color={TOKENS.ink} stroke={0} shadow={0} /></Box></Card>
    </Motion>}
    {content.winner && <CelebrationBurst key="show" />}
    {content.crown && winnerIndex >= 0 && <Motion target="show.crown" x={winnerX + 92} y={72} width={90} height={68}><Bitmap id="props/crown-show-4.8x" width={90} height={68} /></Motion>}
    {content.winner && winnerIndex >= 0 && <Motion target="show.ribbon" x={370} y={500} width={540} height={58} style={{ zIndex: 20 }}><Card width={540} height={58} radius={10} border={4} shadow={6} fill={TOKENS.yolk}><Box x={10} y={10} width={512}><Label size={28} color={TOKENS.ink} weight={900} lines={1} style={{ letterSpacing: 1, textAlign: 'center' }}>{'SHOWSTOPPER: ' + content.pedestals[winnerIndex]!.find.name.toUpperCase()}</Label></Box></Card></Motion>}
  </>;
}
