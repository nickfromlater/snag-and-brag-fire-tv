import { mutate } from './mutate';
import React, { useEffect, useMemo, useRef } from 'react';
import { Image, View } from '@amazon-devices/react-native-kepler';
import { BG_PALETTES, BG_RAY_SPEED, BG_SPOT, CONFETTI, seededRng } from '@snag/shared';
import type { Mood, TvView } from '@snag/shared';
import { Svg, Path, G } from './platform';
import { bitmap } from './assets';
import { frameClock } from './frame-clock';

const moods: Mood[] = ['normal', 'urgent', 'tension', 'party', 'gold'];
function rayPath(angle: number): string {
  return Array.from({ length: 18 }, (_, i) => {
    const a = angle + i * Math.PI * 2 / 18, b = a + Math.PI / 18;
    return 'M640 426L' + (640 + 1500 * Math.cos(a)).toFixed(1) + ' ' + (426 + 1500 * Math.sin(a)).toFixed(1) + 'L' + (640 + 1500 * Math.cos(b)).toFixed(1) + ' ' + (426 + 1500 * Math.sin(b)).toFixed(1) + 'Z';
  }).join('');
}
function doodlePath(d: {kind:number;x:number;y:number;size:number;r:number}): string {
  const {x,y,size:s,r}=d, c=Math.cos(r),sn=Math.sin(r);
  const point=(a:number,b:number)=>(x+a*c-b*sn).toFixed(1)+' '+(y+a*sn+b*c).toFixed(1);
  const circle=(radius:number)=>'M'+(x-radius).toFixed(1)+' '+y.toFixed(1)+'a'+radius+' '+radius+' 0 1 0 '+2*radius+' 0a'+radius+' '+radius+' 0 1 0 '+(-2*radius)+' 0';
  if(d.kind===0)return starD(x,y,s,s*.45,r);
  if(d.kind===1||d.kind===4)return circle(s*(d.kind===1?.6:.3));
  if(d.kind===2)return 'M'+point(-s,0)+'C'+point(-s/2,-s*.6)+' '+point(0,s*.6)+' '+point(s/2,0)+'C'+point(s*.7,-s*.3)+' '+point(s,-s*.2)+' '+point(s,0);
  return [[-.15,-.6],[.15,-.6],[.15,-.15],[.6,-.15],[.6,.15],[.15,.15],[.15,.6],[-.15,.6],[-.15,.15],[-.6,.15],[-.6,-.15],[-.15,-.15]].map(([a,b],i)=>(i?'L':'M')+point(a!*s,b!*s)).join('')+'Z';
}
export function starD(cx: number, cy: number, radius: number, inner = radius * .45, rotation = 0): string {
  let d = ''; for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2 + rotation, r = i % 2 ? inner : radius; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * r).toFixed(1) + ' ' + (cy + Math.sin(a) * r).toFixed(1); } return d + 'Z';
}
export function CaptureBackground({ view: _view }: { view: TvView }): React.ReactElement | null { return null; }
/** Scene mood can use the existing base raster, with no animation or frame subscription. */
export function Background(props: { mood: Mood; palette?: Mood; held?: boolean; atMs?: number; videoActive?: boolean; videoPaused?: boolean; onVideoStatus?(status: string): void }): React.ReactElement {
  return props.palette ? <Image source={bitmap('stage/base-' + props.palette)} style={{ position: 'absolute', width: 1280, height: 720 }}/> : <AnimatedBackground {...props}/>;
}
function AnimatedBackground({ mood }: { mood: Mood; held?: boolean; atMs?: number; videoActive?: boolean; videoPaused?: boolean; onVideoStatus?(status: string): void }): React.ReactElement {
  const container = useRef<View>(null), rays = useRef<Path>(null), grid = useRef<Path>(null), doodles = useRef<(Path | null)[]>([]);
  const overlays = useRef<(Image | null)[]>([]), cones = useRef<(Image | null)[]>([]), pools = useRef<(Image | null)[]>([]);
  const active = useRef(mood); active.current = mood;
  const palette = useRef({ base: [...BG_PALETTES.normal.base], ray: [...BG_PALETTES.normal.ray], glow: [...BG_PALETTES.normal.glow] });
  const alpha = useRef([1, 0, 0, 0, 0]), angle = useRef(0);
  const shapes = useMemo(() => { const rng = seededRng(1397637447); return Array.from({ length: 16 }, (_, i) => ({ kind: i % 5, x: rng() * 1280, y: rng() * 720, size: 14 + rng() * 20, r: rng() * 6.28, vr: rng() * .8 - .4, vy: -10 + rng() * 6, color: ['#FFD43B','#FF4FA0','#3FE0D0','#B8F23B','#FFF8EC'][i % 5]! })); }, []);
  useEffect(() => frameClock.subscribe((dt, time) => {
    if (!dt) return;
    const target = BG_PALETTES[active.current], cur = palette.current, k = Math.min(1, dt * 2.5);
    for (const key of ['base', 'ray', 'glow'] as const) for (let i = 0; i < 3; i++) cur[key][i]! += (target[key][i]! - cur[key][i]!) * k;
    const rgb = (p: number[]) => 'rgb(' + p.map(x => x | 0).join(',') + ')';
    mutate(container.current, { style: { backgroundColor: rgb(cur.base) } });
    angle.current += dt * (active.current === 'urgent' ? BG_RAY_SPEED.urgent : active.current === 'party' || active.current === 'gold' ? BG_RAY_SPEED.party : BG_RAY_SPEED.default);
    mutate(rays.current, { d: rayPath(angle.current), fill: rgb(cur.ray) });
    moods.forEach((m, i) => { alpha.current[i]! += ((m === active.current ? 1 : 0) - alpha.current[i]!) * k; mutate(overlays.current[i], { style: { opacity: alpha.current[i] } }); });
    let lines = ''; const fr = time * .35 % 1; for (let j = 0; j < 9; j++) { const u = (j + fr) / 9; lines += 'M0 ' + (496 + 224 * u * u).toFixed(2) + 'H1280'; } mutate(grid.current, { d: lines });
    shapes.forEach((d, i) => {
      if (!frameClock.reducedMotion) { d.y += d.vy * dt; d.r += d.vr * dt; if (d.y < -50) d.y = 536; }
      mutate(doodles.current[i], { d: doodlePath(d), opacity: d.y > 536 ? 0 : .55 });
    });
    [[180, .55, 0], [1100, .47, 2.1], [640, .36, 4.2]].forEach(([sx, speed, phase], i) => {
      const a = frameClock.reducedMotion ? 0 : Math.sin(time * speed! + phase!) * .36, hx = sx! + Math.tan(a) * 676, I = BG_SPOT[active.current];
      const style = { transform: [{ translateX: Math.tan(a) * 338 }, { rotate: -a * 180 / Math.PI + 'deg' }], opacity: i === 2 && I < .95 ? 0 : 1 };
      mutate(cones.current[i], { style }); mutate(pools.current[i], { style: { left: hx - 150, opacity: style.opacity } });
    });
  }, 30), []);
  return <View ref={container} style={{ position: 'absolute', width: 1280, height: 720, backgroundColor: '#2B3BFF' }}>
    <Svg width={1280} height={720}><Path ref={rays} d={rayPath(0)} fill="#3A4CFF" /></Svg>
    <Svg width={1280} height={720} style={{ position: 'absolute' }}>{shapes.map((d, i) => <Path key={i} ref={r => { doodles.current[i] = r; }} d={doodlePath(d)} fill={d.kind === 1 || d.kind === 2 ? 'none' : d.color} stroke={d.kind === 1 || d.kind === 2 ? d.color : 'rgba(14,11,43,.35)'} strokeWidth={d.kind === 1 || d.kind === 2 ? 6 : 4} opacity={.55} />)}</Svg>
    {moods.map((m, i) => <Image key={m} ref={r => { overlays.current[i] = r; }} source={bitmap('stage/overlay-' + m)} style={{ position: 'absolute', width: 1280, height: 720, opacity: i ? 0 : 1 }} />)}
    <Svg width={1280} height={720} style={{ position: 'absolute' }}><Path ref={grid} d="M0 720H1280" stroke="#6E7CFF" opacity={.16} strokeWidth={2} /></Svg>
    {[180, 1100, 640].map((sx, i) => <React.Fragment key={sx}><Image ref={r => { cones.current[i] = r; }} source={bitmap('stage/cone-' + mood)} style={{ position: 'absolute', width: 264, height: 676, top: -70, left: sx - 132, opacity: i === 2 ? 0 : 1 }} /><Image ref={r => { pools.current[i] = r; }} source={bitmap('stage/pool-' + mood)} style={{ position: 'absolute', width: 300, height: 78, top: 523, left: sx - 150, opacity: i === 2 ? 0 : 1 }} /></React.Fragment>)}
    <Image source={bitmap('stage/halftone')} style={{ position: 'absolute', width: 1280, height: 720 }} />
  </View>;
}
