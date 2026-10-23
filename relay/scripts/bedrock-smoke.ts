// MANUAL ONLY: makes one real, billable Bedrock call. The relay worker must not run it.
import sharp from 'sharp';
import { AiReader, bedrockProvider } from '../src/ai.js';
import { configFromEnv } from '../src/config.js';

const config = configFromEnv({ ...process.env, AI_MODE: 'bedrock' });
const jpeg = await sharp({ create: { width: 720, height: 720, channels: 3, background: '#F23B2E' } }).jpeg().toBuffer();
const at = Date.now();
const r = await new AiReader(bedrockProvider(config)).read({ jpeg, prompt: 'Snag the most RED thing in the house' }, at, new AbortController().signal);
// The only result printed is from this synthetic in-memory image, never a player photo.
process.stdout.write(`${JSON.stringify({ task: 'bedrock-smoke', latencyMs: Date.now() - at, r })}\n`);
jpeg.fill(0);
if (r.fallback) process.exitCode = 1;
