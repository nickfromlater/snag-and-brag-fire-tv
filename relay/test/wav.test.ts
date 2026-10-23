import { describe, expect, it } from 'vitest';
import { ServiceFailure } from '../src/budget.js';
import { LIMITS } from '../src/config.js';
import { PCM_SAMPLE_RATE, WAV_HEADER_BYTES, pcmDurationMs, pcmToWav } from '../src/wav.js';
import { mockVoiceProvider } from '../src/polly.js';

describe('Polly mono 16-bit LE PCM WAV envelope', () => {
  it('writes every RIFF/fmt/data field and copies signed PCM without changing it', () => {
    const pcm = Buffer.alloc(10);
    [-32768, -1, 0, 1, 32767].forEach((sample, i) => pcm.writeInt16LE(sample, i * 2));
    const original = Buffer.from(pcm), wav = pcmToWav(pcm);
    expect(wav.length).toBe(WAV_HEADER_BYTES + pcm.length);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF'); expect(wav.readUInt32LE(4)).toBe(wav.length - 8);
    expect(wav.toString('ascii', 8, 16)).toBe('WAVEfmt '); expect(wav.readUInt32LE(16)).toBe(16);
    expect(wav.readUInt16LE(20)).toBe(1); expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(PCM_SAMPLE_RATE); expect(wav.readUInt32LE(28)).toBe(32000);
    expect(wav.readUInt16LE(32)).toBe(2); expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.toString('ascii', 36, 40)).toBe('data'); expect(wav.readUInt32LE(40)).toBe(pcm.length);
    expect(wav.subarray(44)).toEqual(original); wav.fill(0); expect(pcm).toEqual(original);
  });
  it('derives duration exactly from PCM sample count and rejects invalid or oversized payloads', () => {
    expect(pcmDurationMs(32000)).toBe(1000); expect(pcmDurationMs(64000)).toBe(2000);
    expect(pcmDurationMs(32002)).toBe(1000.0625); expect(pcmDurationMs(2)).toBe(.0625);
    for (const length of [0, 1, -2, NaN, Infinity, 1.5]) expect(() => pcmDurationMs(length)).toThrow(ServiceFailure);
    expect(pcmToWav(Buffer.alloc(LIMITS.ttsBytes - WAV_HEADER_BYTES))).toHaveLength(LIMITS.ttsBytes);
    expect(() => pcmToWav(Buffer.alloc(LIMITS.ttsBytes - WAV_HEADER_BYTES + 2))).toThrow(ServiceFailure);
    expect(() => pcmToWav(Buffer.alloc(1))).toThrow(ServiceFailure);
  });
  it('builds fresh silent mock WAV buffers with marks inside the byte-derived duration', async () => {
    const provider = mockVoiceProvider(0), signal = new AbortController().signal;
    const first = await provider('A **splendid** square.', signal), second = await provider('A square.', signal);
    expect(first.audio.toString('ascii', 0, 4)).toBe('RIFF'); expect(first.audio.readUInt32LE(40)).toBe(32000);
    expect(first.durationMs).toBe(pcmDurationMs(first.audio.length - WAV_HEADER_BYTES));
    expect(first.audio.subarray(WAV_HEADER_BYTES).every(byte => byte === 0)).toBe(true);
    expect(first.marks.every(mark => mark.time < first.durationMs)).toBe(true);
    first.audio.fill(0); expect(second.audio.toString('ascii', 0, 4)).toBe('RIFF');
  });
});
