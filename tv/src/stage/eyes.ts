import { clamp } from '@snag/shared';

export interface EyeState { x: number; y: number; vx: number; vy: number; lx?: number; ly?: number }
export function createEye(rng = Math.random): EyeState {
  return { x: rng() * .6 - .3, y: .6, vx: rng() * 8 - 4, vy: rng() * 6 - 6 };
}
export function kickEye(e: EyeState, power: number, rng = Math.random): void {
  e.vx += (rng() * 2 - 1) * power; e.vy += (rng() * 1.3 - 1) * power;
}
/** Verbatim stepEyes integration; parent coordinates come from motion, never layout reads. */
export function stepEye(e: EyeState, dt: number, parent: { x: number; y: number; width: number }): EyeState {
  dt = clamp(dt, .001, .05);
  if (e.lx !== undefined && e.ly !== undefined) {
    const k = 7 / Math.max(20, parent.width);
    e.vx -= clamp((parent.x - e.lx) * k / dt * .06, -18, 18);
    e.vy -= clamp((parent.y - e.ly) * k / dt * .06, -18, 18);
  }
  e.lx = parent.x; e.ly = parent.y;
  e.vx += (-14 * e.x - 1.4 * e.vx) * dt;
  e.vy += (-14 * (e.y - .45) - 1.4 * e.vy + 2) * dt;
  e.x += e.vx * dt; e.y += e.vy * dt;
  const d = Math.hypot(e.x, e.y);
  if (d > 1) {
    e.x /= d; e.y /= d;
    const dot = e.vx * e.x + e.vy * e.y;
    e.vx -= 1.6 * dot * e.x; e.vy -= 1.6 * dot * e.y;
  }
  return e;
}

export const EYE_HZ = 30;
export const EYE_REST_Y = .45 + 2 / 14;
export interface EyeSample { time: number; x: number; y: number; vx: number; vy: number }
export interface EyeTrajectory { samples: readonly EyeSample[]; duration: number }
export interface EyeKick {
  power: number;
  /** Sample rnd(-1, 1) and rnd(-1, .3) once, before calling the pure sampler. */
  direction: { x: number; y: number };
  /** Parent displacement over the preceding physics step, in stage coordinates. */
  parentImpulse?: { x: number; y: number; width: number };
}

/** Precompute the reference pendulum; neither the input nor any external state changes. */
export function sampleEyeTrajectory(initial: Readonly<EyeState>, kick?: EyeKick): EyeTrajectory {
  const dt = 1 / EYE_HZ, e: EyeState = { x: initial.x, y: initial.y, vx: initial.vx, vy: initial.vy };
  if (kick) {
    e.vx += kick.direction.x * kick.power; e.vy += kick.direction.y * kick.power;
    if (kick.parentImpulse) {
      const p = kick.parentImpulse, k = 7 / Math.max(20, p.width);
      e.vx -= clamp(p.x * k / dt * .06, -18, 18);
      e.vy -= clamp(p.y * k / dt * .06, -18, 18);
    }
  }
  const sample = (time: number): EyeSample => ({ time, x: e.x, y: e.y, vx: e.vx, vy: e.vy });
  const samples = [sample(0)];
  // The reference's damping has a several-second tail. Keep it instead of changing
  // the physics to force the brief's estimated 1–1.5 s settling time.
  for (let frame = 1; frame <= EYE_HZ * 10; frame++) {
    stepEye(e, dt, { x: 0, y: 0, width: 120 });
    samples.push(sample(frame * dt));
    if (frame >= EYE_HZ && Math.hypot(e.x, e.y - EYE_REST_Y) < .035 && Math.hypot(e.vx, e.vy) < .15) break;
  }
  return { samples, duration: samples[samples.length - 1]!.time };
}

/** The same linear interpolation as RN Animated, including velocity for interrupted kicks. */
export function eyeAt(trajectory: EyeTrajectory, elapsed: number, loop = false): EyeState {
  const time = loop ? ((elapsed % trajectory.duration) + trajectory.duration) % trajectory.duration : clamp(elapsed, 0, trajectory.duration);
  const frame = time * EYE_HZ, index = Math.min(trajectory.samples.length - 2, Math.floor(frame));
  const a = trajectory.samples[index]!, b = trajectory.samples[index + 1]!, t = clamp((time - a.time) / (b.time - a.time), 0, 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, vx: a.vx + (b.vx - a.vx) * t, vy: a.vy + (b.vy - a.vy) * t };
}

/** A closed gentle idle loop, starting exactly at the preceding trajectory's position. */
export function sampleEyeSway(initial: Readonly<EyeState>, phase: number): EyeTrajectory {
  const duration = 3.6, frames = Math.round(duration * EYE_HZ), w = Math.PI * 2 / duration;
  const samples = Array.from({ length: frames + 1 }, (_, frame): EyeSample => {
    const time = frame / EYE_HZ, angle = phase + time * w;
    return { time, x: initial.x + .12 * (Math.sin(angle) - Math.sin(phase)),
      y: initial.y + .025 * (Math.cos(angle) - Math.cos(phase)), vx: .12 * w * Math.cos(angle), vy: -.025 * w * Math.sin(angle) };
  });
  samples[frames] = { ...samples[0]!, time: duration };
  return { samples, duration };
}
