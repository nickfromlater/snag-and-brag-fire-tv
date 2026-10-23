// In-memory synthetic shapes only. Receipts contain counts/timings, never image pixels.
// Run with the phone Vite dev server: node phone/dev/face-blur.mjs [http://localhost:5173]
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const origin = process.argv[2] ?? 'http://127.0.0.1:5173';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--mute-audio'] });
const timeout = setTimeout(() => { void browser.close(); }, 60000);
const checks = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  let browserErrors = 0, foreignRequests = 0, detectorRequests = 0;
  page.on('pageerror', () => browserErrors++);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== new URL(origin).origin) foreignRequests++;
    if (url.pathname.includes('face-detector/') || url.pathname.includes('tasks-vision')) detectorRequests++;
  });
  await page.goto(`${origin}/?fixture=join`);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(detectorRequests, 0, 'joining must not load the detector');
  const ready = await page.evaluate(async () => {
    const { fixture } = await import('/dev/fixtures.ts');
    const start = performance.now(), lobby = fixture('lobby', Date.now()); lobby.seq = 2;
    window.__phoneReview.inject(lobby);
    const lobbyMs = performance.now() - start;
    const { faceRedactor } = await import('/src/faceBlur.ts');
    const detector = await faceRedactor.warm();
    return { lobbyMs, loadedMs: performance.now() - start, available: !!detector };
  });
  assert(ready.available, 'real MediaPipe runtime must initialize');
  assert(ready.lobbyMs < 100, 'lobby render must not await inference assets');
  console.log('PASS lazy join and real detector initialization');
  checks.push({ check: 'join stays lazy; lobby renders immediately and warms one self-hosted detector', ...ready });

  const synthetic = await page.evaluate(async (sharedUrl) => {
    const { faceRedactor, pixelateFaces, expandFaceBox, mosaicLayout } = await import('/src/faceBlur.ts');
    const { snagImage, snagFile, jpeg, drawPrivateThumbnail, CameraFeed } = await import('/src/camera.ts');
    const { judgePhoto, JUDGE_SIZE } = await import(sharedUrl);
    const source = document.createElement('canvas'); source.width = source.height = 720;
    const ctx = source.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#2B3BFF'; ctx.fillRect(0, 0, 720, 720);
    const skin = ctx.createRadialGradient(330, 300, 20, 360, 360, 240);
    skin.addColorStop(0, '#FFE4C4'); skin.addColorStop(1, '#C98756');
    ctx.fillStyle = '#35271E'; ctx.beginPath(); ctx.ellipse(360, 320, 158, 200, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(360, 365, 140, 180, 0, 0, Math.PI * 2); ctx.fill();
    for (let y = 240; y < 490; y += 12) for (let x = 260; x < 460; x += 12) {
      ctx.fillStyle = (x + y) % 24 ? 'rgba(242,59,46,.65)' : 'rgba(255,212,59,.65)'; ctx.fillRect(x, y, 6, 6);
    }
    ctx.lineWidth = 10; ctx.strokeStyle = '#35271E';
    for (const x of [302, 406]) {
      ctx.beginPath(); ctx.moveTo(x - 25, 293); ctx.quadraticCurveTo(x, 282, x + 25, 293); ctx.stroke();
      ctx.fillStyle = '#FFF8EC'; ctx.beginPath(); ctx.ellipse(x, 321, 26, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3B2921'; ctx.beginPath(); ctx.arc(x, 321, 9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#9A563D'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(360, 325); ctx.lineTo(343, 390); ctx.lineTo(375, 390); ctx.stroke();
    ctx.strokeStyle = '#852F32'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(311, 431); ctx.quadraticCurveTo(360, 466, 409, 431); ctx.stroke();
    const box = { x: 220, y: 185, width: 280, height: 360 };
    const expected = document.createElement('canvas'); expected.width = expected.height = 720;
    expected.getContext('2d', { willReadFrequently: true }).drawImage(source, 0, 0); pixelateFaces(expected, [box]);
    const expanded = expandFaceBox(box, 720, 720), layout = mosaicLayout(expanded);
    const original = ctx.getImageData(expanded.x, expanded.y, expanded.width, expanded.height).data;
    const redacted = expected.getContext('2d').getImageData(expanded.x, expanded.y, expanded.width, expanded.height).data;
    const unique = (rgba) => { const colors = new Set(); for (let i = 0; i < rgba.length; i += 4) colors.add(rgba[i] * 65536 + rgba[i + 1] * 256 + rgba[i + 2]); return colors.size; };
    const changedPixels = redacted.reduce((sum, value, i) => sum + (i % 4 === 0 && value !== original[i] ? 1 : 0), 0);
    const afterColors = unique(redacted), beforeColors = unique(original);
    const judge = document.createElement('canvas'); judge.width = judge.height = JUDGE_SIZE;
    judge.getContext('2d', { willReadFrequently: true }).drawImage(expected, 0, 0, JUDGE_SIZE, JUDGE_SIZE);
    const judged = judgePhoto(judge.getContext('2d').getImageData(0, 0, JUDGE_SIZE, JUDGE_SIZE).data, JUDGE_SIZE, '#F23B2E');
    judge.getContext('2d').drawImage(source, 0, 0, JUDGE_SIZE, JUDGE_SIZE);
    const originalJudged = judgePhoto(judge.getContext('2d').getImageData(0, 0, JUDGE_SIZE, JUDGE_SIZE).data, JUDGE_SIZE, '#F23B2E');
    const expectedBytes = new Uint8Array(await (await jpeg(expected, .8)).arrayBuffer());
    const sameBytes = (bytes) => bytes.length === expectedBytes.length && bytes.every((value, i) => value === expectedBytes[i]);
    const actualRedact = faceRedactor.redact;
    const activeUrls = new Set(), oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
    URL.createObjectURL = (blob) => { const url = oldCreate.call(URL, blob); activeUrls.add(url); return url; };
    URL.revokeObjectURL = (url) => { activeUrls.delete(url); oldRevoke.call(URL, url); };
    const captures = [];
    let originalUrlCountAtDetection = -1;
    faceRedactor.redact = async (canvas) => { captures.push(canvas); originalUrlCountAtDetection = activeUrls.size; pixelateFaces(canvas, [box]); return 'mediapipe'; };
    let image, file, camera;
    let thumbnailFrames = 0, detectorCallsDuringThumbnails = -1, stoppedBeforeDetection = false;
    try {
      image = await snagImage(source, 720, 720, '#F23B2E');
      const png = await new Promise((resolve) => source.toBlob(resolve, 'image/png'));
      file = await snagFile(new File([png], 'synthetic-shapes.png', { type: 'image/png' }), '#F23B2E');
      const video = document.createElement('video'); video.muted = true; video.playsInline = true; document.body.append(video);
      const stream = source.captureStream(30), getUserMedia = navigator.mediaDevices.getUserMedia;
      // Canvas streams emit on paints; keep the synthetic source painting while
      // CameraFeed awaits video.play(), just as a real camera produces new frames.
      const painting = setInterval(() => ctx.drawImage(source, 0, 0), 33);
      navigator.mediaDevices.getUserMedia = async () => stream;
      const feed = new CameraFeed(video, { thumb: () => thumbnailFrames++, state: () => {}, hunting: () => true });
      try {
        await feed.start(); await new Promise((resolve) => setTimeout(resolve, 800));
        detectorCallsDuringThumbnails = captures.length - 2;
        faceRedactor.redact = async (canvas) => {
          await Promise.resolve(); stoppedBeforeDetection = !video.srcObject && stream.getTracks().every((track) => track.readyState === 'ended');
          captures.push(canvas); pixelateFaces(canvas, [box]); return 'mediapipe';
        };
        camera = await feed.capture('#F23B2E');
      } finally { clearInterval(painting); feed.stop(); video.remove(); navigator.mediaDevices.getUserMedia = getUserMedia; }
    } finally { faceRedactor.redact = actualRedact; URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; }
    const decoded = await createImageBitmap(new Blob([image.bytes], { type: 'image/jpeg' }));
    const jpegWidth = decoded.width, jpegHeight = decoded.height; decoded.close();
    const thumb = document.createElement('canvas'), tiny = document.createElement('canvas'); thumb.width = 96; thumb.height = 64;
    drawPrivateThumbnail(source, 720, 720, thumb, tiny);
    const thumbPixels = thumb.getContext('2d').getImageData(0, 0, 96, 64).data;
    let constantBlocks = true;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 96; x++) {
      const at = (y * 96 + x) * 4, start = (Math.floor(y / 8) * 8 * 96 + Math.floor(x / 8) * 8) * 4;
      for (let c = 0; c < 3; c++) if (thumbPixels[at + c] !== thumbPixels[start + c]) constantBlocks = false;
    }
    const report = {
      beforeColors, afterColors, maxMosaicColors: layout.columns * layout.rows, changedPixels,
      cameraJpegMatches: sameBytes(image.bytes), fileJpegMatches: sameBytes(file.bytes),
      judgeMatchesRedacted: image.hex === judged.hex && image.match === judged.match && file.hex === judged.hex && file.match === judged.match,
      maskMatchesRedacted: image.mask === judged.mask && file.mask === judged.mask,
      redactionChangedMask: judged.mask !== originalJudged.mask,
      jpegWidth, jpegHeight, captureCanvasesCleared: captures.every((canvas) => canvas.width === 0 && canvas.height === 0),
      originalUrlCountAtDetection, unreleasedUrls: activeUrls.size,
      thumbnailColors: unique(thumbPixels), constantBlocks, thumbnailFrames, detectorCallsDuringThumbnails,
      cameraMethod: camera.redaction, stoppedBeforeDetection,
    };
    original.fill(0); redacted.fill(0); thumbPixels.fill(0); expectedBytes.fill(0); image.bytes.fill(0); file.bytes.fill(0); camera.bytes.fill(0);
    for (const canvas of [source, expected, judge, thumb, tiny]) canvas.width = canvas.height = 0;
    return report;
  }, `/@fs${fileURLToPath(new URL('../../shared/src/index.ts', import.meta.url))}`);
  assert(synthetic.changedPixels > 10000); assert(synthetic.beforeColors > synthetic.afterColors * 5);
  assert(synthetic.afterColors <= synthetic.maxMosaicColors);
  assert(synthetic.cameraJpegMatches && synthetic.fileJpegMatches && synthetic.judgeMatchesRedacted);
  assert(synthetic.maskMatchesRedacted && synthetic.redactionChangedMask, 'both image/file masks must match the redacted image and differ from the original');
  assert.equal(synthetic.jpegWidth, 720); assert.equal(synthetic.jpegHeight, 720);
  assert(synthetic.captureCanvasesCleared && synthetic.stoppedBeforeDetection);
  assert.equal(synthetic.originalUrlCountAtDetection, 0); assert.equal(synthetic.unreleasedUrls, 0);
  assert(synthetic.constantBlocks && synthetic.thumbnailColors <= 96 && synthetic.thumbnailFrames >= 2);
  assert.equal(synthetic.detectorCallsDuringThumbnails, 0);
  console.log('PASS capture, file-picker, mosaics and thumbnail privacy');
  checks.push({ check: 'mocked drawn-face redaction precedes judging/JPEG on image, live camera and file paths; cleanup; private thumbnails', ...synthetic });

  const benchmark = await page.evaluate(async () => {
    const { faceRedactor } = await import('/src/faceBlur.ts');
    const detector = await faceRedactor.warm();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 720;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#FFF8EC'; ctx.fillRect(0, 0, 720, 720);
    ctx.fillStyle = '#E5AD79'; ctx.beginPath(); ctx.ellipse(360, 360, 145, 185, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#35271E';
    for (const x of [305, 415]) { ctx.beginPath(); ctx.ellipse(x, 310, 17, 10, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.lineWidth = 8; ctx.strokeStyle = '#35271E'; ctx.beginPath(); ctx.moveTo(360, 330); ctx.lineTo(344, 395); ctx.lineTo(377, 395); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(302, 428); ctx.quadraticCurveTo(360, 470, 418, 428); ctx.stroke();
    const portrait = document.createElement('canvas'); portrait.width = portrait.height = 720; portrait.getContext('2d').drawImage(canvas, 0, 0);
    let detections = 0;
    const passes = [], snaps = [];
    for (let i = 0; i < 12; i++) {
      ctx.drawImage(portrait, 0, 0);
      let start = performance.now(); const boxes = detector.detect(canvas); passes.push(performance.now() - start); detections = Math.max(detections, boxes.length);
      start = performance.now(); const method = await faceRedactor.redact(canvas); snaps.push(performance.now() - start);
      if (method !== 'mediapipe') throw new Error('Real runtime did not complete the snap.');
    }
    canvas.width = canvas.height = portrait.width = portrait.height = 0;
    return { syntheticDetections: detections, firstPassMs: passes[0], warmedPassMs: passes.slice(1), fullSnapMs: snaps };
  });
  checks.push({ check: 'real BlazeFace/WASM smoke on in-memory drawn shapes (no real photos)', ...benchmark });
  await page.goto(`${origin}/?fixture=end`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelector('#b-again').getBoundingClientRect().bottom <= innerHeight, { timeout: 3000 });
  const end = await page.evaluate(() => ({
    copy: document.querySelector('.privacy').textContent,
    fontPx: Number.parseFloat(getComputedStyle(document.querySelector('.privacy')).fontSize),
    buttonFits: document.querySelector('#b-again').getBoundingClientRect().bottom <= innerHeight,
  }));
  assert.equal(end.copy, 'Faces are blurred on your phone. Photos are never saved; they vanish when the show ends.');
  assert.equal(end.fontPx, 11); assert(end.buttonFits);
  assert.equal(foreignRequests, 0); assert.equal(browserErrors, 0);
  checks.push({ check: 'end-card copy, original small type and button fit; no third-party runtime requests', ...end, foreignRequests, browserErrors });
  const out = new URL('../../docs/review/', import.meta.url); await mkdir(out, { recursive: true });
  await writeFile(new URL('face-blur.json', out), JSON.stringify({ browser: await browser.version(), checks, playerMediaSaved: false }, null, 2) + '\n');
  console.log(`PASS ${checks.length} face-blur browser checks. Numeric receipt: docs/review/face-blur.json. No images saved.`);
} finally { clearTimeout(timeout); await browser.close(); }
