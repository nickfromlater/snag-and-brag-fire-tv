import { ServiceFailure } from './budget.js';
import { LIMITS } from './config.js';

export const PCM_SAMPLE_RATE = 16000;
export const WAV_HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2; // Polly PCM: mono, signed 16-bit little-endian.

export function pcmDurationMs(byteLength: number): number {
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0 || byteLength % BYTES_PER_SAMPLE) throw new ServiceFailure('bad_result');
  return byteLength / (PCM_SAMPLE_RATE * BYTES_PER_SAMPLE / 1000);
}

/** One bounded allocation, no encoder/process/file. The caller owns the PCM. */
export function pcmToWav(pcm: Buffer): Buffer {
  pcmDurationMs(pcm.length);
  if (pcm.length + WAV_HEADER_BYTES > LIMITS.ttsBytes) throw new ServiceFailure('bad_result');
  const wav = Buffer.allocUnsafe(WAV_HEADER_BYTES + pcm.length);
  wav.write('RIFF', 0, 'ascii'); wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVE', 8, 'ascii'); wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(PCM_SAMPLE_RATE, 24); wav.writeUInt32LE(PCM_SAMPLE_RATE * BYTES_PER_SAMPLE, 28);
  wav.writeUInt16LE(BYTES_PER_SAMPLE, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii'); wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, WAV_HEADER_BYTES);
  return wav;
}
