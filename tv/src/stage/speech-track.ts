import type { SpeechMark } from '@snag/shared';

/** Polly's articulation reduced to the reference puppet's single jaw axis. */
export const VISEME_JAW: Readonly<Record<string, number>> = {
  p: 0, t: .28, S: .35, T: .3, f: .18, k: .45, i: .25, r: .4, s: .2,
  u: .4, '@': .55, a: 1, e: .6, E: .75, o: .65, O: .85, sil: 0,
};
export function visemeJaw(code: string): number { return VISEME_JAW[code] ?? 0; }
export function smoothJaw(open: number, target: number, dt: number, talking: boolean): number {
  return open + (target - open) * Math.min(1, Math.max(0, dt) * (talking ? 18 : 10));
}
interface Key { time: number; value: number }
function at(keys: readonly Key[], time: number): number {
  let lo = 0, hi = keys.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (keys[mid]!.time <= time) lo = mid + 1; else hi = mid; }
  return lo ? keys[lo - 1]!.value : 0;
}
const normalized = (word: string) => word.toLocaleLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^\p{L}\p{N}']/gu, '');
/** Compile once per clip. Word offsets refer to display text, never SSML byte offsets.
 * Native and web sample both tracks from the same media currentTime; no mark timers. */
export class SpeechTrack {
  readonly plain: string;
  readonly words: readonly Key[];
  readonly jaw: readonly Key[];
  constructor(text: string, marks: readonly SpeechMark[], readonly durationMs: number) {
    this.plain = text.replace(/\*\*/g, '');
    const words: Key[] = [], jaw: Key[] = [];
    let cursor = 0;
    for (const mark of [...marks].sort((a, b) => a.time - b.time)) {
      if (!Number.isFinite(mark.time) || mark.time < 0 || mark.time > durationMs) continue;
      if (mark.type === 'viseme') { jaw.push({ time: mark.time, value: visemeJaw(mark.value) }); continue; }
      const wanted = normalized(mark.value);
      if (!wanted) continue;
      // Match repeated words, punctuation and Unicode names in source order.
      const tokens = /\S+/g; tokens.lastIndex = cursor;
      let token: RegExpExecArray | null;
      while ((token = tokens.exec(this.plain))) {
        const value = normalized(token[0]);
        if (value !== wanted && !value.startsWith(wanted)) continue;
        cursor = token.index + token[0].length;
        words.push({ time: mark.time, value: cursor }); break;
      }
    }
    words.push({ time: durationMs, value: this.plain.length });
    jaw.push({ time: durationMs, value: 0 });
    this.words = words; this.jaw = jaw;
  }
  sample(timeMs: number): { characters: number; target: number; talking: boolean } {
    return { characters: at(this.words, timeMs), target: at(this.jaw, timeMs), talking: timeMs >= 0 && timeMs < this.durationMs };
  }
}
