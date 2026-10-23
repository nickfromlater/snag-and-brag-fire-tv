import { SCORING } from '@snag/shared';
import { permutations } from './statistics.js';

export interface RoundOutcome { rounds: number; colorWins: number; colorTies: number; colorLosses: number; speedTrials: number; speedWins: number; speedTies: number; speedLosses: number; guaranteedWins: number }

/** Each round contains one clear object, two near-misses and one neutral distractor. */
export function roundOutcomes(trues: readonly number[], nears: readonly number[], distractors: readonly number[]): RoundOutcome {
  const result: RoundOutcome = { rounds: 0, colorWins: 0, colorTies: 0, colorLosses: 0, speedTrials: 0, speedWins: 0, speedTies: 0, speedLosses: 0, guaranteedWins: 0 };
  const orders = permutations(SCORING.SPEED_BONUS);
  for (const trueScore of trues) {
    for (let a = 0; a < nears.length; a++) for (let b = a + 1; b < nears.length; b++) {
      for (const distractor of distractors) {
        const otherScores = [nears[a]!, nears[b]!, distractor];
        const gap = trueScore - Math.max(...otherScores);
        result.rounds++;
        if (gap > 0) result.colorWins++; else if (gap === 0) result.colorTies++; else result.colorLosses++;
        if (gap > 30) result.guaranteedWins++;
        for (const bonuses of orders) {
          const speedGap = trueScore + bonuses[0]! - Math.max(...otherScores.map((score, i) => score + bonuses[i + 1]!));
          result.speedTrials++;
          if (speedGap > 0) result.speedWins++; else if (speedGap === 0) result.speedTies++; else result.speedLosses++;
        }
      }
    }
  }
  return result;
}
