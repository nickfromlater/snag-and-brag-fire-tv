import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assetSeed, EFFECTS, loopTiming, MUSIC, SAMPLE_RATE, TRIM_PAD_SAMPLES } from '../src/catalog.ts';
import { analyzeSeam, analyzeWav, encodeWav, trimmedLength } from '../src/pcm.ts';
import { extractAudio, inspectSource } from '../src/source.ts';
import { bankMakeupGain, OVERLAP_INPUTS, RUNTIME_BUS_LEVELS, runtimeOverlap, TARGET_PEAK_DBFS } from '../src/mix.ts';

const root = resolve(import.meta.dirname, '../../..');
const source = readFileSync(resolve(root, 'reference/src/game.js'), 'utf8');
const inspected = inspectSource(source);
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

interface ManifestFile {
  id: string;
  kind: string;
  effect?: string;
  wav: string;
  ogg: string;
  wavSha256: string;
  oggSha256: string;
  wavBytes: number;
  oggBytes: number;
  durationSeconds: number;
  lengthSamples: number;
  peakDbfs: number;
  rmsDbfs: number;
  sourcePeakDbfs: number;
  sourcePcm16Sha256: string;
  integratedLoudnessLufs: number;
  integratedLoudnessStatus: string;
  deterministicMix: { junctions: number; unityNodes: number; maxInputsPerSum: number };
  callSites: { line: number; expression: string; kind: string }[];
  loop?: ReturnType<typeof loopTiming> & { bpm: number; bars: number; steps: number; seam: ReturnType<typeof analyzeSeam>; spectrogram: string };
}

interface Manifest {
  files: ManifestFile[];
  totals: { effects: number; loops: number; wavBytes: number; oggBytes: number; totalAudioBytes: number };
  source: { sourceSha256: string; audioSha256: string; verbatim: boolean };
  render: { realtimeContextAttempts: number; schedulerTimerAttempts: number };
  mix: {
    sourceRenderLevels: { sfxBus: number; musicBus: number; master: number; reverbWet: number };
    gainsAndCompressorBakedIntoFiles: boolean;
    makeupGainDb: number;
    makeupGainLinear: number;
    makeupReference: { loudestId: string; sourcePeakDbfs: number; targetPeakDbfs: number; measuredBankPeakDbfs: number };
    runtimeBusLevels: typeof RUNTIME_BUS_LEVELS;
    filePlaybackLevels: { sfx: number; music: number; master: number };
    runtimeOverlap: ReturnType<typeof runtimeOverlap>;
    outputSoftLimiter: { appliedToAssets: boolean };
  };
}

describe('mockup coverage and sample boundaries', () => {
  it('covers every effect and all calls/callbacks including nested composites', () => {
    const effectNames = [...new Set(EFFECTS.map((spec) => spec.effect))].sort();
    expect(effectNames).toEqual(inspected.definitions);
    expect(Object.keys(inspected.callSites).every((effect) => effectNames.includes(effect))).toBe(true);
    expect(inspected.callSites.voice!.filter((site) => site.kind === 'callback')).toHaveLength(2);
    expect(inspected.callSites.shutter).toEqual([expect.objectContaining({ kind: 'embedded', expression: 'this.shutter()' })]);
    expect(inspected.callSites.crowd!.some((site) => site.expression === 'this.crowd(2,.18)')).toBe(true);
  });

  it('extracts the complete audio block without editing any source byte', () => {
    const extracted = extractAudio(source);
    expect(extracted.code).toBe(source.split('\n').slice(extracted.startLine - 1, extracted.endLine).join('\n') + '\n');
    expect(extracted.code).toContain('SFX.boom=function');
    expect(extracted.code).toContain('SFX.ko=function');
    expect(extracted.code).toContain('var MUS=');
    expect(extracted.code).not.toContain('Object.keys(ART)');
  });

  it('includes all required parameter values and independent variant seeds', () => {
    expect(EFFECTS).toHaveLength(112);
    expect(new Set(EFFECTS.map((spec) => spec.id)).size).toBe(112);
    expect(EFFECTS.filter((spec) => spec.effect === 'pop').map((spec) => spec.parameters.n)).toEqual([0, 2, 4, 6, 8]);
    expect(EFFECTS.filter((spec) => spec.effect === 'mash')).toHaveLength(13);
    expect(EFFECTS.filter((spec) => spec.effect === 'react')).toHaveLength(26);
    expect(EFFECTS.filter((spec) => spec.effect === 'mtick').map((spec) => spec.parameters.p)).toEqual(Array.from({ length: 9 }, (_, n) => n / 8));
    expect(EFFECTS.filter((spec) => spec.effect === 'crowd')).toHaveLength(7);
    expect(EFFECTS.filter((spec) => spec.effect === 'voice')).toHaveLength(16);
    expect(MUSIC.map((spec) => spec.bpm)).toEqual([102, 124, 140, 90, 116, 122]);
    expect(new Set([...EFFECTS, ...MUSIC].map((spec) => assetSeed(spec.id))).size).toBe(118);
    expect(assetSeed('sfx-boom-v1', 1)).not.toBe(assetSeed('sfx-boom-v1', 2));
  });

  it.each(MUSIC)('keeps $mood four-bar boundaries within one sample of exact tempo', ({ bpm }) => {
    const timing = loopTiming(bpm);
    expect(timing.lengthSamples).toBe(timing.endSample - timing.startSample);
    expect(Math.abs(timing.lengthSamples - SAMPLE_RATE * 60 / bpm * 16)).toBeLessThan(1);
    expect(timing.barBoundariesSamples[0]).toBe(0);
    expect(timing.barBoundariesSamples[4]).toBe(timing.lengthSamples);
    for (let bar = 0; bar <= 4; bar++) expect(Math.abs(timing.barBoundariesSamples[bar]! - timing.idealSamples * bar / 4)).toBeLessThan(1);
  });
});

describe('audio analysis guards', () => {
  it('applies one bank-wide gain pointwise, keeping quiet sounds quieter and wave shapes intact', () => {
    const loud = [new Float32Array([0.05, -0.25, 0.125]), new Float32Array([0.2, 0, -0.1])];
    const quiet = loud.map((channel) => Float32Array.from(channel, (sample) => sample * 0.125));
    const gain = bankMakeupGain([{ id: 'loud', channels: loud }, { id: 'quiet', channels: quiet }]);
    expect(gain.loudestId).toBe('loud');
    expect(gain.linearGain * 0.25).toBeCloseTo(10 ** (-3 / 20), 12);
    for (const source of [loud, quiet]) {
      const boosted = analyzeWav(encodeWav(source, 0, 3, gain.linearGain));
      for (let channel = 0; channel < 2; channel++) for (let sample = 0; sample < 3; sample++) {
        expect(Math.abs(boosted.channels[channel]![sample]! - source[channel]![sample]! * gain.linearGain)).toBeLessThan(2 / 32768);
      }
    }
    const loudPeak = analyzeWav(encodeWav(loud, 0, 3, gain.linearGain)).peakDbfs;
    const quietPeak = analyzeWav(encodeWav(quiet, 0, 3, gain.linearGain)).peakDbfs;
    expect(loudPeak - quietPeak).toBeCloseTo(20 * Math.log10(8), 2);
    expect(() => bankMakeupGain([])).toThrow('silent bank');
  });

  it('sums overlap at unity with signed samples and silence after shorter files end', () => {
    const music = [new Float32Array([1, 1, 0.5]), new Float32Array([0.5, 0.5, 0.25])];
    const sfx = [new Float32Array([0.5, -0.5]), new Float32Array([0.25, -0.25])];
    const overlap = runtimeOverlap([{ id: 'music', bus: 'music', channels: music }, { id: 'sfx', bus: 'sfx', channels: sfx }]);
    expect(overlap.peakAmplitude).toBeCloseTo(1 + 0.5, 12);
    expect(overlap.lengthSamples).toBe(3);
    expect(overlap.byChannel[0]!.peakSample).toBe(0);
    expect(overlap.minimumAttenuationToZeroDbfs).toBeCloseTo(20 * Math.log10(1.5), 12);
    expect(overlap.samplesOverZeroDbfs).toBe(1);
    expect(overlap.framesOverZeroDbfs).toBe(1);
  });

  it('supports sound/music on-off toggles as the only category gain changes', () => {
    const tracks = [
      { id: 'music', bus: 'music' as const, channels: [new Float32Array([0.25]), new Float32Array([0.25])] },
      { id: 'sound', bus: 'sfx' as const, channels: [new Float32Array([0.5]), new Float32Array([0.5])] },
    ];
    expect(runtimeOverlap(tracks, { sfxBus: 0, musicBus: 1, master: 1 }).peakAmplitude).toBe(0.25);
    expect(runtimeOverlap(tracks, { sfxBus: 1, musicBus: 0, master: 1 }).peakAmplitude).toBe(0.5);
    expect(runtimeOverlap(tracks, { sfxBus: 0, musicBus: 0, master: 1 }).peakAmplitude).toBe(0);
  });

  it('reports overlap above full scale without clipping, compressing or limiting it', () => {
    const channels = [new Float32Array([-0.9]), new Float32Array([-0.9])];
    const overlap = runtimeOverlap([{ id: 'a', bus: 'sfx', channels }, { id: 'b', bus: 'sfx', channels }]);
    expect(overlap.peakAmplitude).toBeCloseTo(0.9 * 2, 6);
    expect(overlap.peakDbfs).toBeGreaterThan(0);
    expect(overlap.samplesOverZeroDbfs).toBe(2);
    expect(overlap.framesOverZeroDbfs).toBe(1);
  });

  it('retains an attack and stereo tail plus exactly 50 ms, ignoring subthreshold silence', () => {
    const channels = [new Float32Array(6000), new Float32Array(6000)];
    channels[0]![0] = 0.1; channels[1]![1000] = -0.002; channels[0]![4000] = 0.0001;
    expect(trimmedLength(channels)).toBe(1001 + TRIM_PAD_SAMPLES);
    expect(() => trimmedLength([new Float32Array(6000), new Float32Array(6000)])).toThrow('silent');
    channels[1]![5900] = 0.1;
    expect(() => trimmedLength(channels)).toThrow('too short');
  });

  it('writes stereo PCM16 without clipping, invalid samples or an unexpected sample rate', () => {
    const wav = encodeWav([new Float32Array([-0.5, 0, 0.5]), new Float32Array([0.25, 0, -0.25])]);
    const analyzed = analyzeWav(wav);
    expect(analyzed.lengthSamples).toBe(3);
    expect(analyzed.channels[0]).toEqual(new Float32Array([-0.5, 0, 0.5]));
    expect(wav.readUInt32LE(24)).toBe(48_000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(() => encodeWav([new Float32Array([1]), new Float32Array([0])])).toThrow('clipped');
    expect(() => encodeWav([new Float32Array([NaN]), new Float32Array([0])])).toThrow('Nonfinite');
  });

  it('rejects an abrupt wrap even if samples away from the seam are quiet', () => {
    const abrupt = new Float32Array(6000); abrupt.fill(0.1, 3000);
    expect(analyzeSeam([abrupt, abrupt]).passed).toBe(false);
    const periodic = Float32Array.from({ length: 6000 }, (_, i) => Math.sin(i / 6000 * Math.PI * 200) * 0.1);
    expect(analyzeSeam([periodic, periodic]).passed).toBe(true);
  });
});

describe('committed deliverables', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'assets/audio/manifest.json'), 'utf8')) as Manifest;

  it('contains exactly the requested catalog with matching source, mix and safety evidence', () => {
    expect(manifest.files.map((entry) => entry.id)).toEqual([...EFFECTS, ...MUSIC].map((spec) => spec.id));
    expect(manifest.source).toMatchObject({ sourceSha256: hash(source), audioSha256: hash(extractAudio(source).code), verbatim: true });
    expect(manifest.mix.sourceRenderLevels).toEqual({ sfxBus: 0.8, musicBus: 0.22, master: 0.9, reverbWet: 0.18 });
    expect(manifest.mix.gainsAndCompressorBakedIntoFiles).toBe(true);
    expect(manifest.mix.runtimeBusLevels).toEqual(RUNTIME_BUS_LEVELS);
    expect(manifest.mix.filePlaybackLevels).toEqual({ sfx: 1, music: 1, master: 1 });
    expect(manifest.mix.makeupGainDb).toBeGreaterThan(0);
    expect(manifest.mix.makeupGainLinear).toBeCloseTo(10 ** (manifest.mix.makeupGainDb / 20), 12);
    expect(manifest.mix.makeupReference.targetPeakDbfs).toBe(TARGET_PEAK_DBFS);
    expect(Math.max(...manifest.files.map((entry) => entry.peakDbfs))).toBeCloseTo(-3, 3);
    expect(manifest.mix.outputSoftLimiter.appliedToAssets).toBe(false);
    expect(manifest.render).toMatchObject({ realtimeContextAttempts: 0, schedulerTimerAttempts: 0 });
    expect(readdirSync(resolve(root, 'assets/audio')).filter((name) => name.endsWith('.wav'))).toHaveLength(118);
    expect(readdirSync(resolve(root, 'assets/audio/ogg')).filter((name) => name.endsWith('.ogg'))).toHaveLength(118);
    expect(manifest.totals).toEqual({
      effects: 112, loops: 6,
      wavBytes: manifest.files.reduce((sum, entry) => sum + entry.wavBytes, 0),
      oggBytes: manifest.files.reduce((sum, entry) => sum + entry.oggBytes, 0),
      totalAudioBytes: manifest.files.reduce((sum, entry) => sum + entry.wavBytes + entry.oggBytes, 0),
    });
  });

  it.each(manifest.files)('$id matches its actual WAV/Ogg, loudness, call sites and loop evidence', (entry) => {
    const wav = readFileSync(resolve(root, entry.wav)), ogg = readFileSync(resolve(root, entry.ogg));
    const analyzed = analyzeWav(wav);
    expect(hash(wav)).toBe(entry.wavSha256); expect(hash(ogg)).toBe(entry.oggSha256);
    expect(wav.length).toBe(entry.wavBytes); expect(ogg.length).toBe(entry.oggBytes);
    expect(ogg.toString('ascii', 0, 4)).toBe('OggS'); expect(ogg.includes(Buffer.from('vorbis'))).toBe(true);
    expect(analyzed.lengthSamples).toBe(entry.lengthSamples);
    expect(analyzed.durationSeconds).toBeCloseTo(entry.durationSeconds, 7);
    expect(analyzed.peakDbfs).toBeCloseTo(entry.peakDbfs, 7); expect(analyzed.peakDbfs).toBeLessThan(0);
    const idealBoostedPeak = 10 ** ((entry.sourcePeakDbfs + manifest.mix.makeupGainDb) / 20);
    expect(Math.abs(10 ** (analyzed.peakDbfs / 20) - idealBoostedPeak)).toBeLessThan(2 / 32768);
    expect(entry.sourcePcm16Sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(analyzed.rmsDbfs).toBeCloseTo(entry.rmsDbfs, 7);
    expect(Number.isFinite(entry.integratedLoudnessLufs)).toBe(true);
    expect(entry.deterministicMix.maxInputsPerSum).toBe(2);
    expect(entry.deterministicMix.unityNodes).toBeGreaterThanOrEqual(0);
    if (entry.durationSeconds < 0.4) expect(entry.integratedLoudnessStatus).toBe('insufficient-duration');
    if (entry.effect) expect(entry.callSites).toEqual(inspected.callSites[entry.effect] ?? []);
    if (entry.loop) {
      expect(entry.loop).toMatchObject({ ...loopTiming(entry.loop.bpm), bars: 4, steps: 64 });
      expect(entry.lengthSamples).toBe(entry.loop.lengthSamples);
      expect(analyzeSeam(analyzed.channels)).toEqual(entry.loop.seam);
      expect(entry.loop.seam.passed).toBe(true);
      expect(readFileSync(resolve(root, entry.loop.spectrogram)).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    }
  });

  it('reproduces the realistic runtime overlap directly from every committed input WAV', () => {
    const overlap = runtimeOverlap(OVERLAP_INPUTS.map((input) => {
      const entry = manifest.files.find((file) => file.id === input.id)!;
      return { ...input, channels: analyzeWav(readFileSync(resolve(root, entry.wav))).channels };
    }), manifest.mix.runtimeBusLevels);
    expect(overlap).toEqual(manifest.mix.runtimeOverlap);
    expect(JSON.parse(readFileSync(resolve(root, 'docs/review/audio/runtime-overlap.json'), 'utf8'))).toEqual(overlap);
  });

  it('preserves the source tomato duplicates and creates every review image', () => {
    const tomatoes = manifest.files.filter((entry) => entry.id.startsWith('sfx-react-tomato'));
    expect(new Set(tomatoes.map((entry) => entry.wavSha256)).size).toBe(1);
    expect(readdirSync(resolve(root, 'docs/review/audio')).filter((name) => name.endsWith('.png'))).toHaveLength(7);
    expect(readFileSync(resolve(root, 'docs/review/audio/effect-waveforms.png')).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });
});
