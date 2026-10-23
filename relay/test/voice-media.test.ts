import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { fragmentVoice } from '../src/voice-media.js';
import { SILENT_PCM } from '../src/silence.js';
import { pcmToWav } from '../src/wav.js';

const installed = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
describe('memory-only native AAC transport from Polly PCM WAV', () => {
  it.skipIf(!installed)('creates decodable fragmented AAC without changing the WAV', async () => {
    const wav = pcmToWav(SILENT_PCM), original = Buffer.from(wav);
    const stream = await fragmentVoice(wav, new AbortController().signal);
    expect(stream).toBeDefined(); expect(stream!.length).toBeLessThan(1024 * 1024);
    for (const box of ['ftyp', 'moov', 'moof', 'mdat']) expect(stream!.includes(Buffer.from(box))).toBe(true);
    const decoded = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1'], { input: stream });
    expect(decoded.status).toBe(0); expect(decoded.stdout.length).toBeGreaterThan(0);
    let peak = 0; for (let i = 0; i < decoded.stdout.length; i += 4) peak = Math.max(peak, Math.abs(decoded.stdout.readFloatLE(i)));
    expect(peak).toBe(0); expect(wav).toEqual(original); stream!.fill(0); wav.fill(0);
  });
  it('does not spawn for an aborted room', async () => {
    const abort = new AbortController(); abort.abort(); expect(await fragmentVoice(pcmToWav(SILENT_PCM), abort.signal)).toBeUndefined();
  });
});
