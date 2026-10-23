import { isJudgeMask, JUDGE_MASK_BYTES, JUDGE_MASK_CELLS } from '@snag/shared';
import { animationPose } from './motion';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function maskDrawing(mask: unknown): { d: string; rows: string[]; cells: number; runs: number } | null {
  if (!isJudgeMask(mask)) return null;
  const bytes = new Uint8Array(JUDGE_MASK_BYTES);
  for (let i = 0, j = 0; i < mask.length; i += 4) {
    const n = (alphabet.indexOf(mask[i]!) << 18) | (alphabet.indexOf(mask[i + 1]!) << 12) | (alphabet.indexOf(mask[i + 2]!) << 6) | alphabet.indexOf(mask[i + 3]!);
    bytes[j++] = n >>> 16; bytes[j++] = n >>> 8; bytes[j++] = n;
  }
  const rows = Array<string>(JUDGE_MASK_CELLS).fill(''); let cells = 0, runs = 0;
  const on = (x: number, y: number) => { const bit = y * JUDGE_MASK_CELLS + x; return !!(bytes[bit >>> 3]! & (1 << (bit & 7))); };
  for (let y = 0; y < JUDGE_MASK_CELLS; y++) for (let x = 0; x < JUDGE_MASK_CELLS;) {
    if (!on(x, y)) { x++; continue; }
    const start = x; while (x < JUDGE_MASK_CELLS && on(x, y)) { x++; cells++; }
    const width = Number((x - start - .16).toFixed(2)); runs++;
    rows[y] += `M${start + .08} ${y + .08}h${width}v.84h-${width}Z`;
  }
  return { d: rows.join(''), rows, cells, runs };
}
/** Continuous reveal edge follows the exact reference beam, in mask-grid units. */
export function maskClipHeight(animation: Parameters<typeof animationPose>[0], elapsed: number): number {
  const photoY = 22 + 170 / 12, innerSize = 170 * 100 / 120;
  return Math.max(0, Math.min(JUDGE_MASK_CELLS, ((animationPose(animation, elapsed).top ?? 30) + 7 - photoY) / innerSize * JUDGE_MASK_CELLS));
}
export function maskRowTime(animation: Parameters<typeof animationPose>[0], row: number): number {
  const photoY = 22 + 170 / 12, innerSize = 170 * 100 / 120;
  const threshold = photoY + (row + .5) / JUDGE_MASK_CELLS * innerSize;
  let low = 0, high = animation.durationMs ?? 800;
  for (let i = 0; i < 24; i++) { const mid = (low + high) / 2; if ((animationPose(animation, mid).top ?? 30) + 7 < threshold) low = mid; else high = mid; }
  return high;
}
// core.judgeFlow waits 820 ms for an 800 ms beam, then fills the meter for 800 ms.
export const MASK_METER_SETTLE_MS = 820, MASK_HOLD_MS = 450, MASK_FADE_MS = 220;
