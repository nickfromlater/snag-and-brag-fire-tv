import { BRAGP, COLORS, SHOWP } from '../constants';
import type { Prompt } from '../constants';
import { OBJI } from '../objects';
import { judgePhoto } from '../pixelJudge';
import type { Clock } from './types';

export interface ShowcaseFind { obj: string; name: number; brag: number; snagMs: number }
export interface ShowcaseRound { prompt: Prompt; finds: readonly ShowcaseFind[] }
/** Seat numbers refer to the joined roster, never to protocol/client identifiers. */
export interface ShowcaseScript {
  id: string;
  joinMs: readonly number[];
  startMs: number;
  rounds: readonly ShowcaseRound[];
  bracket: readonly [number, number][];
  matchWinners: readonly number[];
  voteFor: readonly number[];
  voteMs: readonly number[];
}
export interface ShowcaseOptions { seed: number; script: ShowcaseScript }
/** Valid protocol-shaped dummy id, never a real phone/reconnect credential. */
export const SHOWCASE_HOST_CID = '000000000000000000000000000000de';
const find = (obj: string, name: number, snagMs: number, brag = 0): ShowcaseFind => ({ obj, name, snagMs, brag });
/** All prompts, objects, names and brags come from the approved reference catalog. */
export const SHOWCASE_SCRIPT: ShowcaseScript = {
  id: 'submission-v1', joinMs: [2000, 3200, 4400, 5600], startMs: 9000,
  rounds: [
    { prompt: { kind: 'color', ...COLORS.find(p => p.k === 'PINK')! }, finds: [find('glove', 0, 7000), find('donut', 1, 11000), find('lava', 0, 15000), find('robot', 1, 19000)] },
    { prompt: { kind: 'brag', ...BRAGP[0]! }, finds: [find('duck', 1, 7000, 1), find('crown', 1, 11000, 1), find('portrait', 0, 15000), find('pan', 0, 19000)] },
    { prompt: { kind: 'show', ...SHOWP[0]! }, finds: [find('sock', 1, 7000), find('lava', 1, 11000), find('whisk', 0, 15000, 1), find('dino', 2, 19000, 1)] },
  ],
  bracket: [[0, 1], [2, 3]], matchWinners: [1, 2, 2],
  voteFor: [3, 0, 0, 1], voteMs: [1800, 3000, 4300, 5700],
};

export function createShowcase(seed = 20261022, script = SHOWCASE_SCRIPT): ShowcaseOptions {
  if (!Number.isSafeInteger(seed)) throw new Error('Showcase seed must be an integer');
  if (script.rounds.length !== 3 || script.joinMs.length !== 4 || script.voteFor.length !== 4 || script.voteMs.length !== 4 || script.matchWinners.length !== 3 || script.bracket.length !== 2) throw new Error('Showcase scripts require four seats and three rounds');
  const seat = (n: number) => Number.isInteger(n) && n >= 0 && n < 4;
  const time = (n: number) => Number.isFinite(n) && n >= 0;
  if (!time(script.startMs) || !script.joinMs.every(time) || Math.max(...script.joinMs) >= script.startMs || !script.voteMs.every(n => time(n) && n < 10_000)) throw new Error('Invalid showcase timing');
  for (const [i, round] of script.rounds.entries()) {
    if (round.prompt.kind !== ['color', 'brag', 'show'][i] || round.finds.length !== 4 || new Set(round.finds.map(f => f.obj)).size !== 4) throw new Error('Invalid showcase round');
    for (const f of round.finds) {
      const o = OBJI[f.obj];
      if (!o || !o.names[f.name] || !o.brags[f.brag] || !time(f.snagMs) || f.snagMs >= 35_000) throw new Error('Invalid showcase find');
    }
  }
  if (!script.voteFor.every((n, i) => seat(n) && n !== i) || !script.matchWinners.every(seat)
    || new Set(script.bracket.flat()).size !== 4 || !script.bracket.flat().every(seat)
    || !script.bracket.every((pair, i) => pair.includes(script.matchWinners[i]!))
    || !script.matchWinners.slice(0, 2).includes(script.matchWinners[2]!)) throw new Error('Invalid showcase ballot or bracket');
  // A caller cannot change a recording in progress by mutating its config.
  return { seed, script: { ...script, joinMs: [...script.joinMs], voteFor: [...script.voteFor], voteMs: [...script.voteMs], matchWinners: [...script.matchWinners], bracket: script.bracket.map(p => [...p] as [number, number]), rounds: script.rounds.map(r => ({ prompt: { ...r.prompt }, finds: r.finds.map(f => ({ ...f })) })) } };
}

/** The final stays within 23% of center and ends with a ten-percent advantage. */
export function showcaseMashPosition(elapsedMs: number, final: boolean, winnerSide: -1 | 1): number {
  const t = Math.max(0, Math.min(1, elapsedMs / 6000));
  return winnerSide * (final ? .1 : .38) * t ** 3 + .13 * Math.sin(t * Math.PI * 8) * Math.sin(t * Math.PI);
}

/** Synthetic pixels only; the same closest-20% judge used on phones lights the mask. */
export function showcaseJudgeMask(hex: string, target: string): string {
  const size = 120, pixels = new Uint8Array(size * size * 4), rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (y * size + x) * 4, inside = (x - 60) ** 2 / 32 ** 2 + (y - 64) ** 2 / 38 ** 2 < 1;
    pixels[at] = inside ? rgb[0]! : 14; pixels[at + 1] = inside ? rgb[1]! : 11; pixels[at + 2] = inside ? rgb[2]! : 43; pixels[at + 3] = 255;
  }
  return judgePhoto(pixels, size, target).mask!;
}

/** A capture clock can replay to an overlapping cut without showing a pause menu.
 * Use this clock only for the explicit showcase flag; live rooms use relay time. */
export class ShowcaseClock implements Clock {
  private at = 0;
  private serial = 0;
  private tasks = new Map<number, { at: number; callback: () => void }>();
  now(): number { return this.at; }
  setTimeout(callback: () => void, delayMs: number): number {
    const id = ++this.serial; this.tasks.set(id, { at: this.at + Math.max(0, delayMs), callback }); return id;
  }
  clearTimeout(handle: unknown): void { this.tasks.delete(handle as number); }
  advanceTo(target: number): void {
    if (!Number.isFinite(target) || target < this.at) throw new Error('Capture clock cannot move backward; recreate the session');
    for (let i = 0; i < 100_000; i++) {
      let next: [number, { at: number; callback: () => void }] | undefined;
      for (const entry of this.tasks) if (!next || entry[1].at < next[1].at || entry[1].at === next[1].at && entry[0] < next[0]) next = entry;
      if (!next || next[1].at > target) { this.at = target; return; }
      this.tasks.delete(next[0]); this.at = next[1].at; next[1].callback();
    }
    throw new Error('Showcase clock runaway');
  }
}
