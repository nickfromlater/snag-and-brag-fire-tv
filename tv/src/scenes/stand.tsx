import { React, Box, Card, Label, Motion, StrokedText, Pill, Badge, Bitmap, Spring, ScrollingStripes, RollingText, TeamName } from '../stage';
import { TOKENS, clamp } from '@snag/shared';
import type { TvView } from '@snag/shared';
// reference/style.css: 56 / 210 / flexible / 116 columns, separated by 14px gaps.
const LANE_X = 52, LANE_Y = 216, LANE_WIDTH = 1176, LANE_HEIGHT = 72, PITCH = 78;
const TRACK_X = 334, TRACK_WIDTH = 568, TRACK_INNER = TRACK_WIDTH - 10;
const TITLE_WIDTH = 483.359375, KICKER_WIDTHS = [326, 326, 326];
export function StandScene({ view }: { view: TvView }): React.ReactElement | null {
  if (view.content.k !== 'stand') return null;
  const c = view.content, max = Math.max(1, ...view.teams.map(t => t.score)) * 1.04;
  const kickerWidth = KICKER_WIDTHS[view.round] ?? KICKER_WIDTHS[0]!;
  const pct = (score: number) => clamp(score / max, .05, .95);
  return <>
    <Motion target="stand.title" x={64} y={98} width={TITLE_WIDTH} height={82.8}>
      <StrokedText contain text="STANDINGS" size={92} stroke={14} shadow={10} width={TITLE_WIDTH} style={{ left: -9 }} />
    </Motion>
    {c.previous.map((id, previousIndex) => {
      const team = view.teams.find(t => t.id === id); if (!team) return null;
      const rank = c.reordered ? c.ranking.indexOf(id) : previousIndex, before = c.before[id] ?? 0, delta = team.score - before;
      const start = pct(before), end = pct(team.score), lead = c.leader === id;
      const timeline = view.motion['lane-fill:' + id]?.at(-1);
      return <Motion key={id} target={'lane:' + id} x={LANE_X} y={LANE_Y + previousIndex * PITCH} width={LANE_WIDTH} height={LANE_HEIGHT}>
        <Box x={0} y={13.6} width={56} height={50.4}><StrokedText contain text={String(rank + 1)} size={32} color={lead ? TOKENS.yolk : TOKENS.paper} stroke={7} shadow={5} spacing={0} width={56} align="center" /></Box>
        <Box x={70} y={8} width={250} height={58} style={{ backgroundColor: TOKENS.ink, borderRadius: 12, paddingHorizontal: 6, justifyContent: 'center' }}>
          <TeamName name={team.name} width={238} height={36} size={24} minSize={17} lines={1} color={TOKENS.paper} />
        </Box>
        <Card x={TRACK_X} y={10} width={TRACK_WIDTH} height={52} fill="rgba(5,6,31,.62)" border={5} radius={18} shadow={7}>
          <Motion target={'lane-fill:' + id} width={TRACK_INNER} height={42}>
            <Box width={timeline ? TRACK_INNER : TRACK_INNER * start} height={42} style={{ backgroundColor: team.color, borderRadius: 13, overflow: 'hidden' }}><ScrollingStripes width={TRACK_INNER} height={42} horizontalScale={timeline ? end : 1} /></Box>
          </Motion>
          <Motion target={'lane-rider:' + id} x={TRACK_INNER * start - 34} y={-13} width={68} height={68} layoutWidth={TRACK_INNER} anchor={{ x: LANE_X + TRACK_X + 5 + TRACK_INNER * end - 34, y: LANE_Y + c.ranking.indexOf(id) * PITCH + 2 }}>
            <Motion target={'lane-badge:' + id} width={68} height={68}>
              <Box y={5} width={68} height={68} style={{ backgroundColor: TOKENS.ink, borderRadius: 34 }} /><Badge team={team} size={68} border={5} fontSize={24} />
            </Motion>
            {lead && <Box x={8} y={-34} width={52} height={40}><Spring trigger={c.leader} fromY={-40} fromRotate={-40} rotate={-12}><Bitmap id="props/crown-leader-2.4x" width={52} height={40} /></Spring></Box>}
          </Motion>
        </Card>
        <Box x={1060} y={12.2} width={116} height={46.8}><RollingText size={32} from={before} value={c.raced ? team.score : before} timeline={timeline} /></Box>
        {delta > 0 && <Motion target={'lane-delta:' + id} x={936} y={20} width={110} height={38} opacity={0}>
          <Card width={110} height={38} border={3} radius={8} shadow={3} fill={TOKENS.lime}><Label size={26} weight={900} style={{ textAlign: 'center', lineHeight: 32 }}>{'+' + delta}</Label></Card>
        </Motion>}
        {c.overtakes.includes(id) && <Motion target={'overtake:' + id} x={334} y={-20} width={174} height={36}>
          <Card width={174} height={36} border={4} radius={10} shadow={4} fill={TOKENS.bubble}><Label size={24} weight={900} color={TOKENS.paper} style={{ textAlign: 'center', lineHeight: 28, letterSpacing: .5 }}>OVERTAKE!</Label></Card>
        </Motion>}
      </Motion>;
    })}
    <Pill x={714} y={108} width={518} height={68} size={43} spacing={0} fill={TOKENS.ink} text={view.round === 2 ? 'NEXT: THE FINALE' : view.round === 1 ? 'NEXT: SHOWSTOPPER' : 'NEXT: BRAG-OFF'}/>
  </>;
}
