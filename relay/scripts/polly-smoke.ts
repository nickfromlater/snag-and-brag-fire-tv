// MANUAL ONLY: makes two real, billable Polly requests (plus a voice fallback if needed).
// Neither audio nor marks are written to disk; this script never plays audio.
import { VoiceReader, mockVoiceProvider, pollyProvider } from '../src/polly.js';
import { configFromEnv } from '../src/config.js';

const config = configFromEnv({ ...process.env, POLLY_MODE: process.env.POLLY_MODE ?? 'aws' });
const at = Date.now();
const clip = await new VoiceReader(config.pollyMode === 'mock' ? mockVoiceProvider(config.pollyMockDelayMs) : pollyProvider(config)).read('A **splendid** red square. I shall alert the museum.', at, new AbortController().signal);
process.stdout.write(`${JSON.stringify({ task: 'polly-smoke', mode: config.pollyMode, latencyMs: Date.now() - at, ok: !!clip, durationMs: clip?.durationMs, marks: clip?.marks, bytes: clip?.audio.length })}\n`);
clip?.audio.fill(0);
if (!clip) process.exitCode = 1;
