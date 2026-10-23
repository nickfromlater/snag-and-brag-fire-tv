import { CONFETTI, MAX_PARTICLES, TOKENS } from '@snag/shared';
import type { TvCue } from '@snag/shared';
import { resolveAnchor } from './context';
import { starD } from './background-geometry';
import { glyphCache } from './glyphs';
import { reactionLane, reactionLifetime } from './effect-layout';
export interface Particle { kind: 'rect' | 'star' | 'spark' | 'ring' | 'icon' | 'text'; x: number; y: number; px: number; py: number; vx: number; vy: number; gravity: number; drag: number; r: number; vr: number; w: number; h: number; color: string; life: number; t: number; phase: number; radius: number; icon?: string; text?: string }
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export class ParticleEngine {
  readonly particles: Particle[] = [];
  private readonly listeners = new Set<() => void>();
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private changed(): void { for (const fn of this.listeners) fn(); }
  reduced = false;
  add(p: Partial<Particle>): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ kind: 'star', x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, gravity: 0, drag: 1, r: 0, vr: 0, w: 16, h: 10, color: TOKENS.paper, life: .7, t: 0, phase: 0, radius: 120, ...p });
    this.changed();
  }
  cue(c: TvCue): void {
    if (c.k === 'confetti') {
      const at = resolveAnchor(c.at), count = this.reduced ? Math.ceil(c.count / 3) : c.count;
      for (let i = 0; i < count; i++) {
        const a = c.angle + rnd(-1, 1) * c.spread, speed = rnd(c.recipe.speedFraction[0], c.recipe.speedFraction[1]) * c.power;
        this.add({ kind: Math.random() < c.recipe.starProbability ? 'star' : 'rect', ...at, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, gravity: c.gravity, drag: c.drag, r: rnd(...c.recipe.rotation), vr: rnd(...c.recipe.angularVelocity), w: rnd(...c.recipe.width), h: rnd(...c.recipe.height), color: c.colors[i % c.colors.length]!, life: rnd(...c.life) });
      }
    } else if (c.k === 'stars') {
      const at = resolveAnchor(c.at);
      for (let i = 0; i < c.count; i++) { const a = i / c.count * Math.PI * 2 + rnd(...c.recipe.angleJitter), speed = rnd(...c.recipe.speed); this.add({ ...at, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, drag: c.recipe.drag, vr: rnd(...c.recipe.angularVelocity), w: rnd(...c.recipe.width), color: c.color, life: c.lifeMs / 1000 }); }
    } else if (c.k === 'ring') this.add({ kind: 'ring', ...resolveAnchor(c.at), radius: c.radius, color: c.color, life: c.lifeMs / 1000 });
    else if (c.k === 'mash-spark') for (let i = 0; i < 3; i++) this.add({ ...resolveAnchor(c.at), vx: rnd(...c.velocityX), vy: rnd(...c.velocityY), gravity: c.gravity, drag: c.drag, w: rnd(...c.width), color: c.colors[i % c.colors.length]!, life: c.lifeMs / 1000 });
    else if (c.k === 'reaction') {
      const vx = rnd(...c.recipe.velocityX), vy = rnd(...c.velocityY), w = rnd(...c.recipe.width);
      const radius = w / 2 * Math.SQRT2 * c.recipe.popScale + c.recipe.wobblePx;
      this.add({ kind: 'icon', icon: c.kind, x: reactionLane(c.x), y: c.y, vx, vy, gravity: c.gravity, drag: c.recipe.drag, r: rnd(...c.recipe.rotation), vr: rnd(...c.recipe.angularVelocity), w, phase: rnd(...c.recipe.phase), color: ({ star: TOKENS.yolk, heart: TOKENS.bubble, flame: '#FF7A1F', tomato: TOKENS.red })[c.kind], life: reactionLifetime(c.y, vy, c.gravity, radius, c.lifeMs / 1000) });
    }
    else if (c.k === 'firework') {
      const t = c.rocket.durationMs / 1000;
      this.add({ kind: 'spark', x: c.rocket.fromX, y: c.rocket.fromY, px: c.rocket.fromX, py: c.rocket.fromY, vx: (c.x - c.rocket.fromX) / t, vy: (c.y - c.rocket.fromY - .5 * c.rocket.gravity * t * t) / t, gravity: c.rocket.gravity, w: 4, life: t });
    }
  }
  burst(c: Extract<TvCue, { k: 'firework' }>): void {
    const count = this.reduced ? 14 : c.burst.count;
    for (let i = 0; i < count; i++) { const a = i / count * Math.PI * 2 + rnd(...c.burst.recipe.angleJitter), s = rnd(...c.burst.speed); this.add({ kind: 'spark', x: c.x, y: c.y, px: c.x, py: c.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, gravity: c.burst.gravity, drag: c.burst.drag, w: rnd(...c.burst.recipe.width), color: i % 2 ? TOKENS.paper : c.color, life: rnd(...c.burst.life) }); }
    this.add({ kind: 'ring', x: c.x, y: c.y, radius: 70, life: .5 });
    for (let i = 0; i < 5; i++) this.add({ x: c.x, y: c.y, vx: Math.cos(i * 1.256) * 420, vy: Math.sin(i * 1.256) * 420, drag: .9, color: c.color });
  }
  step(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!; p.t += dt;
      if (p.t > p.life) { this.particles.splice(i, 1); continue; }
      p.px = p.x; p.py = p.y; p.vx *= p.drag; p.vy = p.vy * p.drag + p.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
    }
  }
  clear(): void { this.particles.length = 0; this.changed(); }
}
export const particleEngine = new ParticleEngine();
const round = (n: number) => n.toFixed(1);
function rectangle(p: Particle): string {
  const cos = Math.cos(p.r), sin = Math.sin(p.r), h = p.h * Math.cos(p.t * 9 + p.w);
  return [[-p.w / 2, -h / 2], [p.w / 2, -h / 2], [p.w / 2, h / 2], [-p.w / 2, h / 2]].map(([x, y], i) => (i ? 'L' : 'M') + round(p.x + x! * cos - y! * sin) + ' ' + round(p.y + x! * sin + y! * cos)).join('') + 'Z';
}
export function circleD(x: number, y: number, r: number): string { return 'M' + round(x - r) + ' ' + round(y) + 'a' + round(r) + ' ' + round(r) + ' 0 1 0 ' + round(r * 2) + ' 0a' + round(r) + ' ' + round(r) + ' 0 1 0 ' + round(-r * 2) + ' 0'; }
const icon: Record<string, string> = {
  heart: 'M12 21C6 16.6 2.5 13 2.5 8.8C2.5 6 4.7 3.8 7.4 3.8C9.3 3.8 11 4.8 12 6.4C13 4.8 14.7 3.8 16.6 3.8C19.3 3.8 21.5 6 21.5 8.8C21.5 13 18 16.6 12 21Z',
  flame: 'M12 22C7.6 22 4.5 19 4.5 14.8C4.5 11.2 6.9 9.2 8.4 6.8C8.7 8.8 9.8 10 11 10.4C10.6 6.7 12.4 3.6 15 2C14.6 5 16.2 7 17.7 9C18.8 10.5 19.5 12.2 19.5 14.4C19.5 19 16.4 22 12 22Z',
};
export function transformPath(d: string, x: number, y: number, scale: number, rotation = 0): string {
  const c = Math.cos(rotation), s = Math.sin(rotation);
  return d.replace(/(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/g, (_, a: string, b: string) => round(x + (Number(a) * c - Number(b) * s) * scale) + ' ' + round(y + (Number(a) * s + Number(b) * c) * scale));
}
export interface Batch { color: string; alpha: number; fill: string; stroke: string; width: number; d: string }
export function particleBatches(engine: Pick<ParticleEngine, 'particles'>): Batch[] {
  const groups = new Map<string, Batch>();
  for (const p of engine.particles) {
    const alpha = Math.max(.25, Math.ceil(Math.min(1, (p.life - p.t) * 3) * 4) / 4);
    const stroke = p.kind === 'spark' || p.kind === 'ring', width = p.kind === 'ring' ? 14 * (1 - p.t / p.life) + 2 : p.kind === 'spark' ? p.w : 3;
    const key = p.color + '/' + alpha + '/' + (stroke ? 'stroke' : 'fill');
    const group = groups.get(key) ?? { color: p.color, alpha, fill: stroke ? 'none' : p.color, stroke: stroke ? p.color : TOKENS.ink, width, d: '' };
    let d: string;
    if (p.kind === 'ring') d = circleD(p.x, p.y, p.radius * (.2 + p.t / p.life * .9));
    else if (p.kind === 'spark') d = 'M' + round(p.px - (p.x - p.px) * 2.5) + ' ' + round(p.py - (p.y - p.py) * 2.5) + 'L' + round(p.x) + ' ' + round(p.y);
    else if (p.kind === 'rect') d = rectangle(p);
    else if (p.kind === 'text' && p.text) { const glyph=glyphCache.get(p.text,p.w,1);d=transformPath(glyph.d,p.x-glyph.width/2,p.y-glyph.baseline,1,p.r);group.width=8; }
    else if (p.kind === 'icon' && p.icon === 'tomato') d = circleD(p.x, p.y, p.w * .35);
    else if (p.kind === 'icon' && icon[p.icon!]) {
      const scale = p.w / 24 * (p.t < .15 ? p.t / .15 * 1.2 : 1);
      d = transformPath(icon[p.icon!]!, p.x + Math.sin(p.t * 4 + p.phase) * 16 - 12 * scale, p.y - 12 * scale, scale, p.r);
    } else d = starD(p.x, p.y, p.w / 2, p.w / 4.4, p.r);
    group.d += d; groups.set(key, group);
  }
  return [...groups.values()];
}
