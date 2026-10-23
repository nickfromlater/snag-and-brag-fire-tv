import { React, Box, Card, Label, Motion, Pill, Badge, FindSticker, Sticker, DotTexture, PixelShimmer, MotionNumber, FlipFaces, Layout, NativeText, Bitmap, TeamName, JudgeMask, useSession, CelebrationBurst, NATIVE_BLUR_SHADOWS_OFF } from '../stage';
import { TOKENS } from '@snag/shared';
import type { TvView, JudgeCard, TeamView } from '@snag/shared';

// Computed in the live reference with its bundled Rubik font, at 1280×720.
// Team label sits above each card (not on it); cards end clear of the host.
const CARD_Y = 194, CARD_H = 320;
const targetWidths: Record<string, number> = { RED: 247.015625, BLUE: 262.6875, YELLOW: 297.6875, GREEN: 281.40625, PINK: 257.984375, ORANGE: 301.015625 };

function JudgeFace({ card, team, front, meter, targetHex }: { card: JudgeCard; team: TeamView; front: boolean; meter: boolean; targetHex: string }): React.ReactElement {
  const find = card.find;
  const photoOverlay = find.mask && <Box x={170/12} y={170/12} width={170*100/120} height={170*100/120}><JudgeMask mask={find.mask} target={'judge-beam:'+team.id} hex={targetHex} size={170*100/120}/></Box>;
  return <Card width={272} height={CARD_H} fill={front ? TOKENS.paper : team.color} radius={26}>
    {front ? <>
      <Box x={46} y={22} width={170} height={170}>{find.missed ? <Sticker obj="sock" size={170} eyes={false}/> : <FindSticker find={find} size={170} target={'judge-card:' + team.id} photoOverlay={photoOverlay}/>}</Box>
      {!find.missed && find.obj && <Box x={63} y={39} width={136} height={136}><PixelShimmer target={'judge-beam:' + team.id} hex={find.hex ?? TOKENS.paper}/></Box>}
      <Box x={14} y={198} width={234} height={32}><NativeText numberOfLines={1} style={{ fontFamily: 'Lilita One', fontSize: 28, lineHeight: 28, textAlign: 'center', color: TOKENS.ink }}>{find.name}</NativeText></Box>
      <Box x={8} y={230} width={246} height={26}><Label size={16} weight={800} lines={1} color="#6A6290" style={{ letterSpacing: .5, textAlign: 'center', lineHeight: 18 }}>{find.missed ? 'BETTER LUCK NEXT SNAG' : find.thing.toUpperCase()}</Label></Box>
      <Box x={14} y={262} width={244} height={56}>
        <Motion target={'judge-swatch:' + team.id} y={11} width={34} height={34}><Box width={34} height={34} style={{ borderRadius: 17, borderWidth: 4, borderColor: TOKENS.ink, backgroundColor: find.hex ?? '#E8DECB' }}/></Motion>
        <Box x={42} y={17} width={100} height={22} style={{ borderRadius: 11, borderWidth: 3, borderColor: TOKENS.ink, backgroundColor: '#E8DECB', overflow: 'hidden' }}><Motion target={'judge-bar:' + team.id} width={94} height={16} opacity={meter ? 1 : 0}><Box width={94} height={16} style={{ backgroundColor: TOKENS.lime }}/></Motion></Box>
        <Box x={146} y={0} width={98} height={56}><MotionNumber target={'judge-bar:' + team.id} value={find.match ?? 0} suffix="%" size={44} width={98}/></Box>
      </Box>
      {!find.missed && <Box x={5} y={22} width={252} height={170} style={{overflow:'hidden'}}><Motion target={'judge-beam:' + team.id} x={0} y={8} width={252} height={14} opacity={0} style={{ backgroundColor: 'rgba(184,242,59,.75)', borderRadius: 7, ...(NATIVE_BLUR_SHADOWS_OFF ? {} : { shadowColor: TOKENS.lime, shadowOpacity: .7, shadowRadius: 22, shadowOffset: { width: 0, height: 0 } }) }}/></Box>}
    </> : <Layout style={{ flex: 1, borderRadius: 21, overflow: 'hidden' }}><DotTexture width={262} height={CARD_H - 10}/><Card x={88} y={120} width={86} height={86} radius={43} shadow={7} rotate={-8}><Layout style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 6 }}><NativeText style={{ fontFamily: 'Lilita One', fontSize: 58, color: TOKENS.ink }}>?</NativeText></Layout></Card></Layout>}
  </Card>;
}

export function JudgeScene({ view }: { view: TvView }): React.ReactElement | null {
  const session = useSession();
  const banner = view.content.k === 'judge' ? view.content.banner : undefined, crown = view.content.k === 'judge' && view.content.crown;
  React.useEffect(() => { session.telemetry('judge-render', { banner: !!banner, crown, ready: true }); }, [banner, crown]);
  if (view.content.k !== 'judge') return null;
  const c = view.content, target = view.prompt?.b ?? '', targetWidth = targetWidths[target] ?? 247.015625, headerWidth = 272.546875 + 14 + targetWidth;
  const bannerWidth = Math.min(1160, (c.banner?.length ?? 0) * 17.8 + 44);
  const startX = (1280 - (c.cards.length * 272 + Math.max(0, c.cards.length - 1) * 32)) / 2;
  return <>
    {c.banner ? <Motion target="judge.banner" playOnAttach x={640 - bannerWidth / 2} y={519} width={bannerWidth} height={46} rotate={0}><Pill fill={TOKENS.yolk} width={bannerWidth} height={46}><Label size={22} weight={900} lines={1} style={{ letterSpacing: 3 }}>{c.banner.toUpperCase()}</Label></Pill></Motion> : <Box x={640 - headerWidth / 2} y={86} width={headerWidth} height={55}>
      <Pill x={0} y={3} text="The Pixel Judge" fill={TOKENS.ink} width={272.546875}/>
      <Pill x={286.546875} fill={TOKENS.paper} width={targetWidth} height={55} color={TOKENS.ink}><Label size={20} weight={900} style={{ letterSpacing: 3 }}>TARGET</Label><Layout style={{ width: 30, height: 30, marginHorizontal: 10, borderRadius: 15, borderWidth: 4, borderColor: TOKENS.ink, backgroundColor: view.prompt?.hex ?? TOKENS.paper }}/><Label size={20} weight={900} style={{ letterSpacing: 3 }}>{target}</Label></Pill>
    </Box>}
    {c.crown && <CelebrationBurst key={'judge:' + view.round} />}
    {c.cards.map((card, i) => {
      const team = view.teams.find(t => t.id === card.find.team);
      if (!team) return null;
      const x = startX + i * 304, meter = !!view.motion['judge-bar:' + team.id];
      return <React.Fragment key={team.id}>
        <Motion target={'judge-card:' + team.id} x={x} y={CARD_Y} width={272} height={CARD_H}>
          <FlipFaces target={'judge-card-inner:' + team.id} width={272} height={CARD_H} front={<JudgeFace card={card} team={team} front meter={meter} targetHex={view.prompt?.hex ?? TOKENS.lime}/>} back={<JudgeFace card={card} team={team} front={false} meter={false} targetHex={view.prompt?.hex ?? TOKENS.lime}/>}/>
          <Box x={0} y={-50} height={44} width={272} style={{ zIndex: 4 }}><Layout style={{ alignSelf: 'flex-start', maxWidth: 272, height: 44, borderWidth: 4, borderColor: TOKENS.ink, borderRadius: 999, paddingLeft: 4, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: TOKENS.paper, shadowColor: TOKENS.ink, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 4 } }}><Badge team={team} size={28}/><TeamName name={team.name} width={226} height={34} size={20} minSize={16} lines={1}/></Layout></Box>
        </Motion>
        {c.crown && c.winner === team.id && <Motion target="judge.crown" playOnAttach x={x + 196} y={CARD_Y - 34} width={96} height={72} rotate={16} style={{ zIndex: 9 }}><Bitmap id="props/crown-judge-4.8x" scale={2.4}/></Motion>}
      </React.Fragment>;
    })}
  </>;
}
