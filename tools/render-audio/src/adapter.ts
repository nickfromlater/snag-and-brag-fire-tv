/* Classic browser script. The declarations describe globals from the verbatim mockup. */
declare const AU: {
  ctx: BaseAudioContext | null;
  sfx: boolean;
  mus: boolean;
  master: GainNode;
  sb: GainNode;
  mb: GainNode;
  verb: ConvolverNode;
  noise: AudioBuffer;
};
declare const SFX: Record<string, (...args: (string | number)[]) => void>;
declare const MUS: {
  mood: string;
  bpm: number;
  iv: number | null;
  start: () => void;
  set: (mood: string) => void;
  play: (step: number, time: number) => void;
};
declare function ac(): BaseAudioContext | null;
declare const audioSafety: { realtimeAttempts: number; timerAttempts: number };
declare function forbidRealtimeAudio(): never;

interface AudioRenderRequest {
  id: string;
  seed: number;
  kind: 'sfx' | 'music';
  effect?: string;
  args?: (number | string)[];
  mood?: string;
  bpm?: number;
}

interface WaveformItem {
  id: string;
  durationSeconds: number;
  peakDbfs: number;
  bins: [number, number][];
}

interface Window {
  audioRenderer: {
    render: typeof renderOffline;
    effectNames: () => string[];
    waveforms: typeof drawWaveforms;
    spectrogram: typeof drawSpectrogram;
  };
}

function seededRandom(initialSeed: number): () => number {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let value = Math.imul(seed ^ (seed >>> 15), seed | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Run the original ac() initializer with an offline constructor and no wall-clock scheduler. */
function initializeOffline(context: OfflineAudioContext) {
  let compressor: DynamicsCompressorNode | undefined;
  const facade = new Proxy(context, {
    get(target, key) {
      // ac() resumes suspended realtime contexts. An offline context must remain suspended until startRendering().
      if (key === 'state') return 'running';
      if (key === 'createDynamicsCompressor') return () => { compressor = target.createDynamicsCompressor(); return compressor; };
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const originalStart = MUS.start;
  try {
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: function OfflineConstructor() { return facade; } });
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: forbidRealtimeAudio });
    MUS.start = () => {};
    AU.ctx = null; AU.sfx = true; AU.mus = true;
    if (ac() !== facade || !compressor) throw new Error('The mockup did not initialize the offline graph.');
    AU.ctx = context;
  } finally {
    MUS.start = originalStart;
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: forbidRealtimeAudio });
  }
  return {
    master: AU.master.gain.value, sfx: AU.sb.gain.value, music: AU.mb.gain.value,
    compressor: {
      thresholdDb: compressor.threshold.value, ratio: compressor.ratio.value,
      kneeDb: compressor.knee.value, attackSeconds: compressor.attack.value, releaseSeconds: compressor.release.value,
    },
    impulseSamples: AU.verb.buffer!.length, impulseChannels: AU.verb.buffer!.numberOfChannels,
    noiseSamples: AU.noise.length, convolverNormalize: AU.verb.normalize,
  };
}

function channelBase64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(binary);
}

/**
 * Chromium stores fan-in connections in pointer-hash order. Floating sums of 3+ voices
 * can therefore differ by a PCM16 count across contexts. Record source connection order,
 * then replace only multiway sums with balanced, unity-gain, two-input sums. Every
 * oscillator, filter, envelope, bus gain, reverb and compressor remains the original.
 */
function stableSumming(context: OfflineAudioContext) {
  const nativeConnect = AudioNode.prototype.connect;
  const inputs = new Map<AudioNode, Set<AudioNode>>();
  Object.defineProperty(AudioNode.prototype, 'connect', {
    configurable: true, writable: true,
    value: function (this: AudioNode, destination: AudioNode | AudioParam, ...ports: number[]) {
      if (destination instanceof AudioNode) {
        if (ports.some((port) => port !== 0)) throw new Error('The summing adapter supports the mockup default ports only.');
        if (!inputs.has(destination)) inputs.set(destination, new Set());
        inputs.get(destination)!.add(this);
      }
      return Reflect.apply(nativeConnect, this, [destination, ...ports]);
    },
  });
  const restore = () => Object.defineProperty(AudioNode.prototype, 'connect', { configurable: true, writable: true, value: nativeConnect });
  return {
    restore,
    finalize() {
      restore();
      let junctions = 0, unityNodes = 0;
      for (const [destination, sources] of inputs) {
        if (sources.size <= 2) continue;
        junctions++;
        let layer = [...sources];
        for (const source of layer) source.disconnect(destination);
        while (layer.length > 1) {
          const next: AudioNode[] = [];
          for (let index = 0; index < layer.length; index += 2) {
            if (!layer[index + 1]) { next.push(layer[index]!); continue; }
            const sum = context.createGain(); sum.gain.value = 1; unityNodes++;
            layer[index]!.connect(sum); layer[index + 1]!.connect(sum); next.push(sum);
          }
          layer = next;
        }
        layer[0]!.connect(destination);
      }
      return { junctions, unityNodes, maxInputsPerSum: 2 };
    },
  };
}

async function renderOffline(request: AudioRenderRequest) {
  const originalRandom = Math.random;
  Math.random = seededRandom(request.seed);
  let summing: ReturnType<typeof stableSumming> | undefined;
  try {
    const duration = request.kind === 'music' ? 3 * 60 / request.bpm! * 16 + 3 : 6;
    const context = new OfflineAudioContext(2, Math.ceil(duration * 48000), 48000);
    summing = stableSumming(context);
    const graph = initializeOffline(context);
    if (request.kind === 'sfx') {
      if (!request.effect || !SFX[request.effect]) throw new Error(`Unknown effect ${request.effect}`);
      SFX[request.effect]!.apply(SFX, request.args ?? []);
    } else {
      // Force set() to select the documented 102 bpm lobby, rather than its initial 104 bpm placeholder.
      MUS.mood = 'off'; MUS.set(request.mood!);
      if (MUS.bpm !== request.bpm) throw new Error(`BPM mismatch for ${request.id}`);
      const stepSeconds = 60 / MUS.bpm / 4;
      for (let step = 0; step < 192; step++) MUS.play(step % 64, step * stepSeconds);
    }
    const deterministicMix = summing.finalize();
    if (MUS.iv !== null || audioSafety.realtimeAttempts || audioSafety.timerAttempts) throw new Error('Realtime audio or timer scheduling was attempted.');
    const rendered = await context.startRendering();
    return {
      channels: [channelBase64(rendered.getChannelData(0)), channelBase64(rendered.getChannelData(1))],
      sampleRate: rendered.sampleRate, graph, safety: { ...audioSafety }, deterministicMix,
    };
  } finally {
    summing?.restore();
    Math.random = originalRandom;
    AU.ctx = null;
  }
}

function drawWaveforms(items: WaveformItem[]): string {
  const columns = 4, cellWidth = 340, cellHeight = 128;
  const canvas = document.createElement('canvas');
  canvas.width = columns * cellWidth + 48;
  canvas.height = Math.ceil(items.length / columns) * cellHeight + 104;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0E0B2B'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#FFF8EC'; ctx.font = 'bold 26px sans-serif'; ctx.fillText('Snag & Brag — effect waveforms', 24, 40);
  ctx.font = '14px sans-serif'; ctx.fillText('48 kHz stereo PCM · each thumbnail scaled to its labeled peak · both channels · audio unchanged', 24, 66);
  items.forEach((item, index) => {
    const x = 24 + index % columns * cellWidth, y = 88 + Math.floor(index / columns) * cellHeight;
    ctx.fillStyle = '#192054'; ctx.fillRect(x, y, cellWidth - 12, cellHeight - 12);
    ctx.fillStyle = '#FFF8EC'; ctx.font = 'bold 14px monospace'; ctx.fillText(item.id, x + 10, y + 21);
    ctx.font = '12px monospace'; ctx.fillText(`${item.durationSeconds.toFixed(3)} s   peak ${item.peakDbfs.toFixed(1)} dBFS`, x + 10, y + 40);
    const baseline = y + 78, height = 29 / (10 ** (item.peakDbfs / 20));
    ctx.strokeStyle = '#48518D'; ctx.beginPath(); ctx.moveTo(x + 10, baseline); ctx.lineTo(x + 316, baseline); ctx.stroke();
    ctx.strokeStyle = '#3FE0D0'; ctx.beginPath();
    item.bins.forEach(([low, high], bin) => {
      const bx = x + 10 + bin / (item.bins.length - 1) * 306;
      ctx.moveTo(bx, baseline - high * height); ctx.lineTo(bx, baseline - low * height);
    });
    ctx.stroke();
  });
  return canvas.toDataURL('image/png').split(',')[1]!;
}

async function drawSpectrogram(input: { pngBase64: string; id: string; bpm: number; durationSeconds: number; lengthSamples: number }): Promise<string> {
  const plot = new Image();
  plot.src = `data:image/png;base64,${input.pngBase64}`;
  await plot.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 1600; canvas.height = 660;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0E0B2B'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#FFF8EC'; ctx.font = 'bold 24px sans-serif';
  ctx.fillText(`${input.id} · ${input.bpm} bpm · 4 bars · ${input.lengthSamples} samples per loop`, 32, 34);
  ctx.font = '14px monospace'; ctx.fillText('Committed 16-bit WAV repeated 3× · Hann window · logarithmic frequency and magnitude · 0–24 kHz', 32, 58);
  ctx.drawImage(plot, 32, 92, 1536, 512);
  for (let loop = 0; loop <= 3; loop++) {
    const x = 32 + loop * 512;
    ctx.fillStyle = '#FF4FA0'; ctx.fillRect(x - 1, 80, 2, 12); ctx.fillRect(x - 1, 604, 2, 12);
    ctx.fillStyle = '#FFF8EC'; ctx.textAlign = loop === 0 ? 'left' : loop === 3 ? 'right' : 'center';
    ctx.fillText(`${(loop * input.durationSeconds).toFixed(5)} s${loop === 1 || loop === 2 ? ' · WRAP' : ''}`, x, 635);
  }
  return canvas.toDataURL('image/png').split(',')[1]!;
}

window.audioRenderer = { render: renderOffline, effectNames: () => Object.keys(SFX).sort(), waveforms: drawWaveforms, spectrogram: drawSpectrogram };
