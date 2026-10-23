import { React, Box, Label, Motion, StrokedText, Pill, Reel, MarqueeLights, displayWidth, fittedDisplaySize } from '../stage';
import { TOKENS } from '@snag/shared';
import type { TvView } from '@snag/shared';
const KICKER_WIDTHS = [300, 300, 300];
function ReelArrow({ right = false }: { right?: boolean }): React.ReactElement {
  const triangle = { borderTopWidth: 26, borderBottomWidth: 26, borderTopColor: 'transparent', borderBottomColor: 'transparent',
    borderLeftWidth: right ? 0 : 36, borderRightWidth: right ? 36 : 0 };
  return <><Box x={right ? 4 : -4} y={4} width={0} height={0} style={{ ...triangle, borderLeftColor: TOKENS.ink, borderRightColor: TOKENS.ink }} />
    <Box width={0} height={0} style={{ ...triangle, borderLeftColor: TOKENS.bubble, borderRightColor: TOKENS.bubble }} /></>;
}
const COUNTS = ['3', '2', '1', 'SNAG!'] as const;
export function IntroScene({ view }: { view: TvView }): React.ReactElement | null {
  if (view.content.k !== 'intro') return null;
  const c = view.content, count = c.count === 'GO!' ? 'SNAG!' : c.count, kickerWidth = KICKER_WIDTHS[view.round] ?? KICKER_WIDTHS[0]!;
  const titleSize = fittedDisplaySize(c.title, 168, 1022), titleWidth = displayWidth(c.title, titleSize, 1) + 18;
  return <>
    <Box width={1280} height={520} style={{ backgroundColor: 'rgba(5,6,31,.16)' }}/>
    <Motion target="intro.kicker" x={(1280 - kickerWidth) / 2} y={120} width={kickerWidth} height={49} opacity={c.kickerVisible ? 1 : 0}>
      <Pill text={c.kicker} size={26} spacing={2} fill={TOKENS.yolk} color={TOKENS.ink} width={kickerWidth} />
    </Motion>
    <Motion target="intro.title" x={(1280-titleWidth)/2} y={186} width={titleWidth} height={titleSize*.9} maxScale={1.08} opacity={c.titleVisible ? 1 : 0}>
      <StrokedText contain text={c.title} size={titleSize} stroke={14} shadow={10} width={titleWidth} align="center" />
    </Motion>
    <Motion target="intro.sub" x={150} y={386} width={980} height={128} opacity={c.subVisible ? 1 : 0} style={{ backgroundColor: TOKENS.ink, borderRadius: 20, paddingHorizontal: 24, paddingVertical: 14 }}>
      <Label size={43} weight={800} color={TOKENS.paper} style={{ textAlign: 'center', lineHeight: 48 }}>{c.sub}</Label>
    </Motion>
    {c.reel && <>
      <Motion target="intro.reel" x={150} y={118} width={980} height={330}><Reel spacious cards={c.reel} landed={c.landed} beatAt={view.beatAt} /></Motion>
      <Motion target="intro.arrow-left" x={126} y={257} width={36} height={52}><ReelArrow /></Motion>
      <Motion target="intro.arrow-right" x={1118} y={257} width={36} height={52}><ReelArrow right /></Motion>
      <Motion target="intro.bulbs" width={1280} height={720}><MarqueeLights x={150} y={118} width={980} height={330} beatAt={view.beatAt} fast={!c.landed} flash={c.landed} active={view.phase === 'reel'} /></Motion>
    </>}
    {count && <Pill x={400} y={444} width={480} height={72} text={count === 'SNAG!' ? 'GO FIND IT' : 'GET READY'} size={43} spacing={0} fill={TOKENS.ink}/>}
    {/* All four count rasters stay mounted and swap by opacity: remounting a 330 px raster each second
        (plus its scale-in) left the stick showing no number at all. */}
    {count && COUNTS.map(d => <Box key={d} x={0} y={d === 'SNAG!' ? 150 : 110} width={1280} height={d === 'SNAG!' ? 225 : 297} opacity={count === d ? 1 : 0}>
      <StrokedText contain text={d} size={d === 'SNAG!' ? 250 : 330} color={d === 'SNAG!' ? TOKENS.lime : d === '1' ? TOKENS.bubble : TOKENS.yolk} stroke={14} shadow={10} width={1280} align="center" />
    </Box>)}
  </>;
}
