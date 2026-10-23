import { SPRINGS } from '../constants';
import type { SpringName } from '../constants';

/** Render recipes copied from game.js; coordinates are in the 1280x720 logical stage.
 * Cues carry these values so native renderers do not have to reverse-engineer the demo. */
export const PARTICLES = {
  confetti: { starProbability: .2, speedFraction: [.4, 1], rotation: [0, 6], angularVelocity: [-12, 12], width: [10, 18], height: [6, 11] },
  stars: { angleJitter: [-.2, .2], speed: [300, 600], gravity: 0, drag: .9, angularVelocity: [-6, 6], width: [14, 24] },
  ring: { startRadius: .2, radiusGrowth: .9, startWidth: 16, endWidth: 2 },
  reaction: { velocityX: [-30, 30], drag: 1, rotation: [-.3, .3], angularVelocity: [-1, 1], width: [40, 60], phase: [0, 6], wobblePx: 16, wobbleHz: 4, popMs: 150, popScale: 1.2 },
  firework: { angleJitter: [-.06, .06], width: [3, 6], colors: 'alternating-color-paper', ringRadius: 70, stars: 5 },
} as const;
export const POINT_FLIGHT = {
  // dx/dy are chip minus source; substitute them into the last two translation pairs.
  frames: [
    { offset: 0, scale: .2, rotation: -25, opacity: 0, x: '0', y: '0' },
    { offset: .2, scale: 1.3, rotation: -6, opacity: 1, x: '0', y: '-44' },
    { offset: .42, scale: 1, rotation: -6, opacity: 1, x: '0', y: '-36' },
    { offset: .72, scale: .9, rotation: 6, opacity: 1, x: 'dx*.45', y: 'min(dy*.45,0)-110' },
    { offset: 1, scale: .42, rotation: 0, opacity: 1, x: 'dx', y: 'dy' },
  ],
  trail: { jitter: [-8, 8], velocityX: [-40, 40], velocityY: [20, 80], gravity: 200, drag: .96, angularVelocity: [-6, 6], width: [8, 14] },
} as const;
export const BRAG_SEAM = 'M716 -10L668 200L706 214L612 430L652 444L560 730';
export const PODIUMS = [
  { rank: 1, x: 540, y: 396, width: 200, height: 150, badgeSize: 132 },
  { rank: 2, x: 330, y: 412, width: 200, height: 134, badgeSize: 104 },
  { rank: 3, x: 750, y: 442, width: 200, height: 104, badgeSize: 92 },
] as const;

/** Exact springCurve integrator: 240 Hz, 72 sampled values, same settling threshold. */
function springCurve(k: number, damping: number): { durationMs: number; samples: number[] } {
  let x = 0, v = 0, t = 0; const dt = 1 / 240, points = [0];
  while (t < 3) {
    v += (-k * (x - 1) - damping * v) * dt; x += v * dt; t += dt; points.push(x);
    if (t > .25 && Math.abs(x - 1) < .0015 && Math.abs(v) < .02) break;
  }
  const samples = Array.from({ length: 72 }, (_, i) => Number(points[Math.round(i * (points.length - 1) / 71)]!.toFixed(4)));
  samples[71] = 1; return { durationMs: Math.round(t * 1000), samples };
}
export const SPRING_CURVES = Object.fromEntries(Object.entries(SPRINGS).map(([name, [k, d]]) => [name, springCurve(k, d)])) as Record<SpringName, { durationMs: number; samples: number[] }>;
