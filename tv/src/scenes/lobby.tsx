import { React, Box, Card, Label, Motion, Pill, QR, Sticker, StrokedText, Parade } from '../stage';
import { TOKENS } from '@snag/shared';
import type { TvView } from '@snag/shared';
export function LobbyScene({ view }: { view: TvView }): React.ReactElement | null {
  if (view.content.k !== 'lobby') return null;
  const c = view.content, host = c.joinUrl.replace(/^https?:\/\//, '').replace(/\/?\?.*$/, '').replace(/\/$/, '');
  const joined = view.teams.filter(t=>t.joined!==false).length;
  return <>
    <Parade objects={c.parade} />
    
    
    <Motion target="lobby.snag" x={66} y={88} width={476} height={169.2} rotate={-5}><StrokedText contain text="SNAG" size={188} stroke={14} shadow={10} /></Motion>
    <Motion target="lobby.ampersand" x={528} y={148} width={132} height={132} rotate={10}><Card width={132} height={132} radius={66} border={6} shadow={10}><ViewAmp /></Card></Motion>
    <Motion target="lobby.brag" x={184} y={286} width={461} height={169.2} rotate={-2}><StrokedText contain text="BRAG" size={188} color={TOKENS.bubble} stroke={14} shadow={10} /></Motion>
    {/* Tagline removed: it stacked on BRAG, the parade and the host; the host's opening line says it. */}
    <Motion target="lobby.join-card" x={670} y={110} width={556} height={452} rotate={0}><Card width={556} height={452}><Box x={24} y={20} width={500} height={420}>
      <StrokedText contain text="Join the show" size={32} color={TOKENS.ink} stroke={0} shadow={0} spacing={0}/>
      <Box y={64} width={276} height={276}><QR url={c.joinUrl} size={276} quietZone={20}/></Box>
      <Box x={296} y={82} width={200} height={98}><Label size={43} weight={900} style={{ lineHeight: 48 }}>{'SCAN TO\nJOIN'}</Label></Box>
      <Box x={296} y={200} width={200} height={32}><Label size={24} weight={900}>ROOM CODE</Label></Box>
      <Box x={296} y={246} width={198} height={66}>{c.code.split('').map((letter, i) => <Box key={i} x={i * 50} width={44} height={64} style={{ backgroundColor: TOKENS.ink, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}><StrokedText contain text={letter} size={48} color={TOKENS.yolk} stroke={0} shadow={0} width={44} align="center"/></Box>)}</Box>
      <Box y={344} width={500} height={24}><Label size={19} weight={700} lines={1}>{host}</Label></Box>
      <Box y={394} width={270} height={32}><Label size={24} weight={700}>Nothing to install.</Label></Box>
      <Box x={296} y={394} width={200} height={32}><Label size={24} weight={900}>{joined}/4 TEAMS IN</Label></Box>
    </Box></Card></Motion>
  </>;
}
function ViewAmp(): React.ReactElement { return <Box x={0} y={13} width={120} height={102}><StrokedText contain text="&" size={96} color={TOKENS.bubble} stroke={5} shadow={0} width={120} align="center" /></Box>; }
