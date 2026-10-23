import { fileURLToPath } from 'node:url';

export const LIMITS = {
  jsonBytes: 16 * 1024,
  thumbBytes: 16 * 1024,
  snagBytes: 400 * 1024,
  binaryHeaderBytes: 4096,
  photosPerRoom: 40,
  phonesPerRoom: 8,
  rooms: 500,
  messagesPerSecond: 60,
  thumbsPerSecond: 5,
  // A thumbnail may be discarded; reliable messages are retained up to this bound,
  // then the slow socket is disconnected so a TV can resume its room.
  thumbBackpressureBytes: 256 * 1024,
  reliableBackpressureBytes: 4 * 1024 * 1024,
  ttsPerRoom: 40,
  ttsBytes: 1024 * 1024,
  pendingTtsPerRoom: 4,
  ttsTextChars: 1000,
  connections: 5000,
} as const;

export interface RelayConfig {
  host: string;
  port: number;
  publicUrl: string;
  phoneDist: string;
  aiMode: 'mock' | 'bedrock';
  aiMockDelayMs: number;
  bedrockModelId: string;
  bedrockWorkspaceId?: string;
  awsRegion: string;
  // Off until the lead explicitly enables live Polly; startup makes no AWS calls.
  pollyMode: 'mock' | 'aws';
  pollyMockDelayMs: number;
  pollyVoice?: string;
  originSecret?: string;
}

function integer(env: NodeJS.ProcessEnv, key: string, fallback: number, max: number): number {
  if (env[key] === undefined) return fallback;
  const n = Number(env[key]);
  if (!Number.isInteger(n) || n < 0 || n > max) throw new Error('Invalid relay configuration');
  return n;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): RelayConfig {
  const aiMode = env.AI_MODE ?? (env.BEDROCK_MODEL_ID ? 'bedrock' : 'mock');
  const pollyMode = env.POLLY_MODE ?? 'mock';
  if (!['mock', 'bedrock'].includes(aiMode) || !['mock', 'aws'].includes(pollyMode)) throw new Error('Invalid relay mode');
  if (aiMode === 'bedrock' && (!env.BEDROCK_MODEL_ID || !env.AWS_REGION)) throw new Error('Bedrock needs a model and region');
  if (env.BEDROCK_WORKSPACE_ID && (!/^[A-Za-z0-9_-]{1,64}$/.test(env.BEDROCK_WORKSPACE_ID) || env.BEDROCK_WORKSPACE_ID.trim() !== env.BEDROCK_WORKSPACE_ID)) throw new Error('Invalid Bedrock workspace');
  if (pollyMode === 'aws' && !env.AWS_REGION) throw new Error('Polly needs a region');
  if (env.ORIGIN_SECRET && (env.ORIGIN_SECRET.length !== 64 || !/^[a-f0-9]{64}$/.test(env.ORIGIN_SECRET))) throw new Error('Invalid origin secret');
  const publicUrl = new URL(env.PUBLIC_URL ?? 'http://localhost:8787');
  if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash || publicUrl.pathname !== '/') throw new Error('PUBLIC_URL must be an origin');
  return {
    host: env.HOST ?? '0.0.0.0',
    port: integer(env, 'PORT', 8787, 65535),
    publicUrl: publicUrl.origin,
    phoneDist: env.PHONE_DIST ?? fileURLToPath(new URL('../../phone/dist', import.meta.url)),
    aiMode: aiMode as RelayConfig['aiMode'],
    aiMockDelayMs: integer(env, 'AI_MOCK_DELAY_MS', 150, 60000),
    bedrockModelId: env.BEDROCK_MODEL_ID ?? '',
    bedrockWorkspaceId: env.BEDROCK_WORKSPACE_ID,
    awsRegion: env.AWS_REGION ?? 'us-east-1',
    pollyMode: pollyMode as RelayConfig['pollyMode'],
    pollyMockDelayMs: integer(env, 'POLLY_MOCK_DELAY_MS', 80, 60000),
    pollyVoice: env.POLLY_VOICE,
    originSecret: env.ORIGIN_SECRET,
  };
}
