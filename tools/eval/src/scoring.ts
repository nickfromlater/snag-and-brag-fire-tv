import { SCORING, rgb2lab, hex2rgb, dE, clamp } from '@snag/shared';

export interface ScoringRule { id: string; scale: number; fraction: number }
export const RULES: readonly ScoringRule[] = [
  { id: 'shipped', scale: SCORING.DELTA_E_SCALE, fraction: 0.2 },
  { id: 'scale-1.50', scale: 1.5, fraction: 0.2 },
  { id: 'percentile-40', scale: SCORING.DELTA_E_SCALE, fraction: 0.4 },
  { id: 'scale-1.50-percentile-40', scale: 1.5, fraction: 0.4 },
];

/** Sensitivity experiment only. Never substitutes for judgePhoto in the baseline. */
export function sampleDistances(rgba: Uint8ClampedArray, size: number, target: string): number[] {
  const [r, g, b] = hex2rgb(target), lab = rgb2lab(r, g, b);
  const start = Math.floor(size * 0.2), width = Math.floor(size * 0.6), distances: number[] = [];
  let k = 0;
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++, k++) {
      if (k % 4) continue;
      const i = ((start + y) * size + start + x) * 4;
      distances.push(dE(rgb2lab(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!), lab));
    }
  }
  return distances.sort((a, b) => a - b);
}

export function distanceAt(sorted: readonly number[], fraction: number): number {
  if (!sorted.length || fraction <= 0 || fraction > 1) throw new Error('Invalid Pixel Judge percentile');
  return sorted[Math.max(1, Math.floor(sorted.length * fraction)) - 1]!;
}

export function experimentScore(sorted: readonly number[], rule: ScoringRule): number {
  return clamp(Math.round(100 - distanceAt(sorted, rule.fraction) * rule.scale), SCORING.MATCH_MIN, SCORING.MATCH_MAX);
}
