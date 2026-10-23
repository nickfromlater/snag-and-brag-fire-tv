import { clamp } from '@snag/shared';
import type { MotionState } from '@snag/shared';
import { animationPose } from './motion';

/** A deadline is on the game clock; a pause freezes the supplied reading. */
export function dialReading(deadline: number | undefined, total: number | undefined, now: number) {
  const left = Math.max(0, (deadline ?? now) - now);
  return { seconds: Math.ceil(left / 1000), fraction: clamp(left / Math.max(1, total ?? 0), 0, 1), urgent: left <= 10000 };
}

/** The reference meter rolls cubically, independently of its bar's bezier. */
export function meterReading(value: number, states: MotionState[], elapsedSinceSnapshot: number): number {
  const state = states.at(-1);
  if (!state) return 0;
  const p = clamp((state.elapsedMs + elapsedSinceSnapshot) / state.durationMs, 0, 1);
  return Math.round(value * (1 - Math.pow(1 - p, 3)));
}

/** One packed SVG path per shade, rather than one native view per pixel. */
export function pixelPaths(hex: string, seed: number, size = 10, jitter = 70): { fill: string; d: string }[] {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const paths = Array.from({ length: 15 }, () => '');
  let n = seed >>> 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    paths[n % paths.length] += `M${x} ${y}h1v1h-1z`;
  }
  return paths.map((d, i) => ({ d, fill: 'rgb(' + rgb.map(c => Math.round(clamp(c + (i / 14 * 2 - 1) * jitter, 0, 255))).join(',') + ')' }));
}

export function panoramaOffset(center: readonly number[], width: number, height: number, t: number) {
  const jitterX = Math.sin(t * 2.1) * 5 + Math.sin(t * 5.3) * 2, jitterY = Math.cos(t * 1.7) * 4;
  return { x: clamp(center[0]! * .3 - width / 2 + jitterX, 0, 720 - width), y: clamp(center[1]! * .3 - height / 2 + jitterY, 0, 360 - height) };
}

/** Exact 60Hz integration of F.x += (target-F.x) * dt * sp in stepFeeds. */
export function cameraTracking(speed: number) {
  const step = 1 - speed / 60, frames = Math.ceil(Math.log(.00001) / Math.log(step));
  return { durationMs: frames * 1000 / 60, at: (progress: number) => 1 - Math.pow(step, frames * progress) };
}

export function flipFront(state: MotionState | undefined, elapsedSinceSnapshot = 0): boolean {
  return !!state && animationPose(state.animation, state.elapsedMs + elapsedSinceSnapshot).rotationY >= 90;
}

/** The reference bezier reaches its 90 degree keyframe before half of wall time. */
export function flipSwapMs(state: MotionState): number {
  let low = 0, high = state.durationMs;
  for (let i = 0; i < 24; i++) {
    const middle = (low + high) / 2;
    if (animationPose(state.animation, middle).rotationY >= 90) high = middle; else low = middle;
  }
  return high;
}
