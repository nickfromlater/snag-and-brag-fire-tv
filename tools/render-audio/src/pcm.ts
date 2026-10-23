import { CHANNELS, SAMPLE_RATE, TRIM_PAD_SAMPLES, TRIM_THRESHOLD } from './catalog.ts';

/** Keep the original attack and the final sample above -60 dBFS, plus 50 ms. */
export function trimmedLength(channels: readonly Float32Array[]): number {
  if (channels.length !== CHANNELS || !channels[0]?.length || channels.some((channel) => channel.length !== channels[0]!.length)) throw new Error('Expected equal, nonempty stereo channels.');
  let last = -1;
  for (let i = channels[0].length - 1; i >= 0 && last < 0; i--) {
    if (channels.some((channel) => Math.abs(channel[i]!) >= TRIM_THRESHOLD)) last = i;
  }
  if (last < 0) throw new Error('The rendered asset is silent at -60 dBFS.');
  if (last + 1 + TRIM_PAD_SAMPLES >= channels[0].length) throw new Error('The render is too short to retain the complete tail.');
  return last + 1 + TRIM_PAD_SAMPLES;
}

export function encodeWav(channels: readonly Float32Array[], start = 0, end = channels[0]!.length, gain = 1): Buffer {
  if (channels.length !== CHANNELS || end <= start || start < 0 || channels.some((channel) => end > channel.length)) throw new Error('Invalid stereo PCM range.');
  if (!Number.isFinite(gain) || gain <= 0) throw new Error('Invalid uniform PCM gain.');
  const frames = end - start;
  const dataBytes = frames * CHANNELS * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataBytes, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(CHANNELS, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24); wav.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28);
  wav.writeUInt16LE(CHANNELS * 2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(dataBytes, 40);
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < CHANNELS; channel++) {
      const sample = channels[channel]![start + frame]! * gain;
      if (!Number.isFinite(sample) || Math.abs(sample) >= 1) throw new Error('Nonfinite or clipped source PCM.');
      wav.writeInt16LE(Math.round(sample * (sample < 0 ? 32768 : 32767)), 44 + (frame * CHANNELS + channel) * 2);
    }
  }
  return wav;
}

export function samplePeak(channels: readonly Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) for (const sample of channel) {
    if (!Number.isFinite(sample)) throw new Error('Nonfinite source PCM.');
    peak = Math.max(peak, Math.abs(sample));
  }
  return peak;
}

export function analyzeWav(wav: Buffer) {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 16) !== 'WAVEfmt ' || wav.readUInt32LE(24) !== SAMPLE_RATE || wav.readUInt16LE(22) !== CHANNELS || wav.readUInt16LE(34) !== 16 || wav.length !== wav.readUInt32LE(40) + 44) throw new Error('Unexpected WAV format.');
  const lengthSamples = wav.readUInt32LE(40) / 4;
  const channels = [new Float32Array(lengthSamples), new Float32Array(lengthSamples)];
  let peak = 0, energy = 0;
  for (let i = 0; i < lengthSamples * CHANNELS; i++) {
    const value = wav.readInt16LE(44 + i * 2) / 32768;
    channels[i % CHANNELS]![Math.floor(i / CHANNELS)] = value;
    peak = Math.max(peak, Math.abs(value)); energy += value * value;
  }
  const rms = Math.sqrt(energy / (lengthSamples * CHANNELS));
  return { lengthSamples, durationSeconds: lengthSamples / SAMPLE_RATE, peakDbfs: 20 * Math.log10(peak), rmsDbfs: 20 * Math.log10(rms), channels };
}

/** A wrap may not exceed any ordinary adjacent-sample jump within 50 ms of the seam. */
export function analyzeSeam(channels: readonly Float32Array[]) {
  const nearbySamples = SAMPLE_RATE * 0.05;
  const byChannel = channels.map((samples) => {
    const wrapDelta = Math.abs(samples[0]! - samples[samples.length - 1]!);
    let nearbyMaxDelta = 0;
    for (let i = 1; i < Math.min(samples.length, nearbySamples); i++) {
      nearbyMaxDelta = Math.max(nearbyMaxDelta, Math.abs(samples[i]! - samples[i - 1]!));
      const j = samples.length - i;
      nearbyMaxDelta = Math.max(nearbyMaxDelta, Math.abs(samples[j]! - samples[j - 1]!));
    }
    return { wrapDelta, nearbyMaxDelta, passed: wrapDelta <= nearbyMaxDelta };
  });
  return { nearbySamples, byChannel, passed: byChannel.every((channel) => channel.passed) };
}

export function waveformBins(channels: readonly Float32Array[], width = 240): [number, number][] {
  return Array.from({ length: width }, (_, bin) => {
    const start = Math.floor(bin * channels[0]!.length / width);
    const end = Math.max(start + 1, Math.floor((bin + 1) * channels[0]!.length / width));
    let low = 0, high = 0;
    for (const channel of channels) for (let i = start; i < end; i++) { low = Math.min(low, channel[i]!); high = Math.max(high, channel[i]!); }
    return [low, high];
  });
}
