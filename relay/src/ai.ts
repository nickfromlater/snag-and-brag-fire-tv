import { randomInt } from 'node:crypto';
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import sharp from 'sharp';
import { z } from 'zod';
import { GEN_BRAGS, GEN_NAMES, TIMING, isKnownPromptText, type AiRead } from '@snag/shared';
import type { RelayConfig } from './config.js';
import { ServiceFailure, failureReason, mockDelay, withBudget } from './budget.js';
import { log, type Logger } from './log.js';

// libvips must not retain decoded player images after a pipeline finishes.
sharp.cache(false);

export const GENERIC_SNAG_PROMPT = 'Snag something from around the house';
const safeSnagPrompt = (prompt: string) => isKnownPromptText(prompt) ? prompt : GENERIC_SNAG_PROMPT;

/** AI.read in reference/src/game.js, with only the two brief additions. */
export function readPrompt(prompt: string): string {
  prompt = safeSnagPrompt(prompt);
  return 'You are Sir Socksworth, the posh sock-puppet host of a family party game called Snag & Brag. A player photographed something in their home for this round. The round prompt is: "' + prompt + '". Look at the photo. Reply with only JSON in this shape: {"thing":"plain name of the object, 1-4 words","names":["three funny stage names for it, each under 18 characters"],"brags":["two short funny brag lines about it, each under 60 characters"],"score":0,"quip":"one witty host line reacting to it, under 80 characters"}. score is an integer 0-10 for how well it fits the prompt. Keep everything family friendly. Never use brand names or trademarks; describe things generically. If the photo shows a person\'s face, name the object in front of them instead and never comment on the person.';
}

// Mantle does not support output_config.format. The canonical prompt requests
// JSON; validate every result locally before it can enter the wire contract.
const nonEmpty = z.string().min(1).max(4096).refine((v) => v.trim().length > 0);
const rawRead = z.strictObject({
  thing: nonEmpty, names: z.array(nonEmpty).length(3), brags: z.array(nonEmpty).length(2),
  score: z.number(), quip: nonEmpty,
});
const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max).trim();

export function parseAiRead(value: unknown): AiRead {
  const parsed = rawRead.safeParse(value);
  if (!parsed.success) throw new ServiceFailure('bad_result');
  const r = parsed.data;
  const read: AiRead = {
    thing: clean(r.thing, 80).split(/\s+/).slice(0, 4).join(' '),
    names: r.names.map((s) => clean(s, 17)),
    brags: r.brags.map((s) => clean(s, 59)),
    score: Math.max(0, Math.min(10, Math.round(r.score))),
    quip: clean(r.quip, 79), fallback: false,
  };
  if (!read.thing || !read.quip || read.names.some((s) => !s) || read.brags.some((s) => !s)) throw new ServiceFailure('bad_result');
  return read;
}

export const FALLBACK_QUIPS = [
  'A splendid find. The household has clearly been holding auditions.',
  'Quite the treasure. The mantelpiece must be terribly proud.',
  'Modest origins. Excellent stage presence.',
  'A charming little mystery. I shall fetch my monocle.',
  'Bravo. Fame has finally reached the cupboard.',
  'A most distinguished find. Do mind the velvet rope.',
] as const;

function pickDistinct<T>(values: readonly T[], count: number): T[] {
  const pool = [...values];
  for (let i = 0; i < count; i++) {
    const j = i + randomInt(pool.length - i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}

/** Sampling without replacement; room ownership supplies its previous quip. */
export function fallbackRead(previousQuip?: string): AiRead {
  const quips = FALLBACK_QUIPS.filter((quip) => quip !== previousQuip);
  return {
    thing: 'a real thing', names: pickDistinct(GEN_NAMES, 3), brags: pickDistinct(GEN_BRAGS, 2),
    score: 5, quip: quips[randomInt(quips.length)]!, fallback: true,
  };
}

export interface AiInput { jpeg: Buffer; prompt: string }
export type AiProvider = (input: AiInput, signal: AbortSignal) => Promise<unknown>;
type MantleClient = Pick<AnthropicBedrockMantle, 'messages'>;

export function bedrockProvider(config: RelayConfig, logger: Logger = log, injected?: MantleClient): AiProvider {
  const client = injected ?? new AnthropicBedrockMantle({
    awsRegion: config.awsRegion, maxRetries: 0, timeout: TIMING.AI_TIMEOUT_MS,
    // Ensure even SDK debug mode never logs HTTP bodies / photos / credentials.
    logLevel: 'off',
  });
  return async ({ jpeg, prompt }, signal) => {
    const started = performance.now();
    // No file path is ever supplied to sharp. Bound decoded pixels against JPEG bombs.
    // Keep the original room JPEG; only the inference copy is reduced to 512 px.
    let image = jpeg;
    const candidate = await sharp(jpeg, { limitInputPixels: 16 * 1024 * 1024 })
      .rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75 }).toBuffer();
    if (candidate.length < jpeg.length) image = candidate;
    logger('image_resize', 'none', { latencyMs: Math.round(performance.now() - started), inputBytes: jpeg.length, outputBytes: image.length });
    if (signal.aborted) throw new ServiceFailure('aborted');
    const response = await client.messages.create({
      model: config.bedrockModelId, max_tokens: 512,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.toString('base64') } },
        { type: 'text', text: readPrompt(prompt) },
      ] }],
      // Haiku 4.5 has no effort parameter; Opus 5 / Sonnet 5 support low.
      ...(config.bedrockModelId === 'anthropic.claude-haiku-4-5' ? {} : { output_config: { effort: 'low' as const } }),
    }, { signal, maxRetries: 0, ...(config.bedrockWorkspaceId ? { headers: { 'anthropic-workspace-id': config.bedrockWorkspaceId } } : {}) });
    if (response.stop_reason === 'refusal') throw new ServiceFailure('refusal');
    if (response.stop_reason === 'max_tokens') throw new ServiceFailure('max_tokens');
    if (response.stop_reason !== 'end_turn') throw new ServiceFailure('bad_result');
    const blocks = response.content.filter((b) => b.type === 'text');
    if (blocks.length !== 1 || blocks[0]!.text.length > 16384) throw new ServiceFailure('bad_result');
    try { return JSON.parse(blocks[0]!.text) as unknown; }
    catch { throw new ServiceFailure('bad_result'); }
  };
}

export function mockAiProvider(delayMs: number): AiProvider {
  return async (_, signal) => {
    await mockDelay(delayMs, signal);
    return {
      thing: 'household treasure', names: ['Sir Findsalot', 'Captain Clutter', 'Dame Doohickey'],
      brags: ['A household legend takes the stage.', 'Polished by years of being quite splendid.'],
      score: 7, quip: 'A magnificent household treasure. I shall alert the museum.',
    };
  };
}

export class AiReader {
  constructor(private readonly provider: AiProvider, private readonly logger: Logger = log) {}
  async read(input: AiInput, at: number, signal: AbortSignal, fallback: () => AiRead = fallbackRead): Promise<AiRead> {
    try {
      const r = await withBudget(at, TIMING.AI_TIMEOUT_MS, signal, async (budgetSignal) =>
        parseAiRead(await this.provider({ ...input, prompt: safeSnagPrompt(input.prompt) }, budgetSignal)));
      this.logger('ai_done', 'none', { latencyMs: Date.now() - at });
      return r;
    } catch (error) {
      const reason = failureReason(error);
      this.logger('error', reason, { latencyMs: Date.now() - at });
      this.logger('ai_done', reason, { latencyMs: Date.now() - at });
      return fallback();
    }
  }
}
