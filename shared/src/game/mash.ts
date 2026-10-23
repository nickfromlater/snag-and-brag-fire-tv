import { clamp } from '../pixelJudge';

/**
 * Accumulate signed taps on a 50 ms tick, WITHOUT a restoring force or early KO.
 * 0.036 per tap: a 14 vs 7 taps/s advantage travels 7*.036*4 = 1.008 in 4 s.
 * Even 6-8 taps/s opponents have at most .072/s systematic drift; independent
 * 100 ms batching/noise cancels rather than amplifying their individual totals.
 * Fighters always push their own side. Spectators choose a side per packet.
 * Bot pushes retain the mockup's .04-.17 units/s and spectator .025 units/s.
 * The full 6 s remains playable (a comeback is possible); the sign at the end wins.
 */
export const MASH_PUSH_PER_TAP = 0.036;
export const MASH_TICK_MS = 50;
export function mashPush(position: number, leftTaps: number, rightTaps: number, botDelta = 0): number {
  return clamp(position + (rightTaps - leftTaps) * MASH_PUSH_PER_TAP + botDelta, -1, 1);
}
