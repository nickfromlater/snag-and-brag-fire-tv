import type { Rng } from './types';

/** Mulberry32: a small reproducible RNG, never Math.random inside the host. */
export function seededRng(seed: number): Rng {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function random(rng: Rng, a: number, b: number): number { return a + rng() * (b - a); }
export function pick<T>(rng: Rng, values: readonly T[]): T {
  if (!values.length) throw new Error('Cannot pick from an empty pool');
  return values[Math.floor(rng() * values.length)]!;
}
export function shuffle<T>(rng: Rng, values: readonly T[]): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
