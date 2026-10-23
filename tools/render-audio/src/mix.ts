import { CHANNELS, SAMPLE_RATE } from './catalog.ts';
import { samplePeak } from './pcm.ts';

export const TARGET_PEAK_DBFS = -3;
export const RUNTIME_BUS_LEVELS = { sfxBus: 1, musicBus: 1, master: 1 } as const;
export const OVERLAP_INPUTS = [
  { id: 'music-win', bus: 'music' },
  { id: 'sfx-fanfare', bus: 'sfx' },
  { id: 'sfx-ko', bus: 'sfx' },
  { id: 'sfx-crowd-2-18', bus: 'sfx' },
] as const;

export interface BankPcm {
  id: string;
  channels: readonly Float32Array[];
}

/** One gain from the bank's greatest absolute float sample, never one gain per asset. */
export function bankMakeupGain(bank: readonly BankPcm[], targetPeakDbfs = TARGET_PEAK_DBFS) {
  if (!Number.isFinite(targetPeakDbfs) || targetPeakDbfs >= 0) throw new Error('The makeup target must leave single-file headroom.');
  let sourcePeak = 0, loudestId = '';
  for (const asset of bank) {
    const peak = samplePeak(asset.channels);
    if (peak > sourcePeak) { sourcePeak = peak; loudestId = asset.id; }
  }
  if (!sourcePeak) throw new Error('Cannot boost an empty or silent bank.');
  const sourcePeakDbfs = 20 * Math.log10(sourcePeak);
  const makeupGainDb = targetPeakDbfs - sourcePeakDbfs;
  return { makeupGainDb, linearGain: 10 ** (makeupGainDb / 20), sourcePeakDbfs, loudestId, targetPeakDbfs };
}

export interface RuntimeTrack extends BankPcm {
  bus: 'sfx' | 'music';
}

/** Sum the committed boosted PCM from t=0 in float64 at unity, before the TV limiter. */
export function runtimeOverlap(tracks: readonly RuntimeTrack[], levels: { sfxBus: number; musicBus: number; master: number } = RUNTIME_BUS_LEVELS) {
  if (!tracks.length || tracks.some((track) => track.channels.length !== CHANNELS || !track.channels[0]?.length || track.channels.some((channel) => channel.length !== track.channels[0]!.length))) throw new Error('Overlap requires nonempty, equal-length stereo tracks.');
  if (Object.values(levels).some((gain) => !Number.isFinite(gain) || gain < 0)) throw new Error('Invalid runtime mix levels.');
  const lengthSamples = Math.max(...tracks.map((track) => track.channels[0]!.length));
  const overFullScaleFrames = new Uint8Array(lengthSamples);
  const byChannel = Array.from({ length: CHANNELS }, (_, channel) => {
    let peak = 0, peakSample = 0, samplesOverZeroDbfs = 0;
    for (let sample = 0; sample < lengthSamples; sample++) {
      let sum = 0;
      for (const track of tracks) {
        const value = track.channels[channel]![sample] ?? 0;
        if (!Number.isFinite(value)) throw new Error('Nonfinite runtime overlap PCM.');
        sum += value * (track.bus === 'music' ? levels.musicBus : levels.sfxBus);
      }
      const amplitude = Math.abs(sum * levels.master);
      if (amplitude > peak) { peak = amplitude; peakSample = sample; }
      if (amplitude > 1) { samplesOverZeroDbfs++; overFullScaleFrames[sample] = 1; }
    }
    return { channel, peakAmplitude: peak, peakDbfs: peak ? 20 * Math.log10(peak) : null, peakSample, peakTimeSeconds: peakSample / SAMPLE_RATE, samplesOverZeroDbfs };
  });
  const peakAmplitude = Math.max(...byChannel.map((channel) => channel.peakAmplitude));
  const peakDbfs = peakAmplitude ? 20 * Math.log10(peakAmplitude) : null;
  return {
    inputs: tracks.map((track) => ({ id: track.id, bus: track.bus, busGain: track.bus === 'music' ? levels.musicBus : levels.sfxBus, startSample: 0 })),
    runtimeBusLevels: levels, sampleRate: SAMPLE_RATE, lengthSamples, durationSeconds: lengthSamples / SAMPLE_RATE,
    summation: 'Committed boosted PCM16 decoded to float; signed sample-wise sum in float64 from sample 0; silence after each file ends; every file and master at unity (1.0); before the TV output soft limiter.',
    peakAmplitude, peakDbfs, preMasterPeakDbfs: peakDbfs === null ? null : peakDbfs - 20 * Math.log10(levels.master),
    samplesOverZeroDbfs: byChannel.reduce((count, channel) => count + channel.samplesOverZeroDbfs, 0),
    framesOverZeroDbfs: overFullScaleFrames.reduce((count, frame) => count + frame, 0),
    minimumAttenuationToZeroDbfs: peakDbfs === null ? 0 : Math.max(0, peakDbfs),
    byChannel,
  };
}
