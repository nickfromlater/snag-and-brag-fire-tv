import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { faceRuntime } from './face-runtime.js';
import { readManifest, fixturePath } from './manifest.js';
import { validateFixtures } from './validate.js';
import { reviewDir } from './paths.js';
import { facePaddingFigure } from './face-padding-figure.js';

// Fixtures with a visible toy/sculpted face. They still count in the total FP column.
const FACE_LIKE = ['island-teddy', 'extra-white-teddy', 'weird-satyr-mug', 'extra-blue-robot'];
const CONFIDENCES = [.5, .6, .7, .8];
const SIZES = [0, .05, .10, .12, .14];
const ASPECTS = [[0, 100], [.5, 2], [.67, 1.5], [.8, 1.25]];
const AREAS = [0, .005, .01, .015, .02];
interface Box { x: number; y: number; width: number; height: number; confidence?: number }
interface Candidates { id: string; threshold: number; primary: Box[]; retry: Box[]; primaryMs: number; retryMs: number }

async function main() {
  await validateFixtures(); await mkdir(reviewDir, { recursive: true });
  const manifest = await readManifest(), runtime = await faceRuntime(), candidates: Candidates[] = [];
  try {
    await runtime.page.evaluate(async () => {
      const path = '/faceBlur.js', module = await import(path);
      (window as unknown as { sweep: unknown }).sweep = { module, detector: null };
    });
    for (const threshold of CONFIDENCES) {
      await runtime.page.evaluate(async confidence => {
        const state = (window as unknown as { sweep: { module: any; detector: any } }).sweep;
        state.detector?.close();
        state.detector = await state.module.loadMediaPipe({ ...state.module.FACE_REDACTION, confidence, retry: false });
      }, threshold);
      for (const photo of manifest.photos) {
        const bytes = await readFile(fixturePath(photo));
        const result = await runtime.page.evaluate(async encoded => {
          const state = (window as unknown as { sweep: { module: any; detector: any } }).sweep;
          const image = new Image(); image.src = `data:image/jpeg;base64,${encoded}`; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 720;
          canvas.getContext('2d')!.drawImage(image, 0, 0, 720, 720); image.src = '';
          try {
            const start = performance.now(), primary = state.detector.detect(canvas), primaryMs = performance.now() - start;
            const retryStart = performance.now(), retry = state.module.retryFaceBoxes(canvas, state.detector), retryMs = performance.now() - retryStart;
            return { primary, retry, primaryMs, retryMs };
          } finally { canvas.width = canvas.height = 0; }
        }, bytes.toString('base64'));
        bytes.fill(0); candidates.push({ id: photo.id, threshold, ...result });
      }
      process.stdout.write(`Collected primary/retry candidates at confidence ${threshold}.\n`);
    }
    const analysis = await runtime.page.evaluate(({ candidates, photos, sizes, aspects, areas, confidences, faceLike }) => {
      const { module } = (window as unknown as { sweep: { module: any } }).sweep;
      const intersection = (a: number[], b: number[]) => Math.max(0, Math.min(a[0]! + a[2]!, b[0]! + b[2]!) - Math.max(a[0]!, b[0]!)) * Math.max(0, Math.min(a[1]! + a[3]!, b[1]! + b[3]!) - Math.max(a[1]!, b[1]!));
      const tuple = (b: Box) => [b.x, b.y, b.width, b.height];
      const byKey = new Map(candidates.map(c => [`${c.id}:${c.threshold}`, c]));
      const rows = [];
      for (const confidence of confidences) for (const retryThreshold of [null, ...confidences]) for (const minRelativeSize of sizes) for (const [minAspectRatio, maxAspectRatio] of aspects) for (const minArea of areas) {
        const settings = { confidence, retry: retryThreshold !== null, retryConfidence: retryThreshold ?? confidence, minRelativeSize, minAspectRatio, maxAspectRatio, minArea };
        // Each actual SDK threshold was inferred separately; replay only the
        // phone's exported selection function, after mapping retry to 720px.
        const misses: string[] = [], falsePositives: string[] = [];
        let faces = 0, retries = 0;
        for (const photo of photos) {
          let selected: Box[] = module.selectFaceBoxes(byKey.get(`${photo.id}:${confidence}`)!.primary, 720, 720, confidence, settings);
          if (!selected.length && settings.retry) {
            retries++;
            selected = module.selectFaceBoxes(byKey.get(`${photo.id}:${retryThreshold}`)!.retry, 720, 720, retryThreshold, settings);
          }
          if (photo.kind === 'face') {
            const matches = (photo.faceBoxes ?? []).every(expected => selected.some(box => {
              const b = tuple(box), shared = intersection(expected, b);
              return shared / (expected[2]! * expected[3]! + b[2]! * b[3]! - shared) >= .2;
            }));
            if (matches) faces++; else misses.push(photo.id);
          } else if (selected.length) falsePositives.push(photo.id);
        }
        const acceptable = falsePositives.filter(id => faceLike.includes(id));
        rows.push({ settings, faces, objectFalsePositives: falsePositives.length, faceLikeFalsePositives: acceptable.length, otherFalsePositives: falsePositives.length - acceptable.length, misses, falsePositives, retries });
      }
      // SDK threshold changes can alter weighted NMS geometry. Record these
      // differences; never approximate an SDK threshold by filtering scores.
      const thresholdDifferences: string[] = [];
      for (const photo of photos) for (const threshold of confidences.slice(1)) for (const pass of ['primary', 'retry'] as const) {
        const fromLow = byKey.get(`${photo.id}:0.5`)![pass].filter(b => b.confidence! >= threshold);
        const actual = byKey.get(`${photo.id}:${threshold}`)![pass];
        if (JSON.stringify(fromLow) !== JSON.stringify(actual)) thresholdDifferences.push(`${photo.id}:${threshold}:${pass}`);
      }
      const coverage = photos.filter(p => p.kind === 'face').map(photo => {
        const raw: Box[] = module.selectFaceBoxes(byKey.get(`${photo.id}:${module.FACE_REDACTION.confidence}`)!.primary, 720, 720, module.FACE_REDACTION.confidence, module.FACE_REDACTION);
        return { id: photo.id, expected: photo.faceBoxes, padding: [.25, .4, .45, .5].map(top => {
          const padding = { sides: .25, top, bottom: .25 };
          const expanded = raw.map(b => module.expandFaceBox(b, 720, 720, padding)).filter(Boolean);
          const fractions = (photo.faceBoxes ?? []).map(e => Math.max(0, ...expanded.map((b: Box) => intersection(e, tuple(b)) / (e[2]! * e[3]!))));
          return { ...padding, coverage: fractions, expandedBoxes: expanded };
        }) };
      });
      const chosen = rows.find(row => Object.entries(module.FACE_REDACTION).every(([key, value]) => row.settings[key as keyof typeof row.settings] === value));
      if (!chosen) throw new Error('Production settings must be an explicit row in the sweep');
      return { rows, thresholdDifferences, coverage, recommendation: { ...chosen, padding: module.FACE_PADDING } };
    }, { candidates, photos: manifest.photos.map(p => ({ id: p.id, kind: p.kind, faceBoxes: p.faceBoxes })), sizes: SIZES, aspects: ASPECTS, areas: AREAS, confidences: CONFIDENCES, faceLike: FACE_LIKE });
    const report = { checked: new Date().toISOString(), source: runtime.sourceLabel, sourceSha256: runtime.sourceSha256, sdk: runtime.sdk, browser: await runtime.browser.version(), faceLike: FACE_LIKE, grid: { confidences: CONFIDENCES, retry: [false, ...CONFIDENCES], sizes: SIZES, aspects: ASPECTS, areas: AREAS }, foreignRequests: runtime.network.foreignRequests, browserErrors: runtime.errors, candidates, ...analysis };
    await writeFile(resolve(reviewDir, 'face-redaction-sweep.json'), JSON.stringify(report, null, 2) + '\n');
    await writeFile(resolve(reviewDir, 'face-padding-coverage.svg'), facePaddingFigure(analysis.coverage.find(face => face.id === 'face-melvin')!));
    const best = analysis.rows.filter(r => r.faces === 12).sort((a,b) => a.objectFalsePositives-b.objectFalsePositives || Number(a.settings.retry)-Number(b.settings.retry) || a.settings.confidence-b.settings.confidence || a.settings.minRelativeSize-b.settings.minRelativeSize || a.settings.minArea-b.settings.minArea);
    const row = (r: typeof analysis.rows[number]) => `| ${r.settings.confidence} | ${r.settings.retry ? r.settings.retryConfidence : 'off'} | ${r.settings.minRelativeSize} | ${r.settings.minAspectRatio}–${r.settings.maxAspectRatio} | ${r.settings.minArea} | ${r.faces}/12 | ${r.objectFalsePositives}/64 | ${r.faceLikeFalsePositives} | ${r.misses.join(', ') || '—'} |`;
    const table = ['| Confidence | Retry confidence | Min side/frame | Aspect w/h | Min area/frame | Faces | Object FP | Toy/mug FP | Misses |', '|---:|---:|---:|---|---:|---:|---:|---:|---|'];
    const baseline = analysis.rows.filter(r => r.settings.minRelativeSize === 0 && r.settings.minAspectRatio === 0 && r.settings.minArea === 0);
    const filterEffects = analysis.rows.filter(r => r.settings.confidence === .5 && r.settings.retry && r.settings.retryConfidence === .5 && [r.settings.minRelativeSize !== 0, r.settings.minAspectRatio !== 0, r.settings.minArea !== 0].filter(Boolean).length === 1);
    const chosen = analysis.recommendation;
    const md = ['# Offline face-redaction settings sweep', '', `${analysis.rows.length} settings on the same 12 annotated face JPEGs and 64 object JPEGs. Source: ${runtime.sourceLabel}, SHA-256 ${runtime.sourceSha256}. MediaPipe ${runtime.sdk}, ${report.browser}.`, '',
      `**Recommended and implemented: confidence ${chosen.settings.confidence}; padded retry ${chosen.settings.retry ? 'on' : 'off'} (its threshold is ${chosen.settings.retryConfidence}); minimum relative side ${chosen.settings.minRelativeSize * 100}%; aspect ratio ${chosen.settings.minAspectRatio}–${chosen.settings.maxAspectRatio}; minimum visible box area ${chosen.settings.minArea * 100}% of frame. ${chosen.faces}/12 faces, ${chosen.objectFalsePositives}/64 object false positives.** Padding: 25% sides/bottom, 45% top.`, '',
      'The original setting was SDK confidence 0.5, retry on at 0.5, and no size/aspect/area limits: 12/12 faces and 11/64 object detections. Threshold 0.7 alone, with retry off, reaches the minimum possible false-positive count (zero). Threshold 0.8 ties; 0.7 leaves more confidence margin. Loose sanity guards tie the unfiltered setting; stronger guards are unnecessary and can miss Melvin (14% minimum side or 2% minimum area). The retry adds no face recall in this corpus; retry at 0.5 reintroduces four object detections at primary 0.7. Toy/drawn-face false positives are acceptable for the review but still undesirable, and remain included in the total. This is a choice for this frozen corpus, rather than an estimate of recall on untested photos.', '',
      'The real CPU BlazeFace loader and padded retry ran separately at SDK thresholds 0.5, 0.6, 0.7 and 0.8. Candidate boxes (including confidence) are numeric receipts. Each table row replays the phone’s exported selection function on those exact candidates; retry runs only when the filtered first pass is empty. Both relative side lengths and visible unpadded area are measured against the original 720×720 frame; aspect ratio uses raw width/height. A face counts only when its annotated box matches at IoU ≥0.2. Toy/sculpted faces are included in total object false positives.', '',
      `Actual SDK threshold outputs differ from filtering 0.5 detections in ${analysis.thresholdDifferences.length} image/pass/threshold combinations (weighted NMS changes box geometry). Consequently all four SDK thresholds were inferred separately; if retry is enabled with a different threshold, the phone loads an independent detector at that exact threshold. Foreign requests: ${report.foreignRequests}; browser errors: ${report.browserErrors.length}. No paid calls or new assets; temporary pixels are cleared and only numeric detections are saved.`, '',
      '## Confidence and retry, without size/aspect/area filters', '', ...table, ...baseline.map(row), '',
      '## Isolated sanity-filter changes at the original 0.5 / retry 0.5', '', ...table, ...filterEffects.map(row), '',
      '## Implemented choice', '', ...table, row(chosen), '',
      '## Lowest-FP settings retaining all faces', '', ...table, ...best.slice(0,20).map(row), '',
      '## Forehead coverage (25% sides and bottom)', '', `Coverage uses the selected ${chosen.settings.confidence} SDK detections against the fixed manually annotated boxes. Melvin’s annotation spans y=160–323; 25% top padding starts at y=180 (87.7% coverage), 40% starts at y=165 (96.9%), and 45% starts at y=160 (100%). The chosen expanded box is x=231, y=160, width=149, height=169; it covers the annotated x=236, y=160, width=134, height=163. All 12 selected faces have 100% annotated-box coverage with 45% top padding. This geometric coverage is approximate and does not measure identifiability.`, '',
      '![Melvin padding and annotated face coverage](face-padding-coverage.svg)', '',
      '[Public-domain Melvin source fixture](../../../tools/eval/photos/faces/face-melvin.jpg). [Original production baseline](face-blur-baseline.md).', '',
      '| Face | Top 25% | Top 40% | Top 45% | Top 50% |', '|---|---:|---:|---:|---:|',
      ...analysis.coverage.map(c => `| ${c.id} | ${c.padding.map(p => `${(100 * p.coverage[0]!).toFixed(1)}%`).join(' | ')} |`), '',
      '## Every swept setting', '', ...table, ...analysis.rows.map(row), '',
      '[All candidates, per-setting misses and false-positive IDs, coverage boxes](face-redaction-sweep.json). Reproduce: `pnpm --filter eval sweep-faces`. Then `pnpm --filter eval faces` confirms the chosen production settings with actual redaction/pixelation.', ''];
    await writeFile(resolve(reviewDir, 'face-redaction-sweep.md'), md.join('\n'));
    process.stdout.write(`Swept ${analysis.rows.length} settings; chosen ${chosen.faces}/12 faces, ${chosen.objectFalsePositives}/64 objects; ${analysis.thresholdDifferences.length} SDK threshold geometry differences measured.\n`);
    if (runtime.errors.length || runtime.network.foreignRequests || chosen.faces !== 12 || chosen.objectFalsePositives !== best[0]?.objectFalsePositives) process.exitCode = 1;
  } finally { await runtime.close(); }
}
main().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1; });
