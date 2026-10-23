import { CONFETTI, SPRINGS, clamp } from '@snag/shared';
import type { SpringName } from '@snag/shared';
import type { EyeLayout } from './art';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export function haptic(pattern: number | number[]): void { try { navigator.vibrate?.(pattern); } catch { /* Safari has no vibrate API. */ } }

/** Integration and samples are copied from springCurve in the approved game.js. */
export function springCurve(k: number, c: number): { easing: string; duration: number } {
  let x = 0, v = 0, t = 0; const dt = 1 / 240, points = [0];
  while (t < 3) {
    v += (-k * (x - 1) - c * v) * dt; x += v * dt; t += dt; points.push(x);
    if (t > .25 && Math.abs(x - 1) < .0015 && Math.abs(v) < .02) break;
  }
  const out = Array.from({ length: 72 }, (_, i) => points[Math.round(i * (points.length - 1) / 71)]!.toFixed(4));
  out[71] = '1'; return { easing: `linear(${out.join(',')})`, duration: Math.round(t * 1000) };
}
const curves = Object.fromEntries(Object.entries(SPRINGS).map(([key, [k, c]]) => [key, CSS.supports('transition-timing-function', 'linear(0, 1)') ? springCurve(k, c) : { easing: 'cubic-bezier(.34,1.56,.64,1)', duration: 600 }])) as Record<SpringName, { easing: string; duration: number }>;
document.documentElement.style.setProperty('--spring', curves.pop.easing);
export function animate(element: Element, frames: Keyframe[], spring: SpringName = 'pop', options: KeyframeAnimationOptions = {}): Animation {
  return element.animate(frames, { ...curves[spring], duration: reduced ? 1 : curves[spring].duration, fill: 'none', ...options });
}
export function phoneTransition(element: Element): void {
  animate(element, [{ opacity: 0, transform: 'translateX(30px) rotate(1.2deg)' }, { opacity: 1, transform: 'none' }], 'soft');
}
export function press(element: Element): void { element.classList.add('press'); setTimeout(() => element.classList.remove('press'), 90); }

interface Eye {
  host: HTMLElement; el: HTMLElement; pupil: HTMLElement;
  x: number; y: number; vx: number; vy: number; lx: number | null; ly: number | null;
}
export class GooglyEyes {
  private eyes: Eye[] = [];
  addEyes(host: HTMLElement, layout: [EyeLayout[0] | null, EyeLayout[1] | null, number]): void {
    const r = layout[2] || 8;
    for (const position of [layout[0], layout[1]]) {
      if (!position) continue;
      const element = document.createElement('div'); element.className = 'gg'; const size = r * 2 / 120 * 100;
      element.style.cssText = `width:${size}%;height:${size}%;left:${position[0] / 120 * 100 - size / 2}%;top:${position[1] / 120 * 100 - size / 2}%`;
      element.innerHTML = '<i></i>'; host.append(element);
      this.eyes.push({ host, el: element, pupil: element.firstElementChild as HTMLElement, x: rnd(-.3, .3), y: .6, vx: rnd(-4, 4), vy: rnd(-6, 0), lx: null, ly: null });
    }
  }
  kickEyes(host: HTMLElement | null, power: number): void {
    if (reduced) return;
    for (const eye of this.eyes) if (!host || host.contains(eye.el)) { eye.vx += rnd(-1, 1) * power; eye.vy += rnd(-1, .3) * power; }
  }
  /** Damped pendulums copied from stepEyes/addEyes/kickEyes, including sticker inertia. */
  stepEyes(dt: number): void {
    const boxes = new Map<HTMLElement, { x: number; y: number; w: number }>();
    this.eyes = this.eyes.filter((e) => e.el.isConnected);
    for (const e of this.eyes) {
      if (reduced) continue;
      let box = boxes.get(e.host);
      if (!box) { const r = e.host.getBoundingClientRect(); box = { x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.max(20, r.width) }; boxes.set(e.host, box); }
      if (e.lx !== null && e.ly !== null) {
        const k = 7 / box.w;
        e.vx -= clamp((box.x - e.lx) * k / dt * .06, -18, 18); e.vy -= clamp((box.y - e.ly) * k / dt * .06, -18, 18);
      }
      e.lx = box.x; e.ly = box.y;
      e.vx += (-14 * e.x - 1.4 * e.vx) * dt; e.vy += (-14 * (e.y - .45) - 1.4 * e.vy + 2) * dt;
      e.x += e.vx * dt; e.y += e.vy * dt;
      const d = Math.hypot(e.x, e.y);
      if (d > 1) { e.x /= d; e.y /= d; const dot = e.vx * e.x + e.vy * e.y; e.vx -= 1.6 * dot * e.x; e.vy -= 1.6 * dot * e.y; }
      e.pupil.style.transform = `translate(${(e.x * 42).toFixed(1)}%,${(e.y * 42).toFixed(1)}%)`;
    }
  }
}

interface Particle { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; t: number; life: number }
export class PhoneFX {
  private particles: Particle[] = [];
  private w = 0; private h = 0; private d = 1; private dirty = false;
  constructor(private readonly canvas: HTMLCanvasElement, private readonly root: HTMLElement) {}
  private fit(): void {
    const r = this.root.getBoundingClientRect(); this.d = Math.min(2, devicePixelRatio || 1);
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.max(1, Math.round(this.w * this.d)); this.canvas.height = Math.max(1, Math.round(this.h * this.d));
  }
  burst(n: number, colors: readonly string[] = CONFETTI, x?: number, y?: number): void {
    this.fit(); n = reduced ? Math.ceil(n / 3) : n; x ??= this.w / 2; y ??= Math.min(this.h * .35, 260);
    for (let i = 0; i < n && this.particles.length < 300; i++) {
      const angle = -Math.PI / 2 + rnd(-1.25, 1.25), speed = rnd(260, 720);
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: rnd(0, 6), vr: rnd(-12, 12), w: rnd(7, 12), h: rnd(4, 8), c: colors[Math.floor(Math.random() * colors.length)]!, t: 0, life: rnd(1.2, 2) });
    }
  }
  at(element: Element, n: number, colors?: readonly string[]): void {
    const r = element.getBoundingClientRect(), p = this.root.getBoundingClientRect();
    this.burst(n, colors, r.left + r.width / 2 - p.left, r.top + r.height / 2 - p.top);
  }
  draw(dt: number): void {
    const ctx = this.canvas.getContext('2d'); if (!ctx) return;
    if (!this.particles.length) { if (this.dirty) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.dirty = false; } return; }
    this.dirty = true; ctx.setTransform(this.d, 0, 0, this.d, 0, 0); ctx.clearRect(0, 0, this.w, this.h);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!; p.t += dt; if (p.t > p.life) { this.particles.splice(i, 1); continue; }
      p.vx *= .985; p.vy = p.vy * .985 + 1100 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(1, Math.cos(p.t * 9 + p.w));
      ctx.globalAlpha = Math.min(1, (p.life - p.t) * 3); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
  }
}
