import { MUSIC_BPM } from '../../../shared/src/constants.ts';

export const SAMPLE_RATE = 48_000;
export const CHANNELS = 2;
export const BASE_SEED = 0x534e4147;
export const TRIM_THRESHOLD = 10 ** (-60 / 20);
export const TRIM_PAD_SAMPLES = SAMPLE_RATE * 0.05;

export interface EffectSpec {
  id: string;
  effect: string;
  args: (number | string)[];
  parameters: Record<string, number | string>;
  variant?: number;
}

export interface MusicSpec {
  id: string;
  mood: keyof typeof MUSIC_BPM;
  bpm: number;
}

const singleEffects = [
  'tap', 'sel', 'join', 'slam', 'thump', 'whoosh', 'whoop', 'tick', 'horn',
  'shutter', 'snagged', 'rival', 'taken', 'bonk', 'lock', 'buzzer', 'flip',
  'scan', 'coin', 'aww', 'fanfare', 'sparkle', 'boing', 'stamp', 'rollTick', 'reveal', 'ko',
];

export const EFFECTS: EffectSpec[] = singleEffects.map((effect) => ({
  id: `sfx-${effect}`, effect, args: [], parameters: {},
}));
for (const n of [0, 2, 4, 6, 8]) EFFECTS.push({ id: `sfx-pop-${n}`, effect: 'pop', args: [n], parameters: { n } });
for (const n of [0, 1]) EFFECTS.push({ id: `sfx-beep-${n}`, effect: 'beep', args: [n], parameters: { n } });
for (let n = 0; n <= 12; n++) EFFECTS.push({ id: `sfx-mash-${n}`, effect: 'mash', args: [n], parameters: { n } });
for (const kind of ['star', 'heart']) {
  for (let n = 0; n <= 9; n++) EFFECTS.push({ id: `sfx-react-${kind}-${n}`, effect: 'react', args: [kind, n], parameters: { kind, n } });
}
for (const kind of ['flame', 'tomato']) {
  for (let variant = 1; variant <= 3; variant++) EFFECTS.push({ id: `sfx-react-${kind}-v${variant}`, effect: 'react', args: [kind, 0], parameters: { kind, n: 0 }, variant });
}
for (let step = 0; step <= 8; step++) {
  const p = step / 8;
  EFFECTS.push({ id: `sfx-mtick-${String(step * 125).padStart(4, '0')}`, effect: 'mtick', args: [p], parameters: { p } });
}
for (const sec of [1.4, 2.2, 2.3]) EFFECTS.push({ id: `sfx-drumroll-${sec.toFixed(1).replace('.', 'p')}`, effect: 'drumroll', args: [sec], parameters: { sec } });
EFFECTS.push({ id: 'sfx-riser-1p2', effect: 'riser', args: [1.2], parameters: { sec: 1.2 } });
for (const v of [0.04, 0.06, 0.08, 0.10, 0.12]) EFFECTS.push({ id: `sfx-crowd-mash-${Math.round(v * 100).toString().padStart(2, '0')}`, effect: 'crowd', args: [0.6, v], parameters: { d: 0.6, v } });
EFFECTS.push({ id: 'sfx-crowd-2-18', effect: 'crowd', args: [2, 0.18], parameters: { d: 2, v: 0.18 } });
EFFECTS.push({ id: 'sfx-crowd-default', effect: 'crowd', args: [], parameters: { d: 1.6, v: 0.16 } });
for (let variant = 1; variant <= 3; variant++) EFFECTS.push({ id: `sfx-boom-v${variant}`, effect: 'boom', args: [], parameters: {}, variant });
for (let variant = 1; variant <= 16; variant++) EFFECTS.push({ id: `sfx-voice-v${String(variant).padStart(2, '0')}`, effect: 'voice', args: [], parameters: {}, variant });
EFFECTS.sort((a, b) => a.id.localeCompare(b.id, 'en'));

export const MUSIC: MusicSpec[] = Object.entries(MUSIC_BPM).map(([mood, bpm]) => ({
  id: `music-${mood}`, mood: mood as MusicSpec['mood'], bpm,
}));

/** Each asset has a stable independent seed; adding an asset cannot alter older files. */
export function assetSeed(id: string, baseSeed = BASE_SEED): number {
  let seed = baseSeed >>> 0;
  for (let index = 0; index < id.length; index++) seed = Math.imul(seed ^ id.charCodeAt(index), 16777619) >>> 0;
  return seed;
}

export function loopTiming(bpm: number) {
  const idealSamples = SAMPLE_RATE * 60 / bpm * 16;
  const startSample = Math.round(idealSamples);
  const endSample = Math.round(idealSamples * 2);
  return {
    idealSamples,
    startSample,
    endSample,
    lengthSamples: endSample - startSample,
    barBoundariesSamples: Array.from({ length: 5 }, (_, bar) => Math.round(idealSamples * (1 + bar / 4)) - startSample),
  };
}
