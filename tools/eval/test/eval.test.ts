import { describe, expect, it, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { judgePhoto, judgeMask, isJudgeMask, COLORS, promptText } from '@snag/shared';
import { bedrockProvider, mockAiProvider } from '../../../relay/src/ai.js';
import { ServiceFailure } from '../../../relay/src/budget.js';
import { configFromEnv } from '../../../relay/src/config.js';
import { PhotoCanvas } from '../src/browser.js';
import { readManifest, fixturePath, coverageErrors, type Photo } from '../src/manifest.js';
import { validateFixtures } from '../src/validate.js';
import { RULES, sampleDistances, experimentScore } from '../src/scoring.js';
import { spread, percentile } from '../src/statistics.js';
import { roundOutcomes } from '../src/rounds.js';
import { brandHits, contractViolations, selectPhotos, photoPrompt, aiSummary, tableCell } from '../src/ai-metrics.js';
import { measureAi, parseArgs, costEstimate, PLANNING_RATES } from '../src/bedrock.js';
import { rootDir } from '../src/paths.js';
import type { PixelResult } from '../src/evaluate-pixels.js';

afterEach(() => { vi.useRealTimers(); });

describe('benchmark math', () => {
  it('does not confuse median score with nearest-rank latency percentile', () => {
    expect(spread([2, 4, 8, 12])).toEqual({ n: 4, min: 2, median: 6, max: 12, mean: 6.5 });
    expect(percentile([2, 4, 8, 12], 0.5)).toBe(4);
    expect(percentile([2, 4, 8, 12], 0.95)).toBe(12);
    expect(() => percentile([], 0.5)).toThrow();
  });
  it('checks both the color crown and every speed-bonus permutation', () => {
    expect(roundOutcomes([99], [60, 59], [20])).toMatchObject({ rounds: 1, colorWins: 1, speedTrials: 24, speedWins: 24, guaranteedWins: 1 });
    expect(roundOutcomes([99], [99, 60], [20])).toMatchObject({ colorTies: 1, colorWins: 0, speedWins: 12, speedLosses: 12 });
    const equal = roundOutcomes([50], [50, 50], [50]);
    expect(equal.colorTies).toBe(1);
    expect(equal.speedWins).toBe(6);
    expect(equal.speedLosses).toBe(18);
  });
  it('keeps the experiment baseline equivalent on a noisy synthetic image', () => {
    const size = 80, rgba = new Uint8ClampedArray(size * size * 4);
    let seed = 1837;
    for (let i = 0; i < rgba.length; i++) { seed = (1664525 * seed + 1013904223) >>> 0; rgba[i] = i % 4 === 3 ? 255 : seed >>> 24; }
    for (const target of COLORS) {
      const distances = sampleDistances(rgba, size, target.hex);
      expect(experimentScore(distances, RULES[0]!)).toBe(judgePhoto(rgba, size, target.hex).match);
      expect(judgeMask(rgba, size, target.hex)).toBe(judgePhoto(rgba, size, target.hex).mask);
    }
  });
});

describe('frozen licensed fixture set', () => {
  it('covers every required color/trait/condition, receipts and disk budget', async () => {
    const result = await validateFixtures();
    expect(result.objects).toBeGreaterThanOrEqual(60);
    expect(result.faces).toBeGreaterThanOrEqual(10);
    expect(result.folderBytes).toBeLessThan(15_000_000);
    const manifest = await readManifest();
    expect(coverageErrors(manifest)).toEqual([]);
    expect(coverageErrors({ ...manifest, photos: manifest.photos.filter(p => p.colors.RED !== 'true') })).toContain('RED: need at least 3 true photos');
    expect(() => fixturePath({ file: '../../../player.jpg' })).toThrow();
    expect(() => fixturePath({ file: '/tmp/private.jpg' })).toThrow();
  });
  it('uses the same 30 unique objects and canonical prompts for all models', async () => {
    const manifest = await readManifest(), objects = manifest.photos.filter(p => p.kind === 'object');
    const photos = selectPhotos(objects, 30);
    expect(new Set(photos.map(p => p.id)).size).toBe(30);
    for (const color of COLORS) expect(photos.some(p => p.colors[color.k] === 'true')).toBe(true);
    expect(photos.every(p => p.kind === 'object')).toBe(true);
    expect(selectPhotos(objects, 30)).toEqual(photos);
    expect(photoPrompt(photos[0]!, 0)).toBe(promptText({ kind: 'color', ...COLORS[0]! }));
  });
  it('keeps every source/post-redaction result and changed-score receipt consistent', async () => {
    const manifest = await readManifest(), ids = manifest.photos.filter(p => p.kind === 'object').map(p => p.id);
    const before = JSON.parse(await readFile(resolve(rootDir, 'docs/review/eval/pixel-judge.json'), 'utf8')) as { results: PixelResult[] };
    const after = JSON.parse(await readFile(resolve(rootDir, 'docs/review/eval/pixel-redaction-impact.json'), 'utf8')) as { results: PixelResult[]; changed: { photoId: string; color: string; before: number; after: number }[] };
    expect(before.results.map(p => p.id)).toEqual(ids);
    expect(after.results.map(p => p.id)).toEqual(ids);
    const changes: typeof after.changed = [];
    for (let i = 0; i < ids.length; i++) for (const target of COLORS) {
      const a = before.results[i]!.targets[target.k]!, b = after.results[i]!.targets[target.k]!;
      expect(a.match).toBe(a.scores.shipped); expect(b.match).toBe(b.scores.shipped);
      expect(isJudgeMask(a.mask) && isJudgeMask(b.mask)).toBe(true);
      if (a.match !== b.match) changes.push({ photoId: ids[i]!, color: target.k, before: a.match, after: b.match });
    }
    expect(after.changed).toEqual(changes);
    // Receipts contain results/geometry, never the in-memory RGBA/preview data.
    const serialized = JSON.stringify(after);
    expect(serialized).not.toContain('judgeRgba');
    expect(serialized).not.toContain('data:image');
    expect(serialized.length).toBeLessThan(1_000_000);
  });
  it('ties the full settings sweep to the actual phone source and final face pipeline receipt', async () => {
    const json = async (name: string) => JSON.parse(await readFile(resolve(rootDir, 'docs/review/eval', name), 'utf8'));
    const sweep = await json('face-redaction-sweep.json'), confirmation = await json('face-blur.json');
    const baseline = await json('face-blur-baseline.json'), manifest = await readManifest();
    const faceIds = manifest.photos.filter(p => p.kind === 'face').map(p => p.id);
    const objectIds = manifest.photos.filter(p => p.kind === 'object').map(p => p.id);
    const sourceHash = createHash('sha256').update(await readFile(resolve(rootDir, 'phone/src/faceBlur.ts'))).digest('hex');
    expect(sweep.sourceSha256).toBe(sourceHash); expect(confirmation.sourceSha256).toBe(sourceHash);
    expect(sweep.rows).toHaveLength(2000);
    expect(new Set(sweep.rows.map((row: { settings: object }) => JSON.stringify(row.settings))).size).toBe(2000);
    for (const row of sweep.rows) {
      expect(row.faces).toBe(faceIds.length - row.misses.length);
      expect(row.objectFalsePositives).toBe(row.falsePositives.length);
      expect(row.misses.every((id: string) => faceIds.includes(id))).toBe(true);
      expect(row.falsePositives.every((id: string) => objectIds.includes(id))).toBe(true);
    }
    expect(confirmation.detectedImages).toBe(sweep.recommendation.faces);
    expect(confirmation.falsePositiveImages).toEqual(sweep.recommendation.falsePositives);
    expect(confirmation.warm.settings).toEqual(sweep.recommendation.settings);
    expect(confirmation.warm.padding).toEqual(sweep.recommendation.padding);
    expect(confirmation.detectedImages).toBe(12); expect(confirmation.falsePositiveImages).toEqual([]);
    expect(confirmation.records.filter((r: { kind: string }) => r.kind === 'face').every((r: { faceCoverage: number[] }) => r.faceCoverage.every(value => value === 1))).toBe(true);
    expect(baseline.detectedImages).toBe(12); expect(baseline.falsePositiveImages).toHaveLength(11);
    expect(sweep.foreignRequests + confirmation.foreignRequests).toBe(0);
    expect(sweep.browserErrors.concat(confirmation.browserErrors)).toEqual([]);
    expect(JSON.stringify(sweep)).not.toMatch(/data:image|judgeRgba/);
  });
});

describe('AI harness without AWS', () => {
  it('parses the requested command and makes cost assumptions explicit', () => {
    expect(parseArgs(['--', '--models', 'anthropic.claude-opus-5,anthropic.claude-sonnet-5', '--n', '30'])).toMatchObject({ n: 30, models: ['anthropic.claude-opus-5', 'anthropic.claude-sonnet-5'] });
    expect(() => parseArgs(['--n', 'NaN'])).toThrow();
    expect(() => parseArgs(['--unexpected', 'x'])).toThrow();
    expect(costEstimate(30, PLANNING_RATES['anthropic.claude-opus-5']!)).toBeCloseTo(1.962);
  });
  it('distinguishes raw contract repairs from failures and checks whole brand words', () => {
    expect(brandHits({ quip: 'A LEGO marvel of engineering with an Apple sticker.' })).toEqual(['Apple', 'Lego', 'Marvel']);
    expect(brandHits({ thing: 'pineapple', quip: 'legolas' })).toEqual([]);
    expect(brandHits({ quip: 'KitchenAid and Play-Doh' })).toEqual(['KitchenAid', 'Play-Doh']);
    expect(contractViolations({ thing: 'a very long household name', names: ['A', 'B', 'C'], brags: ['one', 'two'], score: 20.5, quip: 'q' })).toEqual(['thing word count', 'score']);
    expect(tableCell('a|b\n<script>')).toBe('a&#124;b &lt;script&gt;');
  });
  it('runs the actual reader in mock mode and captures sanitized outputs', async () => {
    const jpeg = await sharp({ create: { width: 720, height: 720, channels: 3, background: '#F23B2E' } }).jpeg().toBuffer();
    const record = await measureAi(mockAiProvider(0), { bedrockModelId: 'test' }, 'synthetic', jpeg, promptText({ kind: 'color', ...COLORS[0]! }));
    expect(record.output.fallback).toBe(false);
    expect(record.reason).toBe('none');
    expect(record.rawContractViolations).toEqual([]);
    expect(aiSummary([record])).toMatchObject({ n: 1, fallbacks: 0, schemaFailures: 0, brandOutputs: 0, successes: 1 });
  });
  it('classifies refusal, malformed JSON schema and provider failures separately', async () => {
    const jpeg = Buffer.from([255, 216, 255]);
    for (const reason of ['refusal', 'bad_result', 'provider'] as const) {
      const provider = async () => { throw new ServiceFailure(reason); };
      const r = await measureAi(provider, { bedrockModelId: 'test' }, 'synthetic', jpeg, promptText({ kind: 'color', ...COLORS[0]! }));
      expect(r.reason).toBe(reason);
      expect(r.output.fallback).toBe(true);
      expect(r.refusal).toBe(reason === 'refusal');
      expect(r.schemaFailure).toBe(reason === 'bad_result');
    }
    const invalid = await measureAi(async () => ({ unexpected: true }), { bedrockModelId: 'test' }, 'synthetic', jpeg, 'invalid prompt');
    expect(invalid.schemaFailure).toBe(true);
    expect(invalid.rawContractViolations).toContain('extra properties');
  });
  it('records the real four-second timeout even if the provider ignores abort', async () => {
    vi.useFakeTimers();
    const pending = measureAi(async () => new Promise(() => {}), { bedrockModelId: 'test' }, 'synthetic', Buffer.from([255]), 'invalid prompt');
    await vi.advanceTimersByTimeAsync(4001);
    const r = await pending;
    expect(r.timeout).toBe(true);
    expect(r.reason).toBe('timeout');
    expect(r.output.fallback).toBe(true);
  });
  it('exercises the exact Mantle request and 512 px resize with an injected transport', async () => {
    const fixture = { thing: 'red mug', names: ['A', 'B', 'C'], brags: ['A brave mug.', 'Still a mug.'], score: 7, quip: 'Splendid.' };
    const create = vi.fn(async () => ({ content: [{ type: 'text', text: JSON.stringify(fixture) }], stop_reason: 'end_turn' }));
    const config = configFromEnv({ AI_MODE: 'mock', BEDROCK_MODEL_ID: 'anthropic.claude-sonnet-5' });
    const provider = bedrockProvider(config, () => {}, { messages: { create } } as unknown as NonNullable<Parameters<typeof bedrockProvider>[2]>);
    const jpeg = await sharp({ create: { width: 720, height: 720, channels: 3, background: '#F23B2E' } }).jpeg({ quality: 90 }).toBuffer();
    const prompt = promptText({ kind: 'color', ...COLORS[0]! });
    const r = await measureAi(provider, config, 'synthetic', jpeg, prompt);
    expect(r.output.thing).toBe('red mug');
    expect(create).toHaveBeenCalledOnce();
    const request = (create.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(request.model).toBe(config.bedrockModelId);
    expect(request.max_tokens).toBe(512);
    expect(request.output_config).toEqual({ effort: 'low' });
    const messages = request.messages as { content: { type: string; text?: string; source?: { data: string } }[] }[];
    const content = messages[0]!.content;
    expect(content[1]!.text).toContain(prompt);
    expect(content[1]!.text).toContain('Never use brand names');
    const metadata = await sharp(Buffer.from(content[0]!.source!.data, 'base64')).metadata();
    expect(metadata.width).toBe(512); expect(metadata.height).toBe(512);
  });
});

describe('Chrome canvas integration', () => {
  it('decodes a fixture, matches shared judging and strips source metadata on capture', async () => {
    const manifest = await readManifest(), photo = manifest.photos.find(p => p.kind === 'object') as Photo;
    const canvas = await PhotoCanvas.open();
    try {
      const bytes = await readFile(fixturePath(photo)), rgba = await canvas.rgba(bytes);
      expect(rgba.length).toBe(480 * 480 * 4);
      const judge = judgePhoto(rgba, 480, COLORS[0]!.hex);
      const distances = sampleDistances(rgba, 480, COLORS[0]!.hex);
      expect(experimentScore(distances, RULES[0]!)).toBe(judge.match);
      const source = await sharp({ create: { width: 1000, height: 800, channels: 3, background: '#F23B2E' } }).jpeg().withMetadata().toBuffer();
      const captured = await canvas.capture(source), metadata = await sharp(captured.jpeg).metadata();
      expect([metadata.width, metadata.height]).toEqual([720, 720]);
      expect(metadata.exif).toBeUndefined();
      const fixtureMetadata = await sharp(bytes).metadata();
      expect(metadata.icc).toEqual(fixtureMetadata.icc);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(photo.sha256);
    } finally { await canvas.close(); }
  }, 20000);
});
