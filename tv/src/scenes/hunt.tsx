import { React, Box, Card, Label, Motion, StrokedText, Pill, Badge, Sticker, CameraFeed, CountdownDial, DotTexture, Layout, NativeText, Svg, Path, Circle, G, Defs, ClipPath, TeamName, fittedDisplaySize } from '../stage';
import { TOKENS, BRAGP, SHOWP } from '@snag/shared';
import type { TvView, TeamView, TvFeed } from '@snag/shared';
import { diag } from '../stage';

const medals = ['1ST', '2ND', '3RD', '4TH'];
// Feed tiles: the team label sits above each tile, so the live feed carries one overlay (its caption).
const TILE_Y = 362, TILE_H = 158;
function TeamLabel({ team }: { team: TeamView }): React.ReactElement {
  return <Box x={0} y={-48} width={274} height={42} style={{ zIndex: 5 }}>
    <Layout style={{ alignSelf: 'flex-start', width: 274, height: 42, paddingLeft: 4, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: TOKENS.paper, borderWidth: 4, borderColor: TOKENS.ink, borderRadius: 999, shadowColor: TOKENS.ink, shadowOpacity: 1, shadowOffset: { width: 0, height: 4 }, shadowRadius: 0 }}>
      <Badge team={team} size={30} fontSize={17}/><TeamName name={team.name} width={222} height={34} size={22} minSize={16} lines={1}/>
    </Layout>
  </Box>;
}

function CardBack({ team, feed, order }: { team: TeamView; feed: TvFeed; order: number }): React.ReactElement {
  const missed = feed.state === 'missed' || feed.find?.missed;
  return <Card width={274} height={TILE_H} fill={team.color} radius={26}>
    <Layout style={{ flex: 1, borderRadius: 21, overflow: 'hidden' }}>
      <DotTexture width={264} height={TILE_H - 10}/>
      {missed ? <>
        <Box x={91} y={16} width={82} height={82} rotate={-18}><Sticker obj="sock" size={82} eyes={false}/></Box>
        <Box x={14} y={113} width={236}><NativeText style={{ fontFamily: 'Lilita One', fontSize: 28, textAlign: 'center', color: TOKENS.ink }}>Didn't snag</NativeText></Box>
        <Box x={121} y={63} width={24} height={20}><Svg width={24} height={20}><Path d="M3 13Q12 3 21 13" stroke={TOKENS.ink} strokeWidth={3} fill="none" strokeLinecap="round"/></Svg></Box>
      </> : <>
        {feed.state !== 'ready' && order !== 1 && <Card x={89} y={36} width={86} height={86} radius={43} shadow={7} rotate={-8}>
          <Layout style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 6 }}><NativeText style={{ fontFamily: 'Lilita One', fontSize: 58, color: TOKENS.ink }}>?</NativeText></Layout>
        </Card>}
        {order > 1 && order < 4 && <Box x={7} y={92} width={54} height={54} rotate={-10} style={{ borderRadius: 27, backgroundColor: order === 1 ? TOKENS.yolk : order === 2 ? '#E3E7F5' : '#E7A15C', borderWidth: 4, borderColor: TOKENS.ink, justifyContent: 'center', alignItems: 'center' }}><NativeText style={{ fontFamily: 'Lilita One', fontSize: 24, color: TOKENS.ink }}>{medals[order - 1]}</NativeText></Box>}
        {order !== 1 && <Box x={174} y={110} width={80} height={34} style={{ backgroundColor: TOKENS.ink, borderRadius: 8, justifyContent: 'center', alignItems: 'center' }}><Label size={24} color={TOKENS.paper} weight={900} style={{ letterSpacing: 1 }}>0:{String(Math.ceil(feed.find?.time ?? 0)).padStart(2, '0')}</Label></Box>}

      </>}
    </Layout>
  </Card>;
}

export function HuntScene({ view }: { view: TvView }): React.ReactElement | null {
  if (view.content.k !== 'hunt') return null;
  const p = view.prompt, c = view.content;
  const icon = p?.kind === 'brag' ? BRAGP.find(x => x.b === p.b)?.ic : SHOWP.find(x => x.b === p?.b)?.ic;
  const word = c.glowing ? 'ADD TWO EYES' : p?.b ?? '';
  const wordSize = fittedDisplaySize(word, 96, 554, 0);
  return <>
    <Box width={1280} height={530} style={{ backgroundColor: 'rgba(5,6,31,.16)' }}/>
    <Card x={48} y={100} width={770} height={204}>
      <Box x={26} y={14} width={560}><Label size={28} weight={900} color="#4B4470" style={{ letterSpacing: 1 }}>{c.glowing ? 'FINISH YOUR FIND' : p?.a.toUpperCase()}</Label></Box>
      <Box x={26} y={52} width={560}><StrokedText contain text={word} size={wordSize} color={c.glowing ? TOKENS.bubble : p?.col ?? TOKENS.yolk} stroke={9} shadow={6} spacing={0}/></Box>
      <Box x={26} y={162} width={690}><Label size={24} weight={900} color="#4B4470" style={{ letterSpacing: 1 }}>{c.glowing ? 'NAME IT. SEND IT TO THE TV.' : p?.c.toUpperCase()}</Label></Box>
      {c.glowing ? null : p?.kind === 'color' ? <Box x={598} y={34} width={136} height={136}>
        <Svg width={136} height={144}><Defs><ClipPath id={'hunt-swatch-' + view.round}><Circle cx={68} cy={68} r={62}/></ClipPath></Defs><Circle cx={68} cy={76} r={65} fill={TOKENS.ink}/><Circle cx={68} cy={68} r={65} fill={p.hex ?? p.col} stroke={TOKENS.ink} strokeWidth={6}/><G clipPath={'url(#hunt-swatch-' + view.round + ')'}><Path d="M6 68a62 62 0 1 0 124 0a62 62 0 1 0 -124 0M6 58a62 62 0 1 0 124 0a62 62 0 1 0 -124 0" fillRule="evenodd" fill="rgba(0,0,0,.18)"/><Path d="M8 70A60 60 0 0 1 124 48A60 60 0 0 0 18 102Z" fill="rgba(255,255,255,.3)"/></G></Svg>
      </Box> : icon && <Box x={592} y={22} width={150} height={150}><Sticker obj={icon} size={150} eyes={false}/></Box>}
    </Card>
    {!diag.noDial && <Box x={850} y={84} width={220} height={220}><CountdownDial deadline={view.deadline} total={view.total} paused={view.paused} numberSize={64}/></Box>}
    <Box x={1080} y={158} width={160}><Label size={24} weight={900} color={TOKENS.paper} style={{ letterSpacing: 1, lineHeight: 30, textShadowColor: TOKENS.ink, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 }}>{c.glowing ? 'TO SEND\nYOUR FIND' : 'SECONDS\nLEFT'}</Label></Box>
    {view.teams.map((team, i) => {
      const feed = view.feeds.find(f => f.team === team.id);
      if (!feed) return null;
      const x = (1280 - (view.teams.length * 274 + (view.teams.length - 1) * 30)) / 2 + i * 304, order = c.snagOrder.indexOf(team.id) + 1;
      const back = !['hunting', 'locked'].includes(feed.state);
      return <React.Fragment key={team.id}>
        <Box target={'slot:' + team.id} x={x} y={TILE_Y} width={274} height={TILE_H}>
          {!back && !diag.noFeeds && <CameraFeed flashTarget={'feed-flash:' + team.id} index={i} color={team.color} label={feed.label} bot={team.bot} locked={feed.state === 'locked'} object={feed.find?.obj} largeStatus/>}

        </Box>
        {back && <Motion target={'slot-card:' + team.id} x={x} y={TILE_Y} width={274} height={TILE_H}><CardBack team={team} feed={feed} order={order}/></Motion>}
        {feed.state === 'ready' && !feed.find?.missed && <Motion target={'ready:' + team.id} x={x + 60} y={412} width={137} height={52} rotate={-12} style={{ zIndex: 6 }}><Card width={137} height={52} fill={TOKENS.lime} radius={12} shadow={6}><Layout style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><NativeText style={{ fontFamily: 'Lilita One', fontSize: 30, color: TOKENS.ink }}>READY</NativeText></Layout></Card></Motion>}
        {back && !feed.find?.missed && <Motion target={'snag-burst:' + team.id} x={x + 17} y={337} width={240} height={150} opacity={0} style={{ zIndex: 8 }}><Svg width={240} height={150} viewBox="0 0 100 100" preserveAspectRatio="none"><Path d="M50 0L60 20L80 4L78 30L100 26L84 48L100 68L76 68L82 96L60 78L50 100L40 78L18 96L24 68L0 68L16 48L0 26L22 30L20 4L40 20Z" fill={TOKENS.yolk}/></Svg><Box x={0} y={48} width={240}><NativeText style={{ fontFamily: 'Lilita One', fontSize: 42, textAlign: 'center', color: TOKENS.ink, transform: [{ rotate: '-6deg' }] }}>SNAGGED!</NativeText></Box></Motion>}
        {back && order === 1 && p?.kind === 'color' && <Motion target={'first-snag:' + team.id} x={x + 28} y={470} width={230} height={42} rotate={-4} style={{ zIndex: 10 }}><Card width={230} height={42} fill={TOKENS.red} border={4} radius={10} shadow={6}><Layout style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Label size={24} weight={900} color={TOKENS.paper} style={{ letterSpacing: 1.5 }}>FIRST! +30 PTS</Label></Layout></Card></Motion>}
        <Box x={x} y={TILE_Y} width={274} height={TILE_H} style={{zIndex:20}}><TeamLabel team={team}/></Box>
      </React.Fragment>;
    })}
    {(view.phase === 'time' || !!view.motion['hunt.time']) && <Motion target="hunt.time" x={551.3984375} y={300} width={177.203125} height={83} style={{ zIndex: 11 }}><Card width={177.203125} height={83} fill={TOKENS.bubble} radius={18} shadow={8}><Layout style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><NativeText style={{ fontFamily: 'Lilita One', fontSize: 44, color: TOKENS.paper }}>TIME!</NativeText></Layout></Card></Motion>}
  </>;
}
