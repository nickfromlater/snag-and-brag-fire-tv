import { COLORS, BRAGP, SHOWP, promptText, type AiRead } from '@snag/shared';
import type { Photo } from './manifest.js';
import { percentile } from './statistics.js';

/** A simple auditable list check, not a trademark detector. Match whole words. */
export const BRANDS = [
  'Amazon', 'Alexa', 'Apple', 'iPhone', 'iPad', 'Samsung', 'Google', 'Microsoft', 'Xbox', 'PlayStation',
  'Nintendo', 'Sony', 'LG', 'Panasonic', 'Canon', 'Nikon', 'Fujifilm', 'Kodak', 'Leica', 'GoPro',
  'Lego', 'Barbie', 'Disney', 'Pixar', 'Marvel', 'Star Wars', 'Star Trek', 'Pokémon', 'Pokemon',
  'Coca-Cola', 'Coca Cola', 'Coke', 'Pepsi', 'Sprite', 'Fanta', 'Starbucks', 'Nespresso', 'Keurig',
  'Nike', 'Adidas', 'Puma', 'Gucci', 'Chanel', 'Rolex', 'Seiko', 'Timex', 'Casio', 'Ikea', 'Dyson',
  'KitchenAid', 'Owala', 'CamelBak', 'Stanley', 'Yeti', 'Pyrex', 'Tupperware', 'Crayola', 'Play-Doh',
  'Tonka', 'Schuco', 'Mercedes', 'BMW', 'Ferrari', 'Jeep', 'Matchbox', 'Hot Wheels', 'Funko',
] as const;
const escapePattern = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function brandHits(value: unknown): string[] {
  const text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
  return BRANDS.filter(brand => new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapePattern(brand)}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(text));
}

/** Raw contract deviations remain visible even when the relay cleans/truncates them. */
export function contractViolations(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['not an object'];
  const r = value as Record<string, unknown>, errors: string[] = [];
  const text = (key: string, max: number) => {
    if (typeof r[key] !== 'string' || !r[key].trim() || r[key].length > max) errors.push(key);
  };
  text('thing', 80); text('quip', 79);
  if (typeof r.thing === 'string' && r.thing.trim().split(/\s+/).length > 4) errors.push('thing word count');
  for (const [key, count, max] of [['names', 3, 17], ['brags', 2, 59]] as const) {
    const values = r[key];
    if (!Array.isArray(values) || values.length !== count || values.some(v => typeof v !== 'string' || !v.trim() || v.length > max)) errors.push(key);
  }
  if (typeof r.score !== 'number' || !Number.isInteger(r.score) || r.score < 0 || r.score > 10) errors.push('score');
  if (Object.keys(r).some(k => !['thing', 'names', 'brags', 'score', 'quip'].includes(k))) errors.push('extra properties');
  return errors;
}

export function selectPhotos(photos: Photo[], n: number): Photo[] {
  if (!Number.isInteger(n) || n < 1 || n > photos.length) throw new Error('n must be between 1 and the object-fixture count');
  const strata = [
    ...COLORS.map(c => photos.filter(p => p.colors[c.k] === 'true')),
    ...[...BRAGP, ...SHOWP].map(t => photos.filter(p => p.traits.includes(t.t))),
    photos.filter(p => p.conditions.includes('messy')),
    photos.filter(p => Object.values(p.colors).includes('near')),
    photos.filter(p => Object.values(p.colors).includes('hard')),
    photos,
  ];
  const selected: Photo[] = [], used = new Set<string>();
  while (selected.length < n) for (const stratum of strata) {
    const p = stratum.find(p => !used.has(p.id));
    if (p) { selected.push(p); used.add(p.id); }
    if (selected.length === n) return selected;
  }
  return selected;
}

export function photoPrompt(photo: Photo, index: number): string {
  if (photo.traits.length) {
    const trait = photo.traits[index % photo.traits.length];
    const brag = BRAGP.find(p => p.t === trait);
    if (brag) return promptText({ kind: 'brag', ...brag });
    const show = SHOWP.find(p => p.t === trait);
    if (show) return promptText({ kind: 'show', ...show });
  }
  const color = COLORS.find(c => photo.colors[c.k] === 'true') ?? COLORS.find(c => photo.colors[c.k] === 'hard')
    ?? COLORS.find(c => photo.colors[c.k] === 'near') ?? COLORS[index % COLORS.length]!;
  return promptText({ kind: 'color', ...color });
}

export interface AiRecord {
  model: string; photoId: string; prompt: string; latencyMs: number; reason: string;
  timeout: boolean; over4s: boolean; refusal: boolean; schemaFailure: boolean;
  rawContractViolations: string[]; brands: string[]; rawBrands: string[];
  output: AiRead; rawOutput?: unknown;
}

export function aiSummary(records: AiRecord[]) {
  if (!records.length) throw new Error('No AI records');
  const times = records.map(r => r.latencyMs), successes = records.filter(r => !r.output.fallback);
  const timing = (values: number[]) => values.length ? { p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: Math.max(...values) } : null;
  return {
    n: records.length, latencyMs: timing(times)!, successfulLatencyMs: timing(successes.map(r => r.latencyMs)),
    successes: successes.length, fallbacks: records.filter(r => r.output.fallback).length,
    timeouts: records.filter(r => r.timeout).length, over4s: records.filter(r => r.over4s).length,
    refusals: records.filter(r => r.refusal).length, schemaFailures: records.filter(r => r.schemaFailure).length,
    rawContractViolations: records.filter(r => r.rawContractViolations.length).length,
    brandOutputs: records.filter(r => r.brands.length || r.rawBrands.length).length,
    failureReasons: Object.fromEntries([...new Set(records.map(r => r.reason))].map(reason => [reason, records.filter(r => r.reason === reason).length])),
  };
}

export const tableCell = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/[\r\n]+/g, ' ');
