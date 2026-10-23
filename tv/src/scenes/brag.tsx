import { React, Layout, Box, Card, Label, Motion, StrokedText, Pill, Badge, FindSticker, Bitmap, Follow, Loop, Svg, Path, Defs, LinearGradient, Stop, TeamName, CelebrationBurst } from '../stage';
import { layers } from '../stage';
import { TOKENS, clamp, hex2rgb, rgb2hex } from '@snag/shared';
import type { FindView, TeamView, TvView } from '@snag/shared';

// Final v2 CSS: bubbles y=96, combo y=104, tug x=236.
const PanelDots = React.memo(function PanelDots(): React.ReactElement {
  return <Box x={0} y={0} width={1280} height={720} style={{ zIndex: layers.backdrop }}><Bitmap id="stage/brag-dots" width={1280} height={720} /></Box>;
});

const Panel = React.memo(function Panel({ team, right }: { team: TeamView; right: boolean }): React.ReactElement {
  const id = 'brag-panel-' + (right ? 'right' : 'left');
  const teamRgb = hex2rgb(team.color), inkRgb = hex2rgb(TOKENS.ink), end = teamRgb.map((channel, i) => channel * .62 + inkRgb[i]! * .38);
  // Overscan allows the core's 78% knockout sweep to cover the stage.
  return <Motion target={right ? 'brag.panel-right' : 'brag.panel-left'} x={0} y={0} width={1280} height={720}>
    <Box x={right ? 0 : -1280} y={0} width={2560} height={720}>
      <Svg width={2560} height={720} viewBox={right ? '0 0 2560 720' : '-1280 0 2560 720'}>
        <Defs><LinearGradient id={id} gradientUnits="userSpaceOnUse" x1={right ? 1280 : 0} y1={0} x2={right ? 0 : 1280} y2={225}>
          <Stop offset={0} stopColor={team.color} /><Stop offset={.3} stopColor={team.color} /><Stop offset={1} stopColor={rgb2hex(end[0]!, end[1]!, end[2]!)} />
        </LinearGradient></Defs>
        <Path d={right ? 'M716.8 0H2560V720H563.2Z' : 'M-1280 0H716.8L563.2 720H-1280Z'} fill={team.color} />
        <Path d={right ? 'M716.8 0H2560V720H563.2Z' : 'M-1280 0H716.8L563.2 720H-1280Z'} fill={'url(#' + id + ')'} />
      </Svg>
    </Box>
  </Motion>;
}, (previous, next) => previous.right === next.right && previous.team.color === next.team.color);

function Fighter({ team, find, right, p, live }: { team: TeamView; find?: FindView; right: boolean; p: number; live: boolean }): React.ReactElement {
  const target = right ? 'brag.fighter-right' : 'brag.fighter-left';
  return <Motion target={target} x={right ? 844 : 96} y={142} width={340} height={400}>
    <Follow width={340} height={400} scale={live ? 1 + (right ? p : -p) * .14 : 1}>
      <Box x={32} y={0} width={276} height={276}>{find && <FindSticker find={find} size={276} target={target} />}</Box>
      <Box x={-40} y={280} width={420} height={48} style={{ overflow: 'hidden' }}><StrokedText text={find?.name ?? team.name} size={46} color={TOKENS.paper} stroke={8} shadow={5} spacing={0} width={420} align="center" /></Box>
      <Box x={0} y={330} width={340} height={39} style={{ alignItems: 'center' }}><Layout style={{ maxWidth: 340, height: 39, backgroundColor: 'rgba(14,11,43,.55)', borderRadius: 999, paddingLeft: 4, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Badge team={team} size={30} /><TeamName name={team.name} width={270} height={34} color={TOKENS.paper} spacing={1}/>
      </Layout>
      </Box>
    </Follow>
  </Motion>;
}

function BragBubble({ find, right }: { find?: FindView; right: boolean }): React.ReactElement {
  // The brag is the joke the room reads aloud: 36 px at 1080p, at most three lines.
  const text = find?.brag ?? '', lines = Math.min(3, Math.max(1, Math.ceil(text.length / 26))), height = 34 + lines * 30;
  return <Motion target={right ? 'brag.line-right' : 'brag.line-left'} x={right ? 840 : 60} y={90} width={380} height={height} opacity={0}>
    <Box x={178} y={height - 14} width={24} height={24} rotate={45} style={{ backgroundColor: TOKENS.paper, borderRightWidth: 4, borderBottomWidth: 4, borderColor: TOKENS.ink }} />
    <Card width={380} height={height} border={4} radius={20} shadow={6}><Box x={16} y={13} width={340} height={height - 26}><Label size={24} weight={800} lines={3} style={{ lineHeight: 30 }}>{text}</Label></Box></Card>
  </Motion>;
}

function MatchScene({ view }: { view: TvView }): React.ReactElement | null {
  if (view.content.k !== 'brag') return null;
  const match = view.content.match, left = view.teams.find(t => t.id === match.left), right = view.teams.find(t => t.id === match.right);
  if (!left || !right) return null;
  const leftFind = view.feeds.find(f => f.team === left.id)?.find, rightFind = view.feeds.find(f => f.team === right.id)?.find;
  const live = view.phase === 'mash', knockout = view.phase === 'knockout', progress = clamp(.5 - match.p * .5, 0, 1), knobShift = 716 * (progress - .5);
  const comboTeam = view.teams.find(t => !t.bot) ?? left, comboX = comboTeam.id === match.left ? 266 : comboTeam.id === match.right ? 1014 : 640, combo = match.taps[comboTeam.id] ?? 0;
  const byeTeam = match.bye ? view.teams.find(t => t.id === match.bye) : undefined, byeFind = match.bye === left.id ? leftFind : rightFind;
  const byeText = byeFind?.missed ? 'No finds this time!' : `${byeTeam?.name ?? ''} gets a bye!`;
  return <>
    <Pill x={match.final ? 523 : 499} y={104} width={match.final ? 234 : 282} height={49} text={match.kicker} fill={match.final ? TOKENS.yolk : TOKENS.ink} color={match.final ? TOKENS.ink : TOKENS.paper} size={20} />
    {byeTeam ? <>
      <Box x={502} y={142} width={276} height={276}>{byeFind && !byeFind.missed && <FindSticker find={byeFind} size={276} target="brag.bye" />}</Box>
      <Box x={390} y={422} width={500} height={48}><StrokedText text={byeFind?.missed ? 'Nobody snagged!' : byeFind?.name ?? byeTeam.name} size={46} color={TOKENS.paper} stroke={8} shadow={5} width={500} align="center" /></Box>
      <Motion target="brag.bye" x={0} y={494} width={1280} height={110}><StrokedText text={byeText} size={Math.min(76, 1120 / (byeText.length * .56))} color={TOKENS.yolk} width={1280} align="center" /></Motion>
    </> : <>
      <Fighter team={left} find={leftFind} right={false} p={match.p} live={live} /><Fighter team={right} find={rightFind} right p={match.p} live={live} />
      <Motion target="brag.vs" x={566} y={270} width={148} height={148} opacity={0}><Card width={148} height={148} fill={TOKENS.yolk} radius={74} border={6} shadow={10}><Box x={2} y={24} width={132} height={90}><StrokedText text="VS" size={84} color={TOKENS.red} stroke={7} shadow={0} spacing={0} width={132} align="center" /></Box></Card></Motion>
      <BragBubble find={leftFind} right={false} /><BragBubble find={rightFind} right />
      <Motion target="brag.tug" x={236} y={548} width={808} height={64} opacity={0}>
        <Card x={46} y={8} width={716} height={48} fill={right.color} border={5} radius={26} shadow={8}>
          <Box x={0} y={0} width={706} height={38} style={{ overflow: 'hidden', borderRadius: 21 }}><Follow width={706} height={38} translateX={-706 * (1 - progress)}><Box x={0} y={0} width={706} height={38} style={{ backgroundColor: left.color }} /></Follow></Box>
          <Box x={351} y={-10} width={4} height={58} style={{ backgroundColor: TOKENS.ink }} />
        </Card>
        <Box x={0} y={2} width={60} height={60}><Badge team={left} size={60} /></Box><Box x={748} y={2} width={60} height={60}><Badge team={right} size={60} /></Box>
        <Box target="brag.knob" x={364} y={-8} width={80} height={80} anchor={{ x: 600 + knobShift, y: 540 }}><Follow width={80} height={80} translateX={knobShift}><Loop width={80} height={80} durationMs={1400} frames={[{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }]}><Bitmap id="icons/star-192" width={80} height={80} /></Loop></Follow></Box>
      </Motion>
      <Motion target="brag.combo" x={0} y={0} width={1280} height={720}>{combo > 0 && <Motion target={'brag.combo:' + comboTeam.id} x={comboX} y={160} width={200} height={80} rotate={-4} anchor={{ x: comboX - 100, y: 160 }}><StrokedText text={'x' + combo} size={60} color={TOKENS.paper} stroke={10} shadow={6} width={200} align="center" /></Motion>}</Motion>
      {live && (!match.count || match.count === 'MASH!') && <Pill x={455} y={476} width={370} height={56} text="TAP YOUR PHONE!" fill={TOKENS.bubble} size={26} style={{ zIndex: 12 }} />}
      {match.count && <Motion target="brag.count" x={0} y={470} width={1280} height={100}><StrokedText text={match.count} size={84} color={match.count === 'MASH!' ? TOKENS.bubble : TOKENS.yolk} stroke={14} shadow={10} width={1280} align="center" /></Motion>}
      <Motion target="brag.ko" x={760} y={250} width={480} height={110} rotate={-8} opacity={0}><StrokedText text="BRAGGED!" size={96} color={TOKENS.yolk} stroke={14} shadow={10} width={480} align="center" /></Motion>
    </>}
  </>;
}

export function BragScene({ view }: { view: TvView }): React.ReactElement | null {
  if (view.content.k !== 'brag') return null;
  const match = view.content.match;
  return <MatchScene key={match.left + ':' + match.right + ':' + match.kicker} view={view} />;
}

export function BragBackdrop({ view }: { view: TvView }): React.ReactElement | null {
  if (view.content.k !== 'brag') return null;
  const match = view.content.match, left = view.teams.find(t => t.id === match.left), right = view.teams.find(t => t.id === match.right);
  if (!left || !right) return null;
  const knockout = view.phase === 'knockout', byeTeam = match.bye ? view.teams.find(t => t.id === match.bye) : undefined;
  return <>
    <Motion target="brag.sweep" x={0} y={0} width={1280} height={720} style={{ zIndex: layers.backdrop }}><Follow width={1280} height={720} translateX={knockout ? 0 : -match.p * 204.8}>
      <Panel team={left} right={false} /><Panel team={right} right />
    </Follow></Motion>
    {byeTeam && <Box x={0} y={0} width={1280} height={720} style={{ backgroundColor: byeTeam.color, zIndex: layers.backdrop }} />}
    <PanelDots />
    {knockout && !byeTeam && <CelebrationBurst key={'ko:' + match.left + ':' + match.right} />}
    {!byeTeam && <Motion target="brag.sweep" x={0} y={0} width={1280} height={720} style={{ zIndex: layers.backdrop }}><Follow width={1280} height={720} translateX={knockout ? 0 : -match.p * 204.8}><Motion target="brag.seam" x={0} y={0} width={1280} height={720}><Bitmap id="props/brag-seam-1.5x" width={1280} height={720} /></Motion></Follow></Motion>}
  </>;
}
