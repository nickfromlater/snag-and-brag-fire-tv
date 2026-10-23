import { React, Box, Card, Label, Motion, StrokedText, Pill, Badge, HolographicSticker, Bitmap, Sheen, TeamName, CelebrationBurst } from '../stage';
import { TOKENS, PODIUMS, clamp } from '@snag/shared';
import type { TvView } from '@snag/shared';

// Podium blocks: team name rides the color band; rank and points share one row below it.
const BAND = 50, RANK_SIZE = [62, 48, 38], POINT_SIZE = [34, 30, 28];

export function ChampScene({ view }: { view: TvView }): React.ReactElement | null {
  if (view.content.k !== 'champ') return null;
  const content = view.content, winner = view.teams.find(t => t.id === content.ranking[0]); if (!winner) return null;
  const fourth = view.teams.find(t => t.id === content.ranking[3]), objectTeam = view.teams.find(t => t.id === content.object?.team);
  const nameSize = Math.round(clamp(1300 / Math.max(8, winner.name.length), 58, 104));
  return <>
    {content.name && <CelebrationBurst key="champ" />}
    {content.name && <>
      <Motion target="champ.kicker" x={468} y={84} width={344} height={49}><Pill width={344} height={49} text="TONIGHT'S CHAMPIONS" fill={TOKENS.bubble} size={20} /></Motion>
      <Motion target="champ.name" x={20} y={142} width={1240} height={110}><StrokedText text={winner.name} size={nameSize} color={TOKENS.yolk} stroke={14} shadow={10} width={1240} align="center" spacing={1} /></Motion>
    </>}
    {PODIUMS.map(podium => {
      const team = view.teams.find(t => t.id === content.ranking[podium.rank - 1]); if (!team) return null;
      const badgeX = podium.x + (podium.width - podium.badgeSize) / 2, badgeY = podium.y - podium.badgeSize - 4;
      return <React.Fragment key={podium.rank}>
        {content.podiums.includes(podium.rank) && <Motion target={'podium:' + podium.rank} x={podium.x} y={podium.y} width={podium.width} height={podium.height}>
          <Box x={0} y={10} width={podium.width} height={podium.height} style={{ backgroundColor: TOKENS.ink, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }} />
          <Box x={0} y={0} width={podium.width} height={podium.height} style={{ backgroundColor: TOKENS.paper, borderWidth: 5, borderColor: TOKENS.ink, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }} />
          <Box x={0} y={0} width={podium.width} height={BAND} style={{ backgroundColor: team.color, borderWidth: 5, borderColor: TOKENS.ink, borderTopLeftRadius: 18, borderTopRightRadius: 18 }} />
          <Box x={12} y={4} width={podium.width - 24} height={BAND - 6}><TeamName name={team.name} width={podium.width - 24} height={BAND - 8} size={19} minSize={16} align="center" color={TOKENS.ink} /></Box>
          <Box x={14} y={BAND} width={podium.width - 28} height={podium.height - BAND} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <StrokedText text={String(podium.rank)} size={RANK_SIZE[podium.rank - 1]!} color={TOKENS.ink} stroke={0} shadow={0} width={Math.round(RANK_SIZE[podium.rank - 1]! * .62)} align="left" spacing={0} />
            <Label size={POINT_SIZE[podium.rank - 1]!} weight={900} color={TOKENS.ink} lines={1} style={{ flex: 1, textAlign: 'right', letterSpacing: .5 }}>{team.score}<Label size={Math.round(POINT_SIZE[podium.rank - 1]! * .55)} weight={900} color={TOKENS.ink}> PTS</Label></Label>
          </Box>
        </Motion>}
        {content.badges.includes(podium.rank) && <Motion target={'podium-badge:' + team.id} x={badgeX} y={badgeY} width={podium.badgeSize} height={podium.badgeSize}>
          <Box x={0} y={8} width={podium.badgeSize} height={podium.badgeSize} style={{ backgroundColor: TOKENS.ink, borderRadius: podium.badgeSize / 2 }} /><Badge team={team} size={podium.badgeSize} border={6} textSize={Math.round(podium.badgeSize * .36)} />
        </Motion>}
      </React.Fragment>;
    })}
    {content.crown && <Motion target="champ.crown" x={592} y={220} width={96} height={72}><Bitmap id="props/crown-champion-4.8x" width={96} height={72} /></Motion>}
    {content.trophy && <Motion target="champ.trophy" x={66} y={124} width={200} height={220}><Bitmap id="props/trophy-2x" width={200} height={220} /></Motion>}
    {content.fourth && fourth && <Motion target="champ.fourth" x={52} y={352} width={310} height={48}><Card width={310} height={48} radius={14} border={4} shadow={5}>
      <Box x={9} y={3} width={34} height={34}><Badge team={fourth} size={34}/></Box><Box x={51} y={3} width={184} height={34}><TeamName name={'4th · '+fourth.name} width={184} height={34}/></Box><Box x={235} y={10} width={60} height={26}><StrokedText text={String(fourth.score)} size={22} color={TOKENS.ink} stroke={0} shadow={0} spacing={0} width={60} align="right"/></Box>
    </Card></Motion>}
    {content.object && content.objectVisible && <Motion target="champ.object" x={992} y={110} width={250} height={410}>
      <Card width={250} height={410} border={5} radius={28} shadow={10} fill={TOKENS.paper}>
        <Box x={0} y={0} width={240} height={400} style={{ overflow: 'hidden', borderRadius: 23 }}><Sheen width={240} height={400} radius={23} /></Box>
        <Box x={14} y={14} width={212} height={24}><Label size={16} color="#6A6290" weight={900} lines={1} style={{ letterSpacing: 1.4, textAlign: 'center' }}>OBJECT OF THE NIGHT</Label></Box>
        <Box x={36} y={44} width={168} height={168}><HolographicSticker find={content.object} size={168} target="champ.object" /></Box>
        <Box x={10} y={216} width={220} height={42} style={{ overflow: 'hidden' }}><StrokedText text={content.object.name} size={32} color={TOKENS.ink} stroke={0} shadow={0} spacing={0} width={220} align="center" /></Box>
        <Box x={14} y={254} width={212} height={24}><Label size={16} weight={800} color="#6A6290" lines={2} style={{ textAlign: 'center', letterSpacing: .5 }}>{content.object.thing.toUpperCase()}</Label></Box>
        <Box x={14} y={278} width={212} height={34}>{objectTeam && <TeamName name={objectTeam.name} width={212} height={34} color="#6A6290" align="center"/>}</Box>
        <Box x={14} y={309} width={212} height={74}><Label size={16} weight={700} color="#3A3460" lines={3} style={{ textAlign: 'center', lineHeight: 20.8 }}>{content.object.brag}</Label></Box>
      </Card>
    </Motion>}
  </>;
}
