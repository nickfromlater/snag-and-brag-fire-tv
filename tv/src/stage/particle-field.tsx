import { mutate } from './mutate';
import { layers } from './effect-layout';
import React, { useEffect, useRef } from 'react';
import { CONFETTI, TOKENS } from '@snag/shared';
import { Svg, Path } from './platform';
import { frameClock } from './frame-clock';
import { particleBatches, particleEngine } from './particles';
const colors = [...new Set([...CONFETTI, TOKENS.red, TOKENS.cobalt, '#3BB54A', '#2E5BFF', '#FF6FB5', '#E3E7F5'])];
const bins = colors.flatMap(color => [1, .75, .5, .25].flatMap(alpha => ['fill', 'stroke'].map(type => ({ color, alpha, type, key: color + '/' + alpha + '/' + type }))));
export function ParticleField(): React.ReactElement {
  const paths = useRef<(Path | null)[]>([]), dirty = useRef(false);
  useEffect(() => frameClock.subscribe(dt => {
    if (frameClock.paused) return;
    if (!particleEngine.particles.length && !dirty.current) return;
    if (dt) particleEngine.step(dt);
    const batches = particleBatches(particleEngine), group = new Map(batches.map(b => [b.color + '/' + b.alpha + '/' + (b.fill === 'none' ? 'stroke' : 'fill'), b]));
    bins.forEach((bin, i) => { const b = group.get(bin.key); mutate(paths.current[i], { d: b?.d || 'M0 0', strokeWidth: String(b?.width ?? 3), opacity: b ? b.alpha : 0 }); });
    dirty.current = !!particleEngine.particles.length;
  }, 30), []);
  return <Svg width={1280} height={720} style={{ position: 'absolute', zIndex: layers.effects, left: 0, top: 0 }} pointerEvents="none">{bins.map((b, i) => <Path key={b.key} ref={r => { paths.current[i] = r; }} d="M0 0" opacity={0} fill={b.type === 'fill' ? b.color : 'none'} stroke={b.type === 'stroke' ? b.color : TOKENS.ink} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />)}</Svg>;
}
