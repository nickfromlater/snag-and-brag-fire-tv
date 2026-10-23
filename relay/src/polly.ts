import { PollyClient, SynthesizeSpeechCommand, type VoiceId, type SynthesizeSpeechCommandInput } from '@aws-sdk/client-polly';
import { z } from 'zod';
import type { SpeechMark } from '@snag/shared';
import { LIMITS, type RelayConfig } from './config.js';
import { ServiceFailure, failureReason, mockDelay, withBudget } from './budget.js';
import { log, type Logger } from './log.js';
import { SILENT_PCM } from './silence.js';
import { PCM_SAMPLE_RATE, pcmDurationMs, pcmToWav } from './wav.js';

export const TTS_BUDGET_MS = 5000;
export interface VoiceClip { audio: Buffer; marks: SpeechMark[]; durationMs: number; text?: string;
  nativeAudio?: Buffer; nativeJob?: Promise<Buffer | undefined>; nativeAbort?: AbortController }
export type VoiceProvider = (text: string, signal: AbortSignal) => Promise<VoiceClip>;

export function stripBold(text: string): string { return text.replace(/\*\*/g, '').trim(); }
const xml = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
/** Neural Polly rejects <emphasis>; equivalent rate/volume emphasis is supported.
 * Standard engines retain the literal bold-to-emphasis mapping. Never accept SSML
 * from the TV: team names and AI quips are escaped before generating any markup. */
export function speechSsml(text: string, engine: 'neural' | 'standard' = 'neural'): string {
  const parts = text.trim().split(/\*\*(.*?)\*\*/gs);
  const body = parts.map((part, i) => i % 2
    ? engine === 'standard' ? '<emphasis level="moderate">' + xml(part) + '</emphasis>' : '<prosody rate="85%" volume="+2dB">' + xml(part) + '</prosody>'
    : xml(part.replace(/\*\*/g, ''))).join('');
  return '<speak><prosody rate="90%">' + body + '</prosody></speak>';
}

const markSchema = z.object({
  time: z.number().int().min(0).max(300000), type: z.enum(['viseme', 'word']), value: z.string().min(1).max(1000),
});

export function parseMarks(json: string): SpeechMark[] {
  if (Buffer.byteLength(json) > LIMITS.ttsBytes) throw new ServiceFailure('bad_result');
  const lines = json.trim() ? json.trim().split(/\r?\n/) : [];
  if (lines.length > 10000) throw new ServiceFailure('bad_result');
  try {
    return lines.map((line) => markSchema.parse(JSON.parse(line) as unknown)).sort((a, b) => a.time - b.time);
  } catch { throw new ServiceFailure('bad_result'); }
}

type PollySender = Pick<PollyClient, 'send'>;
function isVoiceUnavailable(error: unknown): boolean {
  // Never include the provider's message in logs; it may include the host line.
  if (!(error instanceof Error)) return false;
  return ['EngineNotSupportedException', 'LanguageNotSupportedException', 'InvalidParameterValueException'].includes(error.name);
}

export function pollyProvider(config: RelayConfig, logger: Logger = log, injected?: PollySender): VoiceProvider {
  const client = injected ?? new PollyClient({ region: config.awsRegion, maxAttempts: 1 });
  return async (text, signal) => {
    const synthesize = async (voice: VoiceId): Promise<VoiceClip> => {
      const input: Omit<SynthesizeSpeechCommandInput, 'OutputFormat'> = { Text: speechSsml(text), TextType: 'ssml', VoiceId: voice, LanguageCode: 'en-GB', Engine: 'neural' };
      // Audio and marks are independent requests: issue both at once so a cold line
      // costs one Polly round trip, not two, before the TV can prepare it.
      const audioJob = (async () => {
        const audioResponse = await client.send(new SynthesizeSpeechCommand({ ...input, OutputFormat: 'pcm', SampleRate: String(PCM_SAMPLE_RATE) }), { abortSignal: signal });
        if (!audioResponse.AudioStream) throw new ServiceFailure('bad_result');
        const pcm = Buffer.from(await audioResponse.AudioStream.transformToByteArray());
        try { return { durationMs: pcmDurationMs(pcm.length), audio: pcmToWav(pcm) }; }
        finally { pcm.fill(0); }
      })();
      const marksJob = (async () => {
        const marksResponse = await client.send(new SynthesizeSpeechCommand({ ...input, OutputFormat: 'json', SpeechMarkTypes: ['viseme', 'word'] }), { abortSignal: signal });
        if (!marksResponse.AudioStream) throw new ServiceFailure('bad_result');
        return parseMarks(await marksResponse.AudioStream.transformToString());
      })();
      const [audio, marks] = await Promise.allSettled([audioJob, marksJob]);
      if (audio.status === 'rejected') throw audio.reason;
      if (marks.status === 'rejected') { audio.value.audio.fill(0); throw marks.reason; }
      return { audio: audio.value.audio, marks: marks.value, durationMs: audio.value.durationMs };
    };
    const first = (config.pollyVoice ?? 'Arthur') as VoiceId;
    try { return await synthesize(first); }
    catch (error) {
      if (signal.aborted || first !== 'Arthur' || !isVoiceUnavailable(error)) throw error;
      logger('error', 'voice_fallback');
      return synthesize('Brian');
    }
  };
}

export function mockVoiceProvider(delayMs: number): VoiceProvider {
  return async (text, signal) => {
    await mockDelay(delayMs, signal);
    const durationMs = pcmDurationMs(SILENT_PCM.length);
    const words = stripBold(text).split(/\s+/);
    const marks: SpeechMark[] = words.flatMap((word, i) => [
      { time: Math.round(i * (durationMs - 100) / words.length), type: 'word' as const, value: word },
      { time: Math.round(i * (durationMs - 100) / words.length), type: 'viseme' as const, value: i % 2 ? 'a' : 'p' },
    ]);
    marks.push({ time: durationMs - 50, type: 'viseme', value: 'sil' });
    return { audio: pcmToWav(SILENT_PCM), marks, durationMs };
  };
}

export class VoiceReader {
  constructor(private readonly provider: VoiceProvider, private readonly logger: Logger = log) {}
  async read(text: string, at: number, signal: AbortSignal): Promise<VoiceClip | null> {
    try {
      const clip = await withBudget(at, TTS_BUDGET_MS, signal, async (budgetSignal) => {
        const result = await this.provider(text.trim(), budgetSignal);
        if (budgetSignal.aborted) { result.audio.fill(0); result.marks.length = 0; throw new ServiceFailure('aborted'); }
        // Every JSON frame, including the complete marks reply, stays within 16 KB.
        if (result.audio.length > LIMITS.ttsBytes || Buffer.byteLength(JSON.stringify(result.marks)) > LIMITS.jsonBytes - 256) {
          result.audio.fill(0); result.marks.length = 0; throw new ServiceFailure('bad_result');
        }
        return result;
      });
      this.logger('tts_done', 'none', { latencyMs: Date.now() - at });
      return clip;
    } catch (error) {
      const reason = failureReason(error);
      this.logger('error', reason, { latencyMs: Date.now() - at });
      this.logger('tts_done', reason, { latencyMs: Date.now() - at });
      return null;
    }
  }
}
