import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { TIMING } from '@snag/shared';
import { AiReader, bedrockProvider, mockAiProvider, type AiProvider } from '../../../relay/src/ai.js';
import { configFromEnv, type RelayConfig } from '../../../relay/src/config.js';
import type { Logger } from '../../../relay/src/log.js';
import { readManifest, fixturePath } from './manifest.js';
import { validateFixtures } from './validate.js';
import { reviewDir } from './paths.js';
import { selectPhotos, photoPrompt, brandHits, contractViolations, aiSummary, tableCell, type AiRecord } from './ai-metrics.js';

export const DEFAULT_MODELS = ['anthropic.claude-opus-5', 'anthropic.claude-sonnet-5', 'anthropic.claude-haiku-4-5'];
interface Rate { input: number; output: number; basis: string }
// USD per million tokens. Opus/Sonnet 5 availability/prices are unverified;
// these are deliberately labeled planning assumptions, never price quotations.
export const PLANNING_RATES: Record<string, Rate> = {
  'anthropic.claude-opus-5': { input: 15, output: 75, basis: 'unverified model; conservative planning assumption, verify before live run' },
  'anthropic.claude-sonnet-5': { input: 3, output: 15, basis: 'unverified model; planning assumption, verify before live run' },
  'anthropic.claude-haiku-4-5': { input: 1, output: 5, basis: 'Haiku 4.5 base global list rate; verify Mantle region/tier: https://www.anthropic.com/claude/haiku' },
};
export const ESTIMATED_INPUT_TOKENS = 1800;

export function costEstimate(n: number, rates: Rate): number {
  return n * (ESTIMATED_INPUT_TOKENS * rates.input + 512 * rates.output) / 1_000_000;
}

export function parseArgs(args: string[]): { models: string[]; n: number; out?: string; ratesFile?: string } {
  const result: { models: string[]; n: number; out?: string; ratesFile?: string } = { models: DEFAULT_MODELS, n: 30 };
  const argv = args.filter(a => a !== '--');
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i], value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error('Each option needs a value');
    if (key === '--models') result.models = value.split(',');
    else if (key === '--n') result.n = Number(value);
    else if (key === '--out') result.out = value;
    else if (key === '--rates-file') result.ratesFile = value;
    else throw new Error('Unknown benchmark option');
  }
  if (!result.models.length || new Set(result.models).size !== result.models.length || result.models.some(m => !/^[a-zA-Z0-9._:-]{1,160}$/.test(m))) throw new Error('Invalid model list');
  if (!Number.isInteger(result.n) || result.n < 1) throw new Error('n must be a positive integer');
  return result;
}

/** Reuse the relay reader, provider, prompt, schema, resize and 4 s budget verbatim. */
export async function measureAi(provider: AiProvider, config: Pick<RelayConfig, 'bedrockModelId'>, photoId: string, jpeg: Buffer, prompt: string): Promise<AiRecord> {
  let reason = 'none', rawOutput: unknown;
  const logger: Logger = (event, why) => { if (event === 'ai_done') reason = why; };
  const observed: AiProvider = async (input, signal) => {
    const raw = await provider(input, signal);
    // A response arriving after the relay timeout is discarded as on the relay.
    if (!signal.aborted) rawOutput = raw;
    return raw;
  };
  const reader = new AiReader(observed, logger), start = performance.now();
  const output = await reader.read({ jpeg, prompt }, Date.now(), new AbortController().signal);
  const latencyMs = Math.round((performance.now() - start) * 100) / 100;
  return {
    model: config.bedrockModelId, photoId, prompt, latencyMs, reason,
    timeout: reason === 'timeout', over4s: latencyMs > TIMING.AI_TIMEOUT_MS,
    refusal: reason === 'refusal', schemaFailure: reason === 'bad_result',
    rawContractViolations: rawOutput === undefined ? [] : contractViolations(rawOutput),
    brands: brandHits(output), rawBrands: rawOutput === undefined ? [] : brandHits(rawOutput),
    output, ...(rawOutput === undefined ? {} : { rawOutput }),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2)), mode = process.env.AI_MODE ?? 'mock';
  if (mode !== 'mock' && mode !== 'bedrock') throw new Error('AI_MODE must be mock or bedrock');
  await validateFixtures();
  const manifest = await readManifest(), photos = selectPhotos(manifest.photos.filter(p => p.kind === 'object'), args.n);
  const outDir = args.out ? resolve(args.out) : reviewDir;
  const rates: Record<string, Rate> = args.ratesFile ? JSON.parse(await readFile(resolve(args.ratesFile), 'utf8')) as Record<string, Rate> : PLANNING_RATES;
  const estimates = args.models.map(model => {
    const rate = rates[model] ?? { input: 15, output: 75, basis: 'unknown model; conservative planning assumption, supply --rates-file' };
    if (![rate.input, rate.output].every(v => Number.isFinite(v) && v >= 0) || !rate.basis) throw new Error('Invalid price assumptions');
    return { model, ...rate, calls: args.n, estimatedUsd: costEstimate(args.n, rate) };
  });
  const estimatedUsd = estimates.reduce((sum, e) => sum + e.estimatedUsd, 0);
  process.stdout.write(`Mode ${mode}; ${args.models.length * args.n} calls (${args.n} per model), sequential, retries disabled.\n`);
  process.stdout.write(`Planning estimate: $${estimatedUsd.toFixed(3)} at ~${ESTIMATED_INPUT_TOKENS} input + up to 512 output tokens/call. Mock costs $0. This is not a billing ceiling.\n`);
  for (const e of estimates) process.stdout.write(`${e.model}: ~$${e.estimatedUsd.toFixed(3)} ($${e.input}/$${e.output} per million input/output); ${e.basis}.\n`);
  // No live provider is constructed before the estimate is printed. Default mock
  // also ignores any ambient BEDROCK_MODEL_ID that could otherwise enable AWS.
  const records: AiRecord[] = [];
  for (const model of args.models) {
    const config = configFromEnv({ ...process.env, AI_MODE: mode, BEDROCK_MODEL_ID: model });
    const provider = mode === 'mock' ? mockAiProvider(config.aiMockDelayMs) : bedrockProvider(config, () => {});
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i]!, jpeg = await readFile(fixturePath(photo));
      try { records.push(await measureAi(provider, config, photo.id, jpeg, photoPrompt(photo, i))); }
      finally { jpeg.fill(0); }
    }
    const summary = aiSummary(records.filter(r => r.model === model));
    process.stdout.write(`${model}: ${summary.n} results, p50 ${summary.latencyMs.p50} ms, p95 ${summary.latencyMs.p95} ms, ${summary.fallbacks} fallback(s).\n`);
  }
  await mkdir(outDir, { recursive: true });
  const summaries = args.models.map(model => ({ model, ...aiSummary(records.filter(r => r.model === model)) }));
  const report = { generated: new Date().toISOString(), mode, cost: { estimatedUsd, actualUsd: mode === 'mock' ? 0 : null, estimatedInputTokens: ESTIMATED_INPUT_TOKENS, maxOutputTokens: 512, estimates }, summaries, records };
  const stem = mode === 'mock' ? 'bedrock-mock' : 'bedrock-live';
  await writeFile(resolve(outDir, `${stem}.json`), JSON.stringify(report, null, 2) + '\n');
  const md = [
    `# Bedrock benchmark — ${mode}`, '',
    `Generated ${report.generated}. Same ${photos.length} fixture photos and prompts for every model. Sequential requests, no retries, relay arrival-to-fallback deadline ${TIMING.AI_TIMEOUT_MS} ms.`, '',
    mode === 'mock' ? '**Mock plumbing evidence only. No AWS calls or billing. Each model label ran the same relay mock provider; timings and taste outputs do not compare actual models.**' : '**Live run: public licensed fixtures only; never point this harness at player-photo storage.**', '',
    `Planning token cost printed before any provider construction: ~$${estimatedUsd.toFixed(3)} (${ESTIMATED_INPUT_TOKENS} estimated input + at most 512 output tokens/call). Actual cost ${mode === 'mock' ? '$0' : 'is not measured by the relay API; check AWS billing'}. Rates are planning assumptions, not guaranteed current prices; Opus/Sonnet 5 IDs and prices are unverified.`, '',
    'Calls use `relay/src/ai.ts` directly: `AiReader`, `bedrockProvider` in live mode, the canonical JSON `readPrompt`, supported per-model options, image preparation (512 px inside, JPEG q75, used only if smaller) and `parseAiRead`. Mock mode uses the relay’s `mockAiProvider`, which does not exercise the HTTP image path; the injected-Mantle test covers its request and resize without AWS.', '',
    'Latency includes image preparation, response parsing and fallback, excludes fixture disk reads, and uses monotonic time. p50/p95 use nearest-rank percentiles. Timeouts count the relay timeout reason; >4 s counts measured end-to-end overruns, including timer scheduling. Schema failures mean the provider/parser rejected JSON as `bad_result`; raw contract violations also expose responses that the relay repaired by clamping/truncating. Refusals and provider failures are separate. Brand checks cover raw and delivered output using the checked-in list; false positives (e.g. “apple” the fruit, “Stanley” a stage name) need human review, and unlisted brands will be missed.', '',
    '| Model | n | Latency p50/p95/max ms | Success-only p50/p95/max ms | Timeouts / >4 s | Refusals | Schema failures | Raw contract violations | Brand outputs | Fallbacks |',
    '|---|---:|---|---|---|---:|---:|---:|---:|---:|',
  ];
  for (const s of summaries) {
    const t = s.latencyMs, success = s.successfulLatencyMs;
    md.push(`| ${s.model} | ${s.n} | ${t.p50}/${t.p95}/${t.max} | ${success ? `${success.p50}/${success.p95}/${success.max}` : 'none'} | ${s.timeouts}/${s.over4s} | ${s.refusals} | ${s.schemaFailures} | ${s.rawContractViolations} | ${s.brandOutputs} | ${s.fallbacks} |`);
  }
  md.push('', '## Human taste read', '', '| Model / fixture | Photo | Round prompt | Thing | Names | Brags | Score | Quip | Status / brands |', '|---|---|---|---|---|---|---:|---|---|');
  for (const r of records) {
    const photo = photos.find(p => p.id === r.photoId)!, image = relative(outDir, fixturePath(photo));
    const o = r.output, status = `${r.reason}${o.fallback ? '; fallback' : ''}${r.rawContractViolations.length ? '; repaired ' + r.rawContractViolations.join(', ') : ''}${r.brands.length || r.rawBrands.length ? '; brands ' + [...new Set([...r.brands, ...r.rawBrands])].join(', ') : ''}`;
    md.push(`| ${tableCell(r.model)} / ${r.photoId} | <img src="${image}" alt="${tableCell(photo.subject)}" width="80"> | ${tableCell(r.prompt)} | ${tableCell(o.thing)} | ${tableCell(o.names.join(' / '))} | ${tableCell(o.brags.join(' / '))} | ${o.score} | ${tableCell(o.quip)} | ${tableCell(status)} |`);
  }
  md.push('', `[Raw public-fixture results, costs and per-model summaries](${stem}.json).`, '');
  await writeFile(resolve(outDir, `${stem}.md`), md.join('\n'));
}

if (process.argv[1]?.endsWith('bedrock.ts')) {
  main().catch(() => { process.stderr.write('Benchmark could not start: check options, fixture validation, AI_MODE and AWS region for live mode. No SDK errors or credentials are printed.\n'); process.exitCode = 1; });
}
