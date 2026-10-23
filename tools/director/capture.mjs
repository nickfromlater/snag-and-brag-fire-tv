import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { beatNames, galleryFiles, homeFootage, json, outsideGit, probe, safePreview, sceneRanges, segmentsFor } from './lib.mjs';
import { openWeb, takeWebStill } from './web.mjs';
import { recordWeb } from './web-recorder.mjs';
import { recordVvd } from './vvd.mjs';
import { finishEdit } from './edit.mjs';
import { stillsFromMaster } from './stills.mjs';
import { validateMaskStill } from './validate.mjs';

export async function capture(options) {
  segmentsFor(1, options.segmentSeconds * 1000, options.overlapSeconds * 1000);
  if (!Number.isInteger(options.seed) || !Number.isInteger(options.fps) || options.fps < 1 || options.fps > 60) throw new Error('Seed must be an integer and frame rate must be 1–60');
  const output = await outsideGit(options.out), previewDir = options.previewDir ? resolve(options.previewDir) : undefined;
  let recording;
  let galleryChecks = [], snapshots = Promise.resolve(), snapshotError;
  const gallery = join(output, 'gallery'); await mkdir(gallery, { recursive: true });
  console.log(`Capture target ${options.target}; masters ${output}`);
  if (options.target === 'web') {
    const events = [], beats = {};
    const web = await openWeb({ seed: options.seed, speed: options.speed, onCue: e => {
      // This web target has no external inputs, cameras, photo bytes or relay keys.
      if (e.kind === 'scene' && events.length === 0) e.atMs = 0;
      events.push(e);
      if (e.kind === 'beat') {
        beats[e.name] = e.atMs; console.log(`Beat: ${e.name}`);
        if (options.speed === 1) snapshots = snapshots.then(async () => {
          galleryChecks.push(await takeWebStill(web.page, e.name, join(gallery, galleryFiles[beatNames.indexOf(e.name)])));
        }).catch(error => { snapshotError = error; });
      }
      if (e.kind === 'complete') web.completeAt = e.atMs;
    } });
    try {
      const result = await recordWeb(web, output, { ...options, onProgress: console.log });
      await snapshots; if (snapshotError) throw snapshotError;
      const scores = await web.page.evaluate(() => window.__SB.G().teams.map(t => ({ name: t.name, score: t.score })));
      const expected = [429, 307, 347, 135];
      if (scores.some((t, i) => t.score !== expected[i])) throw new Error('Web rehearsal diverged from the core script scoring');
      recording = { version: 1, target: 'web', syntheticOnly: true, seed: options.seed, rehearsalSpeed: options.speed, script: 'submission-v1', ...result, events, beats, galleryChecks, scenes: sceneRanges(events, result.durationMs), scores, browser: await web.browser.version(), audio: 'silent web rehearsal; no realtime AudioContext' };
    } finally { await web.close(); }
  } else if (options.target === 'vvd') recording = await recordVvd(output, options.bridge, { ...options, onProgress: console.log });
  else throw new Error('Target must be web or vvd');
  if (beatNames.some(n => !Number.isFinite(recording.beats[n]))) throw new Error('Capture is missing a gallery beat');
  console.log(`Editing ${recording.segments.length} overlapping segments into ${recording.scenes.length} scenes`);
  const finished = await finishEdit(output, recording, { previewDir });
  await stillsFromMaster(finished, gallery, { keepExisting: options.speed === 1 && options.target === 'web' });
  const maskCheck = finished.galleryChecks?.find(c => c.name === 'pixel-judge-mask');
  if (maskCheck) finished.maskVerification = await validateMaskStill(join(gallery, '03-pixel-judge-mask.png'), maskCheck.maskBox, finished.seed);
  if (previewDir) {
    const previewGallery = join(previewDir, 'gallery'); await mkdir(previewGallery, { recursive: true });
    for (const name of [...galleryFiles, '07-devpost-thumbnail.png']) { const file = join(gallery, name); await safePreview(file); await copyFile(file, join(previewGallery, name)); }
    const receipt = {
      version: 1, target: finished.target, syntheticOnly: true, seed: finished.seed, script: finished.script, rehearsalSpeed: finished.rehearsalSpeed ?? 1,
      durationMs: finished.durationMs, fps: finished.fps, segmentCount: finished.segments.length, overlapSeconds: options.overlapSeconds,
      segments: finished.segments.map(s => ({ startMs: s.startMs, endMs: s.endMs, file: s.file.split('/').at(-1) })),
      scenes: finished.scenes.map(({ file, ...scene }) => ({ ...scene, file: file.split('/').at(-1) })), beats: finished.beats, scores: finished.scores,
      masterProbe: finished.masterProbe, previewProbe: finished.previewProbe, previewBytes: (await stat(finished.preview)).size,
      gallery: await Promise.all([...galleryFiles, '07-devpost-thumbnail.png'].map(async name => ({ file: name, ...(await probe(join(previewGallery, name))).streams[0], bytes: (await stat(join(previewGallery, name))).size }))),
      browser: finished.browser, audio: finished.audio,
      galleryChecks: finished.galleryChecks ?? [],
      maskVerification: finished.maskVerification,
    };
    await writeFile(join(previewDir, 'dry-run.json'), json(receipt));
    await writeFile(join(previewDir, 'cue-log.json'), json({ version: 1, events: finished.events }));
  }
  const manifest = join(output, 'capture.json');
  await writeFile(manifest, json(finished));
  console.log(`Verified H.264 master, per-scene clips, six stills and thumbnail. Manifest: ${manifest}`);
  return { ...finished, manifest };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ args: process.argv.slice(2).filter(a => a !== '--'), options: {
    target: { type: 'string', default: 'web' }, out: { type: 'string' }, 'preview-dir': { type: 'string', default: join(import.meta.dirname, 'previews') },
    seed: { type: 'string', default: '20261022' }, speed: { type: 'string', default: '1' }, 'segment-seconds': { type: 'string', default: '170' },
    'overlap-seconds': { type: 'string', default: '2' }, fps: { type: 'string', default: '30' }, 'bit-rate': { type: 'string', default: '8000000' },
    bridge: { type: 'string', default: 'http://127.0.0.1:8790' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) console.log('Usage: node tools/director/capture.mjs --target web|vvd [--out ~/builds/snag-and-brag/footage/take] [--seed 20261022] [--segment-seconds 170 --overlap-seconds 2] [--speed 1|2|4] [--bridge http://127.0.0.1:8790]');
  else {
    const controller = new AbortController();
    const stop = () => controller.abort(new Error('Capture interrupted; recorder stopped and owned lock released'));
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try {
      await capture({ target: values.target, out: values.out ?? join(homeFootage, `${values.target}-${new Date().toISOString().replaceAll(':', '-')}`), previewDir: values['preview-dir'],
        seed: Number(values.seed), speed: Number(values.speed), segmentSeconds: Number(values['segment-seconds']), overlapSeconds: Number(values['overlap-seconds']), fps: Number(values.fps), bitRate: Number(values['bit-rate']), bridge: values.bridge, signal: controller.signal });
    } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
  }
}
