import { COLORS, JUDGE_SIZE, judgePhoto, judgeMask } from '@snag/shared';
import { RULES, sampleDistances, distanceAt, experimentScore } from './scoring.js';

export interface PixelResult {
  id: string;
  targets: Record<string, { hex: string; match: number; mask: string; delta20: number; delta40: number; scores: Record<string, number> }>;
}

export function evaluatePixels(id: string, rgba: Uint8ClampedArray): PixelResult {
  const result: PixelResult = { id, targets: {} };
  for (const color of COLORS) {
    const official = judgePhoto(rgba, JUDGE_SIZE, color.hex), mask = judgeMask(rgba, JUDGE_SIZE, color.hex);
    if (mask !== official.mask) throw new Error('judgeMask and judgePhoto disagree');
    const distances = sampleDistances(rgba, JUDGE_SIZE, color.hex);
    const scores = Object.fromEntries(RULES.map(rule => [rule.id, experimentScore(distances, rule)]));
    if (scores.shipped !== official.match) throw new Error('Experiment baseline disagrees with shipped judgePhoto');
    result.targets[color.k] = { ...official, mask, delta20: distanceAt(distances, 0.2), delta40: distanceAt(distances, 0.4), scores };
  }
  return result;
}
