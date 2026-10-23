import { layers } from './effect-layout';
import React, { useContext, useEffect, useState } from 'react';
import { Svg, Path } from './platform';
import { frameClock } from './frame-clock';
import { particleBatches, particleEngine } from './particles';
import type { Batch } from './particles';
import { AudioReadyContext } from './audio-ready';
import { monitorWork } from './work-monitor';
import { useTvView } from './context';
import { suppressNativeFinaleParticles } from './native-effects-policy';

/** Bound current-frame drawing; React owns SVG node updates and retirement. */
export function ParticleField(): React.ReactElement {
  const ready = useContext(AudioReadyContext), view = useTvView();
  return ready && !suppressNativeFinaleParticles(view.scene) ? <ReadyParticleField/> : <></>;
}
function ReadyParticleField(): React.ReactElement {
  const [batches, setBatches] = useState<Batch[]>([]);
  useEffect(() => {
    let queued: ReturnType<typeof setTimeout> | undefined, drawn = false;
    const draw = () => {
      clearTimeout(queued);
      queued = undefined;
      if (!particleEngine.particles.length && !drawn) return;
      const next = monitorWork('particle-frame', () => particleBatches({ particles: particleEngine.particles.slice(-120) }));
      drawn = next.length > 0; setBatches(next);
    };
    const changed = () => { if (queued === undefined) queued = setTimeout(draw, 0); };
    const stopChanges = particleEngine.subscribe(changed);
    const stopClock = frameClock.subscribe(dt => {
      if (frameClock.paused) return;
      if (dt && particleEngine.particles.length) particleEngine.step(dt);
      if (particleEngine.particles.length || drawn) draw();
    }, 30);
    changed();
    return () => { stopChanges(); stopClock(); clearTimeout(queued); };
  }, []);
  return <Svg width={1280} height={720} style={{ position: 'absolute', zIndex: layers.effects, left: 0, top: 0 }} pointerEvents="none">
    {batches.map(batch => <Path key={batch.color + '/' + batch.alpha + '/' + batch.fill} d={batch.d} opacity={batch.alpha}
      fill={batch.fill} stroke={batch.stroke} strokeWidth={batch.width} strokeLinejoin="round" strokeLinecap="round"/>)}
  </Svg>;
}
