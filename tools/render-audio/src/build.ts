import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { promisify } from 'node:util';
import puppeteer from 'puppeteer-core';
import ts from 'typescript';
import { assetSeed, BASE_SEED, CHANNELS, EFFECTS, loopTiming, MUSIC, SAMPLE_RATE } from './catalog.ts';
import { analyzeSeam, analyzeWav, encodeWav, samplePeak, trimmedLength, waveformBins } from './pcm.ts';
import { bankMakeupGain, OVERLAP_INPUTS, RUNTIME_BUS_LEVELS, runtimeOverlap, TARGET_PEAK_DBFS } from './mix.ts';
import type { RuntimeTrack } from './mix.ts';
import type { EffectSpec, MusicSpec } from './catalog.ts';
import { extractAudio, inspectSource } from './source.ts';
import type { CallSite } from './source.ts';

const run = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const tool = resolve(import.meta.dirname, '..');
const chrome = process.env.RENDER_AUDIO_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ffmpeg = process.env.RENDER_AUDIO_FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const ffprobe = join(dirname(ffmpeg), 'ffprobe');
const verify = process.argv.includes('--verify');
const baseSeed = process.env.RENDER_AUDIO_SEED === undefined ? BASE_SEED : Number(process.env.RENDER_AUDIO_SEED);
if(!Number.isInteger(baseSeed) || baseSeed < 0 || baseSeed > 0xffffffff) throw new Error('RENDER_AUDIO_SEED must be an unsigned 32-bit integer.');
const staging = await mkdtemp(join(tmpdir(), 'snag-audio-'));
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
let server: ReturnType<typeof createServer> | undefined;
try {
  const audioDir = join(staging, 'assets/audio');
  const qaDir = join(staging, 'docs/review/audio');
  await mkdir(join(audioDir, 'ogg'), { recursive: true });
  await mkdir(qaDir, { recursive: true });

  const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
  const rounded = (value: number) => Number(value.toFixed(8));
  const source = await readFile(join(root, 'reference/src/game.js'), 'utf8');
  const audio = extractAudio(source);
  const inspected = inspectSource(source);
  const effectNames = [...new Set(EFFECTS.map((spec) => spec.effect))].sort();
  if(JSON.stringify(effectNames) !== JSON.stringify(inspected.definitions)) throw new Error('The asset catalog does not cover every mockup SFX definition.');
  if(Object.keys(inspected.callSites).some((effect) => !effectNames.includes(effect))) throw new Error('A mockup SFX call has no rendered asset.');

  const guard = `
var audioSafety={realtimeAttempts:0,timerAttempts:0};
function forbidRealtimeAudio(){audioSafety.realtimeAttempts++;throw new Error('Realtime audio is forbidden.');}
Object.defineProperty(window,'AudioContext',{configurable:true,value:forbidRealtimeAudio});
Object.defineProperty(window,'webkitAudioContext',{configurable:true,value:forbidRealtimeAudio});
window.setInterval=function(){audioSafety.timerAttempts++;throw new Error('Wall-clock audio scheduling is forbidden.');};
`;
  const adapter = ts.transpileModule(await readFile(join(tool, 'src/adapter.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const routes = new Map([
    ['/', { type: 'text/html', body: await readFile(join(tool, 'index.html'), 'utf8') }],
    ['/guard.js', { type: 'text/javascript', body: guard }],
    ['/mockup-audio.js', { type: 'text/javascript', body: audio.code }],
    ['/adapter.js', { type: 'text/javascript', body: adapter }],
  ]);
  const rendererServer = createServer((request, response) => {
    const route = routes.get(request.url ?? '/');
    if(!route) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, {
      'Content-Type': `${route.type}; charset=utf-8`, 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; connect-src 'none'; media-src 'none'",
    });
    response.end(route.body);
  });
  server = rendererServer;
  await new Promise<void>((accept, reject) => { rendererServer.once('error', reject); rendererServer.listen(0, '127.0.0.1', accept); });
  const address = rendererServer.address();
  if(!address || typeof address === 'string') throw new Error('No local renderer address.');
  const origin = `http://127.0.0.1:${address.port}`;

  interface AssetEntry {
    id: string;
    kind: 'sfx' | 'music';
    effect?: string;
    parameters: Record<string, string | number>;
    variant?: number;
    seed: number;
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
    integratedLoudnessStatus: 'measured' | 'insufficient-duration' | 'below-gate';
    deterministicMix: Awaited<ReturnType<typeof renderOffline>>['deterministicMix'];
    callSites: CallSite[];
    loop?: ReturnType<typeof loopTiming> & {
      bpm: number; bars: number; steps: number; mood: string;
      seam: ReturnType<typeof analyzeSeam>; spectrogram: string;
    };
  }

  const entries: AssetEntry[] = [];
  const thumbnails: WaveformItem[] = [];
  let capturedGraph: Awaited<ReturnType<typeof renderOffline>>['graph'] | undefined;
  const pageErrors: string[] = [];
  browser = await puppeteer.launch({
    executablePath: chrome, headless: true,
    args: ['--mute-audio', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions', '--no-first-run'],
  });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if(request.url().startsWith(`${origin}/`) || request.url().startsWith('data:')) void request.continue();
    else void request.abort();
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  const sourceResponse = page.waitForResponse((response) => response.url() === `${origin}/mockup-audio.js`);
  await page.goto(origin, { waitUntil: 'load' });
  const loadedSource = await (await sourceResponse).text();
  if(loadedSource !== audio.code) throw new Error('The browser received modified mockup audio code.');
  const loadedEffects = await page.evaluate(() => window.audioRenderer.effectNames());
  if(JSON.stringify(loadedEffects) !== JSON.stringify(effectNames)) throw new Error('The browser has an incomplete SFX block.');

  const renderedBank: {
    spec: EffectSpec | MusicSpec;
    seed: number;
    channels: Float32Array[];
    timing?: ReturnType<typeof loopTiming>;
    deterministicMix: Awaited<ReturnType<typeof renderOffline>>['deterministicMix'];
  }[] = [];
  for(const spec of [...EFFECTS, ...MUSIC]) {
    const isMusic = 'mood' in spec;
    const seed = assetSeed(spec.id, baseSeed);
    const request: AudioRenderRequest = isMusic
      ? { id: spec.id, kind: 'music', seed, mood: spec.mood, bpm: spec.bpm }
      : { id: spec.id, kind: 'sfx', seed, effect: spec.effect, args: spec.args };
    const rendered = await page.evaluate((input) => window.audioRenderer.render(input), request);
    if(rendered.sampleRate !== SAMPLE_RATE || rendered.safety.realtimeAttempts || rendered.safety.timerAttempts) throw new Error(`Invalid offline render: ${spec.id}`);
    capturedGraph ??= rendered.graph;
    if(JSON.stringify(rendered.graph) !== JSON.stringify(capturedGraph)) throw new Error('The graph changed between assets.');
    const channels = rendered.channels.map((base64) => {
      const bytes = Buffer.from(base64, 'base64');
      return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    });
    const timing = isMusic ? loopTiming(spec.bpm) : undefined;
    const start = timing?.startSample ?? 0, end = timing?.endSample ?? trimmedLength(channels);
    renderedBank.push({ spec, seed, channels: channels.map((channel) => channel.slice(start, end)), timing, deterministicMix: rendered.deterministicMix });
    console.log(`Rendered ${renderedBank.length}/118 ${spec.id}`);
  }
  const makeup = bankMakeupGain(renderedBank.map(({ spec, channels }) => ({ id: spec.id, channels })));
  console.log(`Uniform makeup +${makeup.makeupGainDb.toFixed(8)} dB; source loudest ${makeup.loudestId} ${makeup.sourcePeakDbfs.toFixed(8)} dBFS; target ${TARGET_PEAK_DBFS.toFixed(1)} dBFS.`);
  const overlapTracks: RuntimeTrack[] = [];
  for(const { spec, seed, channels, timing, deterministicMix } of renderedBank) {
    const isMusic = 'mood' in spec;
    const sourcePcm16Sha256 = sha256(encodeWav(channels));
    const wav = encodeWav(channels, 0, channels[0]!.length, makeup.linearGain);
    const analyzed = analyzeWav(wav);
    const wavPath = join(audioDir, `${spec.id}.wav`), oggPath = join(audioDir, 'ogg', `${spec.id}.ogg`);
    await writeFile(wavPath, wav);
    await run(ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-i', wavPath, '-map_metadata', '-1', '-c:a', 'libvorbis', '-q:a', '5', '-fflags', '+bitexact', '-flags:a', '+bitexact', oggPath], { maxBuffer: 4 * 1024 * 1024 });
    const ogg = await readFile(oggPath);
    const probed = await run(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels,duration_ts,time_base', '-of', 'json', oggPath]);
    const stream = (JSON.parse(probed.stdout) as { streams: { codec_name: string; sample_rate: string; channels: number; duration_ts: number; time_base: string }[] }).streams[0];
    if(!stream || stream.codec_name !== 'vorbis' || stream.sample_rate !== String(SAMPLE_RATE) || stream.channels !== CHANNELS || stream.time_base !== '1/48000' || stream.duration_ts !== analyzed.lengthSamples) throw new Error(`Vorbis duration/format mismatch: ${spec.id}`);
    const loudness = await run(ffmpeg, ['-hide_banner', '-nostdin', '-i', wavPath, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { maxBuffer: 4 * 1024 * 1024 });
    const summary = loudness.stderr.slice(loudness.stderr.lastIndexOf('Summary:'));
    const integrated = Number(/\bI:\s*(-?[\d.]+) LUFS/.exec(summary)?.[1]);
    if(!Number.isFinite(integrated)) throw new Error(`Missing ebur128 loudness: ${spec.id}`);
    const entry: AssetEntry = {
      id: spec.id, kind: isMusic ? 'music' : 'sfx',
      ...(isMusic ? {} : { effect: spec.effect, ...(spec.variant === undefined ? {} : { variant: spec.variant }) }),
      parameters: isMusic ? { mood: spec.mood } : spec.parameters, seed,
      wav: `assets/audio/${spec.id}.wav`, ogg: `assets/audio/ogg/${spec.id}.ogg`,
      wavSha256: sha256(wav), oggSha256: sha256(ogg), wavBytes: wav.length, oggBytes: ogg.length,
      durationSeconds: rounded(analyzed.durationSeconds), lengthSamples: analyzed.lengthSamples,
      peakDbfs: rounded(analyzed.peakDbfs), rmsDbfs: rounded(analyzed.rmsDbfs), integratedLoudnessLufs: integrated,
      sourcePeakDbfs: 20 * Math.log10(samplePeak(channels)), sourcePcm16Sha256,
      integratedLoudnessStatus: analyzed.durationSeconds < 0.4 ? 'insufficient-duration' : integrated <= -70 ? 'below-gate' : 'measured',
      deterministicMix,
      callSites: isMusic ? [] : inspected.callSites[spec.effect] ?? [],
    };
    if(isMusic && timing) {
      const seam = analyzeSeam(analyzed.channels);
      if(!seam.passed) throw new Error(`Loop wrap discontinuity exceeds its nearby samples: ${spec.id} ${JSON.stringify(seam)}`);
      const rawPng = join(staging, `${spec.id}.png`);
      await run(ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-stream_loop', '2', '-i', wavPath, '-filter_complex', 'showspectrumpic=s=1536x512:legend=0:color=viridis:scale=log:fscale=log:win_func=hann', '-frames:v', '1', '-an', rawPng], { maxBuffer: 4 * 1024 * 1024 });
      const annotated = await page.evaluate((input) => window.audioRenderer.spectrogram(input), {
        pngBase64: (await readFile(rawPng)).toString('base64'), id: spec.id, bpm: spec.bpm,
        durationSeconds: analyzed.durationSeconds, lengthSamples: analyzed.lengthSamples,
      });
      await writeFile(join(qaDir, `${spec.id}-3x.png`), Buffer.from(annotated, 'base64'));
      await rm(rawPng);
      entry.loop = { ...timing, bpm: spec.bpm, bars: 4, steps: 64, mood: spec.mood, seam, spectrogram: `docs/review/audio/${spec.id}-3x.png` };
    } else thumbnails.push({ id: spec.id, durationSeconds: analyzed.durationSeconds, peakDbfs: analyzed.peakDbfs, bins: waveformBins(analyzed.channels) });
    const overlapInput = OVERLAP_INPUTS.find((input) => input.id === spec.id);
    if (overlapInput) overlapTracks.push({ id: spec.id, bus: overlapInput.bus, channels: analyzed.channels });
    entries.push(entry);
    console.log(`${entries.length}/118 ${spec.id} · ${analyzed.lengthSamples} samples · ${analyzed.peakDbfs.toFixed(1)} dBFS · ${integrated.toFixed(1)} LUFS${isMusic ? ' · seam PASS' : ''}`);
  }
  const measuredBankPeakDbfs = Math.max(...entries.map((entry) => entry.peakDbfs));
  if (Math.abs(measuredBankPeakDbfs - TARGET_PEAK_DBFS) > 0.0005) throw new Error(`Makeup gain missed the target: ${measuredBankPeakDbfs} dBFS.`);
  const overlap = runtimeOverlap(OVERLAP_INPUTS.map((input) => {
    const track = overlapTracks.find((candidate) => candidate.id === input.id);
    if (!track) throw new Error(`Missing runtime overlap input: ${input.id}`);
    return track;
  }));
  await writeFile(join(qaDir, 'runtime-overlap.json'), `${JSON.stringify(overlap, null, 2)}\n`);
  console.log(`Runtime overlap at unity: ${overlap.peakDbfs!.toFixed(8)} dBFS before TV soft limiter; ${overlap.samplesOverZeroDbfs} channel samples / ${overlap.framesOverZeroDbfs} stereo frames above 0 dBFS.`);
  if(pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join('\n')}`);
  const waveformPng = await page.evaluate((items) => window.audioRenderer.waveforms(items), thumbnails);
  await writeFile(join(qaDir, 'effect-waveforms.png'), Buffer.from(waveformPng, 'base64'));
  const ffmpegVersion = (await run(ffmpeg, ['-version'])).stdout.split('\n')[0]!;
  const totals = {
    effects: EFFECTS.length, loops: MUSIC.length,
    wavBytes: entries.reduce((sum, entry) => sum + entry.wavBytes, 0),
    oggBytes: entries.reduce((sum, entry) => sum + entry.oggBytes, 0),
    totalAudioBytes: entries.reduce((sum, entry) => sum + entry.wavBytes + entry.oggBytes, 0),
  };
  const manifest = {
    schemaVersion: 1, baseSeed, randomGenerator: 'mulberry32; per-id seed = FNV-style imul hash starting at baseSeed',
    source: { file: 'reference/src/game.js', ...audio, code: undefined, sourceSha256: sha256(source), audioSha256: sha256(audio.code), verbatim: true },
    format: { sampleRate: SAMPLE_RATE, channels: CHANNELS, wav: 'PCM signed 16-bit little endian', ogg: 'Vorbis quality 5; bitexact container; original sample count in granule position' },
    tools: { chrome: await browser.version(), ffmpeg: ffmpegVersion, puppeteerCore: JSON.parse(await readFile(join(tool, 'node_modules/puppeteer-core/package.json'), 'utf8')).version as string },
    render: {
      context: 'OfflineAudioContext only', realtimeContextAttempts: 0, schedulerTimerAttempts: 0,
      effects: { allocatedSeconds: 6, trimThresholdDbfs: -60, trailingPadSamples: 2400, leadingTrim: false },
      music: { scheduledLoops: 3, scheduledSteps: 192, cut: 'middle loop; each boundary rounded to the nearest 48 kHz sample', crossfade: false, fades: false },
      deterministicSumming: 'Original connections recorded in source order; sums with more than two inputs are routed through balanced unity-gain binary sums before the unchanged original destination node.',
      makeup: 'Render/trim/cut the original bank first; choose one gain from its greatest absolute float sample; apply equally to every file before PCM16 quantization. No per-file normalization, added compression or limiting.',
    },
    mix: {
      sourceRenderLevels: { sfxBus: 0.8, musicBus: 0.22, master: 0.9, reverbWet: 0.18 },
      graph: capturedGraph, gainsAndCompressorBakedIntoFiles: true,
      makeupGainDb: makeup.makeupGainDb, makeupGainLinear: makeup.linearGain,
      makeupReference: { loudestId: makeup.loudestId, sourcePeakDbfs: makeup.sourcePeakDbfs, targetPeakDbfs: TARGET_PEAK_DBFS, measuredBankPeakDbfs },
      runtimeBusLevels: RUNTIME_BUS_LEVELS,
      filePlaybackLevels: { sfx: RUNTIME_BUS_LEVELS.sfxBus, music: RUNTIME_BUS_LEVELS.musicBus, master: RUNTIME_BUS_LEVELS.master },
      adjustment: 'Every boosted file plays at unity (1.0), summed at unity, then the TV output soft limiter. Original SFX .8/music .22/master .9, compressor and makeup gain are baked into the files; do not apply them again at playback.',
      runtimeGainControls: { soundToggle: { on: 1, off: 0 }, musicToggle: { on: 1, off: 0 }, userVolume: 'Optional user volume if added; no other fixed runtime gain changes.' },
      outputSoftLimiter: { owner: 'TV renderer', appliedToAssets: false, measurementPoint: 'After runtime buses/master, before the soft limiter; its threshold/knee determine actual reduction.' },
      overlap: 'Each file retains the original isolated master-chain render, uniformly boosted. Runtime buses and the TV output soft limiter act on their sum; the nonlinear original response to simultaneous synth voices cannot be reconstructed from these files.',
      runtimeOverlap: overlap,
    },
    selection: {
      pop: 'Use n = 2,4,6,8 for hold quarters; 2 for fan; 4 for flying points; 0 is the required base variant.',
      beep: '0 for countdown; 1 for SNAG/GO.',
      mash: 'Use n % 13 for the requested finite catalog. Original noise center = 1400+n*30; above n=12 this reuse preserves pitch but not the continuing noise rise.',
      react: 'star/heart use reaction count % 10; flame/tomato cycle or randomly select v1..v3. All tomato WAVs are identical because the original tomato branch has no randomness.',
      mtick: 'Clamp p to [0,1], round p*8, then use the matching p=step/8 file.',
      drumroll: '2.3 s prompt reel; 1.4 s show vote result; 2.2 s finale podium.',
      riser: '1.2 s hunt urgency and standings.',
      crowd: 'Mash every 0.6 s: nearest v in [0.04,0.06,0.08,0.10,0.12] to 0.04+abs(push)*0.08. fanfare embeds crowd(2,0.18); do not layer that crowd file over fanfare. Default crowd is provided although there is no explicit default call in this revision.',
      boom: 'Cycle or randomly choose v1..v3 for fireworks.',
      voice: 'Cycle or randomly choose v01..v16 for host typing and brag bubbles.',
    },
    totals, files: entries,
  };
  await writeFile(join(audioDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const table = effectNames.map((effect) => {
    const sites = inspected.callSites[effect] ?? [];
    const renderedIds = entries.filter((entry) => entry.effect === effect);
    return `| ${effect} | ${renderedIds.length} | ${sites.length ? sites.map((site) => `L${site.line} \`${site.expression}\`${site.kind === 'embedded' ? ' (embedded)' : site.kind === 'callback' ? ' (callback)' : ''}`).join('<br>') : 'No call in this revision; required by the audio brief'} |`;
  });
  await writeFile(join(audioDir, 'README.md'), `# Snag & Brag audio files\n\nGenerated by [tools/render-audio](../../tools/render-audio/README.md) from the unchanged mockup audio block. ${totals.effects} SFX + ${totals.loops} four-bar music loops.\n\nRun \`pnpm --filter render-audio build\` from the repo root. \`pnpm --filter render-audio verify\` regenerates into a temporary directory and compares every audio, manifest, README and QA byte.\n\nThe WAVs are 48 kHz stereo PCM16. Ogg copies use Vorbis q5. Audio payload totals: **${totals.wavBytes} WAV bytes + ${totals.oggBytes} Ogg bytes = ${totals.totalAudioBytes} bytes (${(totals.totalAudioBytes / 1024 / 1024).toFixed(2)} MiB)**.\n\n## Uniform export gain and TV mix\n\nPer the lead's 2026-10-12 review, every effect and music file receives the same **+${makeup.makeupGainDb.toFixed(8)} dB** gain (${makeup.linearGain.toFixed(12)}×) after the original render/trim/cut and before PCM16 quantization. Loudest source: ${makeup.loudestId}, ${makeup.sourcePeakDbfs.toFixed(8)} dBFS; boosted bank peak: **${measuredBankPeakDbfs.toFixed(8)} dBFS**, targeting -3.0 dBFS. There is no per-file normalization, added compression or limiting. The gain is already baked into WAVs and their Ogg copies.\n\nThe unchanged source render uses SFX .8, music .22, master .9, reverb .18 wet, with the original -12 dB / 4:1 compressor; those source gains/compression remain baked in. Every boosted file plays at **unity gain (1.0)**, summed at unity then passed through the TV soft limiter. Original SFX/music/master levels, compressor and makeup are baked in and must not be applied again. The only runtime gain changes are Sound/Music on-off toggles (1.0/0.0) and optional user volume if added. \`mix.makeupGainDb\`, \`runtimeBusLevels\` and \`filePlaybackLevels\` specify that contract. Single-file compression cannot reconstruct the original compressor acting on overlapping synth voices.\n\nRequested overlap, all starting at sample 0: music-win, sfx-fanfare, sfx-ko and sfx-crowd-2-18, every file at unity (1.0). The signed PCM16 samples are summed in float64, with silence after each file ends, before the TV soft limiter. Peak is **${overlap.peakDbfs!.toFixed(8)} dBFS at unity before the soft limiter**, with ${overlap.samplesOverZeroDbfs} channel samples / ${overlap.framesOverZeroDbfs} stereo frames above 0 dBFS. Minimum attenuation to stay below full scale is ${overlap.minimumAttenuationToZeroDbfs.toFixed(8)} dB; the TV limiter's knee/threshold determine its actual reduction. [Overlap details](../../docs/review/audio/runtime-overlap.json) are also in \`mix.runtimeOverlap\`. The standalone crowd is intentionally included for this stress case although fanfare already embeds its own crowd.\n\nEvery file has parameters, seed, hashes (including its unboosted PCM16 source hash), source/exported peak, RMS, duration, ffmpeg ebur128 integrated loudness and call sites in [manifest.json](manifest.json). Loudness -70 LUFS on short effects is the meter's empty-gate floor. Four-bar sample boundaries and numeric seam evidence are under each music file's \`loop\`. Spectrograms and the waveform grid are in [docs/review/audio](../../docs/review/audio/README.md).\n\n## Call-site table\n\nLine numbers refer to [reference/src/game.js](../../reference/src/game.js), including callbacks and the shutter/crowd already embedded inside composite sounds. The JSON manifest repeats these sites per variant and supplies the selection rules.\n\n| Effect | Files | Mockup call sites |\n|---|---:|---|\n${table.join('\n')}\n`);
  const checks = {
    sourceVerbatim: true, allSfxDefinitionsCovered: true, allSfxCallSitesCovered: true,
    realtimeContextAttempts: 0, schedulerTimerAttempts: 0, clippedFiles: 0,
    vorbisFormatsAndExactSampleCounts: true, loopSeamsPassed: entries.filter((entry) => entry.loop?.seam.passed).length,
    uniformMakeupGainDb: makeup.makeupGainDb, singleFileTargetPeakDbfs: TARGET_PEAK_DBFS, measuredBankPeakDbfs,
    additionalAssetCompression: false, additionalAssetLimiting: false, runtimeOverlap: overlap,
    assets: entries.map((entry) => ({ id: entry.id, wavSha256: entry.wavSha256, oggSha256: entry.oggSha256, ...(entry.loop ? { seam: entry.loop.seam } : {}) })),
  };
  await writeFile(join(qaDir, 'checks.json'), `${JSON.stringify(checks, null, 2)}\n`);
  await writeFile(join(qaDir, 'README.md'), `# Audio review evidence\n\nGenerated with \`pnpm --filter render-audio build\`. [checks.json](checks.json) records coverage, safety, hashes, codec sample counts, the uniform gain/peak target and seam checks.\n\nEvery file uses +${makeup.makeupGainDb.toFixed(8)} dB makeup, with a measured bank peak of ${measuredBankPeakDbfs.toFixed(8)} dBFS (target -3.0). [runtime-overlap.json](runtime-overlap.json) measures the requested win/fanfare/ko/crowd sum with all files at unity (1.0), before the TV soft limiter: ${overlap.peakDbfs!.toFixed(8)} dBFS. No additional asset compression, limiting or per-file normalization occurs.\n\n[effect-waveforms.png](effect-waveforms.png) shows all 112 boosted effect files, with each thumbnail scaled to its labeled exported peak for visibility. The six \`music-*-3x.png\` spectrograms repeat each committed boosted PCM16 loop three times; pink ticks mark wraps without obscuring the spectrum. There are no crossfades or added fades. Each channel's wrap jump must be no larger than the largest normal adjacent-sample jump within 50 ms on either side. Manifest statistics and seam checks analyze the committed 16-bit samples, not the float source.\n\nVerify byte-for-byte regeneration with \`pnpm --filter render-audio verify\`. Run \`pnpm test\` and \`pnpm typecheck\` at the root. Tests validate every committed WAV/hash, every Ogg/hash, the shared gain, single-file peak, overlap and all loop lengths/boundaries/seams; no sound is played. Browser constructors reject realtime contexts, its wall-clock scheduler rejects intervals, Chrome starts with \`--mute-audio\`, and every browser request is restricted to localhost/data URLs.\n`);

  const outputs = await listFiles(staging);
  if(verify) {
    const existing = [...await listFiles(join(root, 'assets/audio'), 'assets/audio'), ...await listFiles(join(root, 'docs/review/audio'), 'docs/review/audio')].sort();
    if(JSON.stringify(outputs) !== JSON.stringify(existing)) throw new Error('Generated and committed output file sets differ.');
    const differences: string[] = [];
    for(const relative of outputs) {
      const next = await readFile(join(staging, relative)), previous = await readFile(join(root, relative));
      if (!next.equals(previous)) differences.push(relative);
    }
    if (differences.length) throw new Error(`Byte-identical regeneration failed (${differences.length} files):\n${differences.join('\n')}`);
    console.log(`Verified byte-identical regeneration: ${entries.length} WAVs, ${entries.length} Oggs, manifest, call-site table and all QA artifacts (${outputs.length} files).`);
  } else {
    for(const relative of outputs) { const destination = join(root, relative); await mkdir(dirname(destination), { recursive: true }); await copyFile(join(staging, relative), destination); }
    console.log(`Built ${entries.length} assets; ${totals.totalAudioBytes} audio bytes (${(totals.totalAudioBytes / 1024 / 1024).toFixed(2)} MiB).`);
  }
} finally {
  try {
    await browser?.close();
  } finally {
    try {
      if(server?.listening) await new Promise<void>((accept, reject) => server!.close((error) => error ? reject(error) : accept()));
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
}

async function listFiles(directory: string, prefix = ''): Promise<string[]> {
  const result: string[] = [];
  for(const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if(entry.isDirectory()) result.push(...await listFiles(join(directory, entry.name), relative));
    else result.push(relative);
  }
  return result.sort();
}
