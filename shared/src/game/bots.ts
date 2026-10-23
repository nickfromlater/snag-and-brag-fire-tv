import { BRAGP, COLORS, SHOWP } from '../constants';
import type { Prompt, RoundKind } from '../constants';
import { OBJ } from '../objects';
import type { GameObject, ObjectTrait } from '../objects';
import { colorMatch } from '../pixelJudge';
import { pick, random } from './random';
import type { Rng } from './types';

export function choosePrompt(kind: RoundKind, rng: Rng): Prompt {
  if (kind === 'color') {
    const eligible = COLORS.filter(c => OBJ.filter(o => colorMatch(o.col, c.hex) > 85).length >= 2);
    return { kind, ...pick(rng, eligible) };
  }
  return { kind, ...pick(rng, kind === 'brag' ? BRAGP : SHOWP) };
}
export function objectFit(object: GameObject, prompt: Prompt): number {
  return prompt.kind === 'color' ? colorMatch(object.col, prompt.hex) : object.t[prompt.t as ObjectTrait] * 10;
}
/** Bots avoid their own round's previous cartoon picks; real photos cannot be locked. */
export function botPick(prompt: Prompt, taken: ReadonlySet<string>, rng: Rng): GameObject {
  return OBJ.filter(o => !taken.has(o.id)).map(o => ({ o, score: objectFit(o, prompt) + random(rng, 0, prompt.kind === 'color' ? 30 : 40) }))
    .sort((a, b) => b.score - a.score)[0]!.o;
}
