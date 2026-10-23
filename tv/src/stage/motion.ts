import { SPRING_CURVES, clamp } from '@snag/shared';
import type { Animation, MotionFrame, MotionState } from '@snag/shared';

export interface Pose { x: number; y: number; sx: number; sy: number; rotation: number; rotationY: number; opacity: number; width?: number; top?: number; left?: number }
/** CSS layout percentages use the containing box; transforms use the element itself. */
export interface LayoutBasis { width: number; height: number }
export const IDENTITY: Pose = { x: 0, y: 0, sx: 1, sy: 1, rotation: 0, rotationY: 0, opacity: 1 };
/** One native transform avoids nested transform graph composition around SVG content. */
export function transformMatrix(x: number, y: number, sx: number, sy: number, degrees: number): number[] {
  'worklet';
  const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  return [sx * c, sy * s, 0, 0, -sx * s, sy * c, 0, 0, 0, 0, 1, 0, x, y, 0, 1];
}
const number = (s: string, basis: number) => parseFloat(s) * (s.includes('%') ? basis / 100 : 1);
export function parseFrame(frame: MotionFrame, width = 1280, height = 720, layout: LayoutBasis = { width, height }): Pose {
  const p = { ...IDENTITY, opacity: frame.opacity ?? 1 };
  const re = /(translateX|translateY|translate|translate3d|scaleX|scaleY|scale|rotateY|rotate)\(([^)]+)\)/g;
  for (const m of (frame.transform ?? '').matchAll(re)) {
    const a = m[2]!.split(/[,\s]+/), v = a[0]!, w = a[1] ?? v;
    if (m[1] === 'translate') { p.x += number(v, width); p.y += number(w, height); }
    else if (m[1] === 'translate3d') { p.x += number(v, width); p.y += number(w, height); }
    else if (m[1] === 'translateX') p.x += number(v, width);
    else if (m[1] === 'translateY') p.y += number(v, height);
    else if (m[1] === 'scale') { p.sx *= parseFloat(v); p.sy *= parseFloat(w); }
    else if (m[1] === 'scaleX') p.sx *= parseFloat(v);
    else if (m[1] === 'scaleY') p.sy *= parseFloat(v);
    else if (m[1] === 'rotateY') p.rotationY += parseFloat(v);
    else if (m[1] === 'rotate') p.rotation += parseFloat(v);
  }
  if (frame.xPercent !== undefined) p.x += frame.xPercent * 12.8;
  if (frame.width !== undefined) p.width = number(frame.width, layout.width);
  if (frame.top !== undefined) p.top = number(frame.top, layout.height);
  if (frame.left !== undefined) p.left = number(frame.left, layout.width);
  return p;
}
/** CSS cubic-bezier inversion; preserves all four control points including overshoot. */
function easingSampler(easing: string | undefined): (t: number) => number {
  if (easing === 'quart-out') return t => 1 - Math.pow(1 - clamp(t, 0, 1), 4);
  if (easing === 'cubic-out') return t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const aliases: Record<string, string> = { 'ease-in-out': 'cubic-bezier(.42,0,.58,1)', 'ease-in': 'cubic-bezier(.42,0,1,1)', 'ease-out': 'cubic-bezier(0,0,.58,1)' };
  const match = (aliases[easing ?? ''] ?? easing ?? 'linear').match(/cubic-bezier\(([^)]+)\)/);
  if (!match) return t => clamp(t, 0, 1);
  const values = match[1]!.split(',').map(Number), [x1, y1, x2, y2] = values as [number, number, number, number];
  const cubic = (q: number, a: number, b: number) => 3 * (1 - q) ** 2 * q * a + 3 * (1 - q) * q * q * b + q ** 3;
  return t => {
    t = clamp(t, 0, 1); let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (cubic(mid, x1, x2) < t) lo = mid; else hi = mid; }
    return cubic((lo + hi) / 2, y1, y2);
  };
}
export function easingAt(easing: string | undefined, t: number): number { return easingSampler(easing)(t); }
export function springAt(name: NonNullable<Animation['spring']>, p: number): number {
  const samples = SPRING_CURVES[name].samples, x = clamp(p, 0, 1) * (samples.length - 1), i = Math.floor(x);
  return samples[i]! + ((samples[Math.min(i + 1, samples.length - 1)]!) - samples[i]!) * (x - i);
}
export function animationPose(a: Animation, elapsedMs: number, width = 1280, height = 720, layout: LayoutBasis = { width, height }): Pose {
  return animationSampler(a, width, height, layout)(elapsedMs);
}
function animationSampler(a: Animation, width: number, height: number, layout: LayoutBasis): (elapsedMs: number) => Pose {
  const duration = a.durationMs ?? (a.spring ? SPRING_CURVES[a.spring].durationMs : 420);
  const iterations = a.iterations === 'infinite' ? Infinity : a.iterations;
  const ease = easingSampler(a.easing);
  const frames = a.frames.map((f, i) => ({ p: parseFrame(f, width, height, layout), offset: f.offset ?? i / Math.max(1, a.frames.length - 1) }));
  return elapsedMs => {
  if (elapsedMs < 0 && a.fill === 'none' || elapsedMs >= duration * iterations && a.fill !== 'both') return { ...IDENTITY };
  let t = elapsedMs >= duration * iterations ? 1 : clamp(elapsedMs, 0, Number.MAX_SAFE_INTEGER) % duration / Math.max(1, duration);
  t = a.spring ? springAt(a.spring, t) : ease(t);
  let i = 0; while (i < frames.length - 2 && t > frames[i + 1]!.offset) i++;
  const left = frames[i]!, right = frames[Math.min(i + 1, frames.length - 1)]!;
  const f = (t - left.offset) / Math.max(.00001, right.offset - left.offset), result = { ...IDENTITY };
  for (const k of Object.keys(result) as (keyof Pose)[]) result[k] = left.p[k]! + (right.p[k]! - left.p[k]!) * f;
  for (const k of ['width', 'top', 'left'] as const) if (left.p[k] !== undefined || right.p[k] !== undefined) result[k] = (left.p[k] ?? right.p[k]!) + ((right.p[k] ?? left.p[k]!) - (left.p[k] ?? right.p[k]!)) * f;
  return result;
  };
}
export function stackPose(states: MotionState[], elapsedSinceSnapshot: number, width: number, height: number, layout: LayoutBasis = { width, height }): Pose {
  return stackPoseSampler(states, width, height, layout)(elapsedSinceSnapshot);
}
/** Parse keyframes once for a whole sampled trajectory or eye-parent track. */
export function stackPoseSampler(states: MotionState[], width: number, height: number, layout: LayoutBasis = { width, height }): (elapsed: number) => Pose {
  const compiled = states.map(state => ({ state, sample: animationSampler(state.animation, width, height, layout),
    transform: state.animation.frames.some(f => f.transform !== undefined || f.xPercent !== undefined),
    opacity: state.animation.frames.some(f => f.opacity !== undefined) }));
  return elapsedSinceSnapshot => {
  let result = { ...IDENTITY };
  for (const { state, sample, transform, opacity } of compiled) {
    const elapsed = state.elapsedMs + elapsedSinceSnapshot;
    if (elapsed < 0 && state.animation.fill === 'none' || !state.active && state.animation.fill !== 'both') continue;
    const p = sample(elapsed);
    // CSS animations replace each property independently, in creation order.
    if (transform) {
      result = { ...result, x: p.x, y: p.y, sx: p.sx, sy: p.sy, rotation: p.rotation, rotationY: p.rotationY };
    }
    if (opacity) result.opacity = p.opacity;
    for (const k of ['width', 'top', 'left'] as const) if (p[k] !== undefined) result[k] = p[k];
  }
  return result;
  };
}
/** Animate CSS width/left/top with transforms, retaining semantic layout in reduced motion. */
export function renderPose(states: MotionState[], elapsed: number, width: number, height: number, layout: LayoutBasis, reduced = false, rotate = 0): Pose {
  return renderPoseSampler(states, width, height, layout, reduced, rotate)(elapsed);
}
export function renderPoseSampler(states: MotionState[], width: number, height: number, layout: LayoutBasis, reduced = false, rotate = 0): (elapsed: number) => Pose {
  const sample = stackPoseSampler(states, width, height, layout), initial = sample(0);
  return elapsed => {
  const p = sample(elapsed);
  if (reduced) { p.x = p.y = 0; p.sx = p.sy = 1; p.rotation = rotate; p.rotationY = 0; }
  if (p.width !== undefined) { p.sx *= p.width / width; p.x += (p.width - width) / 2; }
  if (p.left !== undefined) p.x += p.left - (initial.left ?? 0);
  if (p.top !== undefined) p.y += p.top - (initial.top ?? 0);
  return p;
  };
}

/** Suppress choreography while retaining the authoritative meter width. */
export function reducedPose(pose: Pose, width: number, rotation = 0): Pose {
  return { ...pose, x: pose.width === undefined ? 0 : (pose.width - width) / 2, y: 0, sx: pose.width === undefined ? 1 : pose.width / width, sy: 1, rotation, rotationY: 0 };
}
