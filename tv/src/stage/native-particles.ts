import type { Particle } from './particles';
import type { ParticleDrawing } from './particle-plan';
import { glyphCache } from './glyphs';

interface NativeParticle extends Particle { textShape?: { d: string; width: number; baseline: number } }
export interface NativeParticleGroup { key: string; color: string; stroke: boolean; particles: NativeParticle[] }
/** Transfer initial conditions, rather than every future SVG path, to the UI. */
export function nativeParticleGroups(particles: Particle[]): NativeParticleGroup[] {
  const groups = new Map<string, NativeParticleGroup>();
  for (const particle of particles) {
    const stroke = particle.kind === 'ring' || particle.kind === 'spark', key = particle.color + '/' + stroke;
    const group = groups.get(key) ?? { key, color: particle.color, stroke, particles: [] };
    const textShape = particle.kind === 'text' && particle.text ? glyphCache.get(particle.text, particle.w, 1) : undefined;
    group.particles.push({ ...particle, ...(textShape ? { textShape: { d: textShape.d, width: textShape.width, baseline: textShape.baseline } } : {}) }); groups.set(key, group);
  }
  return [...groups.values()];
}

/** Closed form of the existing 30 Hz semi-implicit Euler simulation. */
export function nativeParticleAt(p: NativeParticle, frame: number): NativeParticle {
  'worklet';
  const dt = 1 / 30, n = Math.max(0, Math.floor(frame)), d = p.drag;
  const position = (steps: number) => {
    if (d === 1) return { x: p.x + p.vx * dt * steps, y: p.y + p.vy * dt * steps + p.gravity * dt * dt * steps * (steps + 1) / 2 };
    const sum = d * (1 - Math.pow(d, steps)) / (1 - d);
    return { x: p.x + dt * p.vx * sum, y: p.y + dt * p.vy * sum + p.gravity * dt * dt / (1 - d) * (steps - sum) };
  };
  const at = position(n), previous = n ? position(n - 1) : { x: p.px, y: p.py };
  const power = Math.pow(d, n);
  return { ...p, ...at, px: previous.x, py: previous.y, vx: p.vx * power, vy: p.vy * power + p.gravity * dt * (d === 1 ? n : (1 - power) / (1 - d)), t: p.t + n * dt, r: p.r + p.vr * n * dt };
}
function transform(path: string, x: number, y: number, scale: number, rotation: number): string {
  'worklet';
  const c = Math.cos(rotation), s = Math.sin(rotation);
  return path.replace(/(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/g, (_, a: string, b: string) => (x + (Number(a) * c - Number(b) * s) * scale).toFixed(1) + ' ' + (y + (Number(a) * s + Number(b) * c) * scale).toFixed(1));
}
function circle(x: number, y: number, r: number): string {
  'worklet';
  return 'M' + (x-r).toFixed(1) + ' ' + y.toFixed(1) + 'a' + r.toFixed(1) + ' ' + r.toFixed(1) + ' 0 1 0 ' + (r*2).toFixed(1) + ' 0a' + r.toFixed(1) + ' ' + r.toFixed(1) + ' 0 1 0 ' + (-r*2).toFixed(1) + ' 0';
}
function star(p: Particle): string {
  'worklet';
  let path = '';
  for (let i = 0; i < 10; i++) {
    const angle = i * Math.PI / 5 - Math.PI / 2 + p.r, radius = i % 2 ? p.w / 4.4 : p.w / 2;
    path += (i ? 'L' : 'M') + (p.x + Math.cos(angle) * radius).toFixed(1) + ' ' + (p.y + Math.sin(angle) * radius).toFixed(1);
  }
  return path + 'Z';
}
function rectangle(p: Particle): string {
  'worklet';
  const c = Math.cos(p.r), s = Math.sin(p.r), h = p.h * Math.cos(p.t * 9 + p.w);
  let path = '';
  for (let i = 0; i < 4; i++) {
    const x = (i === 0 || i === 3 ? -1 : 1) * p.w / 2, y = (i < 2 ? -1 : 1) * h / 2;
    path += (i ? 'L' : 'M') + (p.x + x * c - y * s).toFixed(1) + ' ' + (p.y + x * s + y * c).toFixed(1);
  }
  return path + 'Z';
}
function icon(p: Particle): string {
  'worklet';
  if (p.icon === 'tomato') return circle(p.x, p.y, p.w * .35);
  const original = p.icon === 'heart' ? 'M12 21C6 16.6 2.5 13 2.5 8.8C2.5 6 4.7 3.8 7.4 3.8C9.3 3.8 11 4.8 12 6.4C13 4.8 14.7 3.8 16.6 3.8C19.3 3.8 21.5 6 21.5 8.8C21.5 13 18 16.6 12 21Z'
    : p.icon === 'flame' ? 'M12 22C7.6 22 4.5 19 4.5 14.8C4.5 11.2 6.9 9.2 8.4 6.8C8.7 8.8 9.8 10 11 10.4C10.6 6.7 12.4 3.6 15 2C14.6 5 16.2 7 17.7 9C18.8 10.5 19.5 12.2 19.5 14.4C19.5 19 16.4 22 12 22Z' : '';
  if (!original) return star(p);
  const scale = p.w / 24 * (p.t < .15 ? p.t / .15 * 1.2 : 1);
  const x = p.x + Math.sin(p.t * 4 + p.phase) * 16 - 12 * scale, y = p.y - 12 * scale;
  return transform(original, x, y, scale, p.r);
}
/** Same color/alpha batches as the reference, built only for the visible frame. */
export function nativeParticleDrawing(group: NativeParticleGroup, alpha: number, frame: number): ParticleDrawing {
  'worklet';
  let path = '', width = 3;
  for (const original of group.particles) {
    const p = nativeParticleAt(original, frame);
    if (p.t > p.life || Math.max(.25, Math.ceil(Math.min(1, (p.life - p.t) * 3) * 4) / 4) !== alpha) continue;
    if (!path) width = p.kind === 'ring' ? 14 * (1 - p.t / p.life) + 2 : p.kind === 'spark' ? p.w : 3;
    if (p.kind === 'ring') path += circle(p.x, p.y, p.radius * (.2 + p.t / p.life * .9));
    else if (p.kind === 'spark') path += 'M' + (p.px - (p.x-p.px)*2.5).toFixed(1) + ' ' + (p.py - (p.y-p.py)*2.5).toFixed(1) + 'L' + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
    else if (p.kind === 'rect') path += rectangle(p);
    else if (p.kind === 'icon') path += icon(p);
    else if (p.kind === 'text' && p.textShape) { path += transform(p.textShape.d, p.x - p.textShape.width / 2, p.y - p.textShape.baseline, 1, p.r); width = 8; }
    else path += star(p);
  }
  return { d: path || 'M0 0', opacity: path ? alpha : 0, strokeWidth: String(width) };
}
