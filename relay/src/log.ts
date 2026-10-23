// Only enumerated events/reasons and numeric metrics can cross this boundary.
// Never pass SDK errors, request URLs, credentials, ids, or player content here.
export const LOG_EVENTS = ['room_open', 'room_close', 'error', 'ai_done', 'image_resize', 'tts_done', 'started', 'stopped'] as const;
export type LogEvent = (typeof LOG_EVENTS)[number];
export const LOG_REASONS = ['none', 'tv_close', 'tv_absent', 'expired', 'shutdown', 'BAD_MSG', 'BAD_PROTO', 'BAD_KEY', 'NO_ROOM', 'ROOM_FULL', 'RATE_LIMIT', 'socket', 'http', 'timeout', 'aborted', 'refusal', 'max_tokens', 'bad_result', 'provider', 'voice_fallback', 'startup'] as const;
export type LogReason = (typeof LOG_REASONS)[number];
export interface LogMetrics {
  rooms?: number; phones?: number; photos?: number; bytes?: number; clips?: number;
  latencyMs?: number; inputBytes?: number; outputBytes?: number; port?: number;
}
export type Logger = (event: LogEvent, reason: LogReason, metrics?: LogMetrics) => void;
const METRICS = ['rooms', 'phones', 'photos', 'bytes', 'clips', 'latencyMs', 'inputBytes', 'outputBytes', 'port'] as const;

export const log: Logger = (event, reason, metrics = {}) => {
  // Runtime whitelist also prevents accidental content logging from untyped callers.
  if (!LOG_EVENTS.includes(event) || !LOG_REASONS.includes(reason)) return;
  const safe: Record<string, string | number> = { at: Date.now(), event, reason };
  for (const k of METRICS) {
    const v = metrics[k];
    if (typeof v === 'number' && Number.isFinite(v)) safe[k] = v;
  }
  process.stdout.write(`${JSON.stringify(safe)}\n`);
};
