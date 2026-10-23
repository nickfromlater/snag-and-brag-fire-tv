import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readManifest, fixturePath } from './manifest.js';
import { validateFixtures } from './validate.js';
import { reviewDir, rootDir } from './paths.js';
import { percentile } from './statistics.js';
import { evaluatePixels, type PixelResult } from './evaluate-pixels.js';
import { redactionImpact } from './redaction-impact.js';
import { faceRuntime } from './face-runtime.js';

const gitText = (args: string[]) => execFileSync('git', args, { cwd: rootDir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
interface FaceResult {
  id: string; kind: string; expected: number; detected: number; matched: number; missed: number;
  rawBoxes: number[][]; expandedBoxes: number[][]; faceCoverage: number[];
  redaction: string; pipelineMs: number; decodeMs: number; attempts: number; changedPixels: number;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter(a => a !== '--');
  if (args.length && (args.length !== 2 || args[0] !== '--ref' || !/^[A-Za-z0-9_./-]+$/.test(args[1]!) || args[1]!.startsWith('-'))) throw new Error('Use faces -- --ref <git-ref>');
  const revision = gitText(['rev-parse', '--verify', '--end-of-options', `${args[1] ?? 'HEAD'}^{commit}`]).trim();
  const paths = gitText(['ls-tree', '-r', '--name-only', revision, 'phone/src']).trim().split('\n');
  const manifest = await readManifest(), faces = manifest.photos.filter(p => p.kind === 'face');
  await mkdir(reviewDir, { recursive: true });
  if (args[1] ? !paths.includes('phone/src/faceBlur.ts') : !await readFile(resolve(rootDir, 'phone/src/faceBlur.ts')).then(() => true, () => false)) {
    const stub = { checked: new Date().toISOString(), revision, status: 'stub-not-landed', facePhotos: faces.length, detectionRate: null, misses: null, timePerImageMs: null };
    await writeFile(resolve(reviewDir, 'face-blur.json'), JSON.stringify(stub, null, 2) + '\n');
    await writeFile(resolve(reviewDir, 'face-blur.md'), `# Face-blur benchmark\n\nPipeline absent at \`${revision}\`; ${faces.length} licensed fixtures ready. Detection and timing are unmeasured. Conditional stub authorized by the eval brief. Re-run \`pnpm --filter eval faces\` after the merge.\n`);
    process.stdout.write('stub-not-landed; no face detection or timing claims.\n'); return;
  }
  await validateFixtures();
  const runtime = await faceRuntime(args[1]), { page, browser } = runtime;
  const records: FaceResult[] = [], pixelResults: PixelResult[] = [], previews = new Map<string, Buffer>();
  const compareAvailable = await readFile(resolve(reviewDir, 'pixel-judge.json')).then(() => true, () => false);
  try {
    const warm = await page.evaluate(async () => {
      const path = '/faceBlur.js', module = await import(path), start = performance.now();
      const detector = await module.faceRedactor.warm(), warmMs = performance.now() - start;
      if (!detector) throw new Error('Real MediaPipe detector unavailable');
      const original = detector.detect.bind(detector);
      const state = { module, calls: [] as { size: number; boxes: { x: number; y: number; width: number; height: number }[] }[] };
      // Observed results still pass through the actual redactor/retry/pixelation.
      detector.detect = (canvas: HTMLCanvasElement) => {
        const boxes = original(canvas); state.calls.push({ size: canvas.width, boxes: boxes.map((box: object) => ({ ...box })) }); return boxes;
      };
      (window as unknown as { evalFaces: typeof state }).evalFaces = state;
      return { warmMs, nativeShapeDetector: 'FaceDetector' in window, settings: module.FACE_REDACTION ?? null, padding: module.FACE_PADDING ?? { sides: .25, top: .25, bottom: .25 } };
    });
    for (const photo of [...faces, ...manifest.photos.filter(p => p.kind === 'object')]) {
      const jpeg = await readFile(fixturePath(photo));
      const result = await page.evaluate(async ({ encoded, expectedBoxes, forJudge }) => {
        type Box = { x: number; y: number; width: number; height: number };
        const state = (window as unknown as { evalFaces: { module: { FACE_REDACTION?: { confidence: number; retryConfidence: number }; selectFaceBoxes?(boxes: Box[], width: number, height: number, confidence: number, settings: unknown): Box[]; faceRedactor: { redact(canvas: HTMLCanvasElement): Promise<string> }; expandFaceBox(box: Box, width: number, height: number): Box | null }; calls: { size: number; boxes: Box[] }[] } }).evalFaces;
        const startDecode = performance.now(), image = new Image(); image.src = `data:image/jpeg;base64,${encoded}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 720;
        const context = canvas.getContext('2d', { willReadFrequently: true })!; context.drawImage(image, 0, 0, 720, 720); image.src = '';
        const before = context.getImageData(0, 0, 720, 720).data, decodeMs = performance.now() - startDecode;
        state.calls = []; const start = performance.now(), redaction = await state.module.faceRedactor.redact(canvas), pipelineMs = performance.now() - start;
        const calls = state.calls, raw = calls.find(c => c.size === 720)?.boxes ?? [];
        const settings = state.module.FACE_REDACTION;
        const filter = (boxes: Box[], threshold: number) => settings ? state.module.selectFaceBoxes!(boxes, 720, 720, threshold, settings) : boxes;
        const primary = filter(raw, settings?.confidence ?? .5);
        const retry = (calls.find(c => c.size === 360)?.boxes ?? []).map(b => ({ ...b, x: (b.x - 90) * 4, y: (b.y - 90) * 4, width: b.width * 4, height: b.height * 4 }));
        const selected = primary.length ? primary : filter(retry, settings?.retryConfidence ?? .5);
        const expanded = selected.map(b => state.module.expandFaceBox(b, 720, 720)).filter((b): b is Box => b !== null);
        const intersection = (a: number[], b: number[]) => Math.max(0, Math.min(a[0]! + a[2]!, b[0]! + b[2]!) - Math.max(a[0]!, b[0]!)) * Math.max(0, Math.min(a[1]! + a[3]!, b[1]! + b[3]!) - Math.max(a[1]!, b[1]!));
        const boxes = selected.map(b => [b.x, b.y, b.width, b.height]), expandedBoxes = expanded.map(b => [b.x, b.y, b.width, b.height]);
        const matched = expectedBoxes.filter(e => boxes.some(b => { const area = intersection(e, b); return area / (e[2]! * e[3]! + b[2]! * b[3]! - area) >= 0.2; })).length;
        const faceCoverage = expectedBoxes.map(e => Math.max(0, ...expandedBoxes.map(b => intersection(e, b) / (e[2]! * e[3]!))));
        const after = context.getImageData(0, 0, 720, 720).data; let changedPixels = 0;
        for (let i = 0; i < after.length; i += 4) if (after[i] !== before[i] || after[i + 1] !== before[i + 1] || after[i + 2] !== before[i + 2]) changedPixels++;
        // Only public no-person object fixtures supply comparison pixels and
        // in-memory previews. Face pixels never leave this evaluate callback.
        let judgeRgba: string | undefined, preview: string | undefined;
        if (forJudge) {
          const judge = document.createElement('canvas'); judge.width = judge.height = 480;
          const judgeContext = judge.getContext('2d', { willReadFrequently: true })!;
          judgeContext.drawImage(canvas, 0, 0, 480, 480);
          const pixels = judgeContext.getImageData(0, 0, 480, 480).data;
          let binary = '';
          for (let i = 0; i < pixels.length; i += 16384) binary += String.fromCharCode(...pixels.subarray(i, i + 16384));
          judgeRgba = btoa(binary); pixels.fill(0); judge.width = judge.height = 0;
          preview = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]!;
        }
        before.fill(0); after.fill(0); canvas.width = canvas.height = 0;
        return { detected: boxes.length, matched, rawBoxes: boxes, expandedBoxes, faceCoverage, redaction, pipelineMs, decodeMs, attempts: calls.length, changedPixels, judgeRgba, preview };
      }, { encoded: jpeg.toString('base64'), expectedBoxes: photo.faceBoxes ?? [], forJudge: compareAvailable && photo.kind === 'object' });
      jpeg.fill(0); const expected = photo.expectedFaces ?? 0;
      const { judgeRgba, preview, ...metrics } = result;
      if (judgeRgba && preview) {
        const pixels = new Uint8ClampedArray(Buffer.from(judgeRgba, 'base64'));
        pixelResults.push(evaluatePixels(photo.id, pixels)); pixels.fill(0);
        previews.set(photo.id, Buffer.from(preview, 'base64'));
      }
      records.push({ id: photo.id, kind: photo.kind, expected, missed: expected - result.matched, ...metrics });
    }
    const faceRecords = records.filter(r => r.kind === 'face'), controls = records.filter(r => r.kind === 'object');
    const detectedImages = faceRecords.filter(r => r.matched > 0).length;
    const expectedFaces = faceRecords.reduce((sum, r) => sum + r.expected, 0), matchedFaces = faceRecords.reduce((sum, r) => sum + r.matched, 0);
    const times = faceRecords.map(r => r.pipelineMs), timings = { firstInferenceMs: times[0], p50: percentile(times, 0.5), p95: percentile(times, 0.95), max: Math.max(...times) };
    const falsePositiveImages = controls.filter(r => r.detected > 0).map(r => r.id);
    const partialCoverage = faceRecords.filter(r => r.faceCoverage.some(v => v < 0.9)).map(r => r.id);
    const report = { checked: new Date().toISOString(), revision, source: runtime.sourceLabel, sourceSha256: runtime.sourceSha256, status: 'measured', browser: await browser.version(), mediaPipe: runtime.sdk, warm, timings, detectedImages, faceImages: faces.length, expectedFaces, matchedFaces, misses: faceRecords.filter(r => r.missed > 0).map(r => r.id), falsePositiveImages, controlImages: controls.length, foreignRequests: runtime.network.foreignRequests, browserErrors: runtime.errors, records };
    await writeFile(resolve(reviewDir, 'face-blur.json'), JSON.stringify(report, null, 2) + '\n');
    const md = [
      '# Face-blur real-photo check', '', `Measured ${report.checked}; exact phone pipeline from ${runtime.sourceLabel}; parent revision \`${revision}\` (SHA-256 \`${report.sourceSha256}\`), MediaPipe ${runtime.sdk}, ${report.browser}.`, '',
      `**${detectedImages}/${faces.length} face images detected (${(detectedImages / faces.length * 100).toFixed(1)}%); ${matchedFaces}/${expectedFaces} expected faces matched.** Missed fixtures: ${report.misses.join(', ') || 'none'}.`, '',
      `Settings: ${JSON.stringify(warm.settings)}; padding: ${JSON.stringify(warm.padding)}.`, '',
      `Coverage follow-up: ${partialCoverage.length ? partialCoverage.join(', ') + ' has less than 90% expanded-box coverage of the manually annotated face, despite a matched detection; review the forehead margin.' : 'all matched faces have at least 90% expanded-box coverage of the coarse annotations.'} Detection rate alone does not establish complete face redaction.`, '',
      `Cold detector/model initialization: **${warm.warmMs.toFixed(1)} ms**. First inference: **${times[0]!.toFixed(1)} ms**. Face redaction p50/p95/max: **${timings.p50.toFixed(1)}/${timings.p95.toFixed(1)}/${timings.max.toFixed(1)} ms**, including retry/pixelation and excluding JPEG decode (listed separately). Desktop CPU/headless Chrome timings are not phone performance measurements.`, '',
      'The real `FaceRedactor.redact` ran on each 720×720 fixture canvas, using its actual loader, CPU BlazeFace detector, padded retry and pixelation. Detector calls were observed in memory to collect boxes; the selected phone source ran unchanged. Matching uses one manually annotated face box per fixture with IoU ≥0.2 (coarse box matching, not identification). “Coverage” is maximum expanded-redaction-box coverage of the manually annotated face box; approximate annotations do not prove de-identification. Original and redacted working pixels are cleared; no redaction images or player photos are saved.', '',
      `Offline object controls: **${falsePositiveImages.length}/${controls.length}** triggered a face box (${falsePositiveImages.join(', ') || 'none'}). Drawn/sculpted/toy faces can trigger the detector; these counts flag its effect on game objects. The isolated Pixel Judge benchmark uses the original fixtures; the [phone redaction impact report](pixel-redaction-impact.md) and its contact sheet measure the same objects after this exact redactor.`, '',
      `Foreign network requests: ${runtime.network.foreignRequests}; browser errors: ${runtime.errors.length}; native ShapeDetector available: ${warm.nativeShapeDetector}. JS/model/WASM were served from an ephemeral loopback server, with foreign requests blocked.`, '',
      '| Fixture | Expected / detected / matched | Method | Attempts | Redaction ms | Decode ms | Face box coverage | Changed pixels |', '|---|---|---|---:|---:|---:|---|---:|',
      ...faceRecords.map(r => `| ${r.id} | ${r.expected}/${r.detected}/${r.matched} | ${r.redaction} | ${r.attempts} | ${r.pipelineMs.toFixed(2)} | ${r.decodeMs.toFixed(2)} | ${r.faceCoverage.map(v => (v * 100).toFixed(1) + '%').join(', ')} | ${r.changedPixels} |`), '',
      '[Per-image timings, detector boxes and object controls](face-blur.json). Input fixtures and expected boxes: [manifest](../../../tools/eval/photos/manifest.json).', '',
      'Run `pnpm --filter eval faces` (defaults to the current working tree), or `pnpm --filter eval faces -- --ref <commit>`. The command compiles the selected phone source and assets in memory and requires the same MediaPipe package version as the phone snapshot. No phone files are changed by this command. It writes an unmeasured stub only when the selected snapshot has no face-blur module.', '',
    ];
    await writeFile(resolve(reviewDir, 'face-blur.md'), md.join('\n'));
    if (compareAvailable) await redactionImpact(manifest.photos.filter(p => p.kind === 'object'), pixelResults, previews, `${runtime.sourceLabel}; source SHA-256 ${runtime.sourceSha256}`);
    else process.stdout.write('Run judge first, then faces, to generate the post-redaction Pixel Judge comparison.\n');
    for (const preview of previews.values()) preview.fill(0);
    process.stdout.write(`Face detections ${detectedImages}/${faces.length}; misses ${report.misses.join(', ') || 'none'}; p50/p95/max ${timings.p50.toFixed(1)}/${timings.p95.toFixed(1)}/${timings.max.toFixed(1)} ms; object detections ${falsePositiveImages.length}/${controls.length}.\n`);
    if (runtime.network.foreignRequests || runtime.errors.length || records.some(r => r.redaction === 'none')) process.exitCode = 1;
  } finally { for (const preview of previews.values()) preview.fill(0); await runtime.close(); }
}

main().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1; });
