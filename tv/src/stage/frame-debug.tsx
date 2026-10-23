import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from '@amazon-devices/react-native-kepler';
import { TOKENS } from '@snag/shared';
import { useSession, useTvView } from './context';
import { frameClock } from './frame-clock';
import * as cuePlayer from './cue-player';

type MediaClock = { lineSeq: number; mediaMs: number; mediaPath: string };
/** Debug only. One existing clock subscription, four plain text nodes, no animation. */
export function FrameDebugHud(): React.ReactElement {
  const session = useSession(), view = useTvView(), current = useRef(view);
  current.current = view;
  const epoch = useRef(session.clock.now()).current;
  const read = () => {
    const core = session.getView(), rendered = current.current;
    const voice = (cuePlayer as { hostVoice?: { debugClock(): MediaClock } }).hostVoice;
    return { frame: frameClock.frame, stageMs: Math.round(frameClock.now() * 1000), clockMs: session.clock.now() - epoch,
      scene: rendered.scene, coreScene: core.scene, phase: core.phase, round: core.round, paused: core.paused,
      ...(voice?.debugClock() ?? { lineSeq: 0, mediaMs: 0, mediaPath: 'none' }) };
  };
  const [sample, setSample] = useState(read);
  useEffect(() => frameClock.subscribe(() => setSample(read()), 4), [session]);
  // Commit evidence is distinct from physical presentation; the visible number settles that.
  useEffect(() => session.telemetry('frame-debug', sample), [sample, session]);
  const text = { fontFamily: 'Rubik', color: TOKENS.paper, fontSize: 18, lineHeight: 24 };
  return <View pointerEvents="none" collapsable={false} style={{ position: 'absolute', right: 12, bottom: 34, width: 390, height: 132, padding: 10, backgroundColor: TOKENS.ink, borderWidth: 3, borderColor: TOKENS.yolk, zIndex: 40 }}>
    <Text style={{ ...text, fontSize: 34, lineHeight: 38, color: TOKENS.yolk }}>FRAME {sample.frame}</Text>
    <Text style={text}>STAGE {(sample.stageMs / 1000).toFixed(3)}s · CLOCK {(sample.clockMs / 1000).toFixed(3)}s</Text>
    <Text style={text}>MEDIA {(sample.mediaMs / 1000).toFixed(3)}s · {sample.mediaPath} #{sample.lineSeq}</Text>
    <Text style={text}>VIEW {sample.scene} · CORE {sample.coreScene} R{sample.round + 1}</Text>
  </View>;
}
