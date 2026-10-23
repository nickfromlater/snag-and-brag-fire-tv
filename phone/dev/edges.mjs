import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import puppeteer from 'puppeteer-core';
import { writeFakeCamera } from './fake-camera.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = process.env.PHONE_ORIGIN ?? 'http://127.0.0.1:5173';
const temp = await mkdtemp(path.join(tmpdir(), 'snag-phone-camera-'));
const cameraFile = path.join(temp, 'synthetic-red.y4m'); await writeFakeCamera(cameraFile);
const results = [], browserErrors = [], ids = new Set(), hellos = [], frames = [], photoReads = [];
const me = { id: 'edge-player', name: 'Sock Goblins', mono: 'SG', color: '#FF4FA0', score: 0, bot: false, connected: true };
const other = { id: 'edge-rival', name: 'Couch Potatoes', mono: 'CP', color: '#FF7A1F', score: 0, bot: true, connected: true };
const prompt = { kind: 'color', a: 'Snag the most', b: 'RED', c: 'thing in the house', col: '#F23B2E', hex: '#F23B2E' };
let active, connects = 0, current = { t: 'screen', seq: 1, me: null, teams: [], round: -1, paused: false, s: { k: 'join', takenColors: [], suggestedName: 'Sock Goblins', full: false } };
let photo, pausedAt = 0;
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Cache-Control', 'no-store');
  if (req.url?.startsWith('/p/EDGE/captured') && photo) { res.setHeader('Content-Type', 'image/jpeg'); photoReads.push({ cache: 'no-store', bytes: photo.length }); res.end(photo); }
  else { res.statusCode = 404; res.end(); }
});
const wss = new WebSocketServer({ server });
const send = (message) => { if (active?.readyState === 1) active.send(JSON.stringify(message)); };
const emit = () => send({ t: 'msg', m: current });
const set = (s, extra = {}) => { current = { ...current, ...extra, seq: current.seq + 1, s }; emit(); };
const offset = 5000;
wss.on('connection', (socket) => {
  active = socket; connects++;
  socket.on('message', (data, binary) => {
    if (binary) {
      const h = data.readUInt32BE(0); assert(h > 0 && h <= 4096);
      const header = JSON.parse(data.subarray(4, 4 + h).toString('utf8')), payload = data.subarray(4 + h);
      frames.push({ header, bytes: payload.length });
      if (header.t === 'snag' && current.s.k === 'cam') {
        photo = Buffer.from(payload);
        set({ k: 'glow', find: { team: me.id, round: 0, photoId: 'captured', name: 'Mugsy Malone', brag: 'Holds coffee. Holds grudges.', thing: 'red mug', hex: header.hex, match: header.match }, names: ['Mugsy Malone', 'Sir Sips-a-Lot', 'Morning Menace'], brags: ['Holds coffee. Holds grudges.', 'Ten out of ten. No notes.', 'Born for this exact moment.'], aiPending: false }, { deadline: Date.now() + offset + 15000, total: 15000 });
      }
      return;
    }
    const message = JSON.parse(data.toString());
    if (message.t === 'hello') {
      assert.equal(message.proto, 1); assert.equal(message.role, 'phone'); assert.equal(message.code, 'EDGE'); assert.match(message.cid, /^[a-f0-9]{32}$/);
      ids.add(message.cid); hellos.push({ proto: message.proto, role: message.role, code: message.code });
      send({ t: 'welcome', role: 'phone', code: 'EDGE', roomKey: 'synthetic-key', joinUrl: `${origin}/?r=EDGE`, serverNow: Date.now() + offset }); emit();
    } else if (message.t === 'ping') send({ t: 'pong', c: message.c, s: Date.now() + offset });
    else if (message.t === 'msg') {
      const m = message.m;
      if (m.t === 'join') set({ k: 'lobby', isHost: true, canStart: true, botsOn: true, minTeams: 2 }, { me, teams: [me, other] });
      if (m.t === 'start') set({ k: 'cam' }, { round: 0, prompt, deadline: Date.now() + offset + 35000, total: 35000 });
      if (m.t === 'control' && m.action === 'pause') { pausedAt = Date.now(); set(current.s, { paused: true }); }
      if (m.t === 'control' && m.action === 'resume') set(current.s, { paused: false, deadline: current.deadline + Date.now() - pausedAt });
    }
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const relay = `ws://127.0.0.1:${server.address().port}/ws`;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, acceptInsecureCerts: true, args: ['--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${cameraFile}`] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function page(url, setup, agent, setupArgument) {
  const p = await browser.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }); p.on('pageerror', (e) => browserErrors.push(e.message));
  if (setup) await p.evaluateOnNewDocument(setup, setupArgument); if (agent) await p.setUserAgent(agent);
  await p.goto(url, { waitUntil: 'networkidle0' }); await p.evaluate(async () => document.fonts.ready); return p;
}
async function isScreen(p, k) { await p.waitForFunction((k) => document.querySelector('#ps')?.dataset.screen === k, { timeout: 15000 }, k); }
async function cameraReady(p) { await p.waitForFunction(() => !!document.querySelector('#camera')?.srcObject && document.querySelector('#camera').readyState >= 2, { timeout: 15000 }); }
async function hold(p) { const b = await p.$eval('#b-start', (b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await p.mouse.move(b.x, b.y); await p.mouse.down(); await wait(925); await p.mouse.up(); }

try {
  const p = await page(`${origin}/?r=EDGE&relay=${encodeURIComponent(relay)}`);
  await isScreen(p, 'join'); await p.click('#b-join'); await isScreen(p, 'lobby'); await hold(p); await isScreen(p, 'cam'); await cameraReady(p);
  assert.equal(await p.$eval('#host-toggle', (b) => b.hidden), false);
  const firstConnections = connects; active.terminate();
  await p.waitForFunction(() => document.querySelector('#connection').hidden); await wait(500);
  assert(connects > firstConnections); assert.equal(ids.size, 1, 'network reconnect keeps the 128-bit client token');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await p.$eval('#camera', (v) => v.srcObject), null, 'sleep must release the camera');
  const beforeWake = connects;
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await cameraReady(p); await wait(350); assert(connects > beforeWake); assert.equal(ids.size, 1);
  await p.click('#host-toggle'); await p.click('#pause-control'); await p.waitForFunction(() => !document.querySelector('#pause-overlay').hidden);
  assert.equal(await p.$eval('#camera', (v) => v.srcObject), null);
  const pausedTime = await p.$eval('#ctime', (t) => t.textContent); await wait(1100); assert.equal(await p.$eval('#ctime', (t) => t.textContent), pausedTime);
  // The host menu remains accessible above the overlay, including Resume.
  await p.click('#host-toggle'); assert.equal(await p.$eval('#pause-control', (b) => b.textContent), 'Resume'); await p.click('#pause-control'); await cameraReady(p);
  await p.reload({ waitUntil: 'networkidle0' }); await isScreen(p, 'cam'); await cameraReady(p);
  assert.equal(await p.$eval('#host-toggle', (b) => b.hidden), false, 'host identity must survive a mid-game reload');
  const beforePageshow = connects;
  await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await wait(350); assert(connects > beforePageshow); assert.equal(ids.size, 1);
  const displaySeconds = await p.$eval('#ctime', (t) => Number(t.textContent.split(':')[1]));
  const expectedSeconds = Math.ceil(Math.max(0, current.deadline - Date.now() - offset) / 1000);
  assert(Math.abs(displaySeconds - expectedSeconds) <= 1, 'timer uses the relay clock, including the 5 s server offset');
  await p.click('#shutter'); await isScreen(p, 'glow'); await p.waitForFunction(() => document.querySelector('#gstage image')?.hasAttribute('href'));
  assert.equal(photoReads.length, 1); assert.equal(photoReads[0].cache, 'no-store');
  const storage = await p.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('snag:')).map(([key, value]) => ({ key, length: value.length })));
  assert(storage.every((entry) => entry.key === 'snag:cid:EDGE' || entry.key === 'snag:host:EDGE')); assert(storage.every((entry) => entry.length === 32));
  send({ t: 'error', code: 'NO_ROOM' });
  await p.waitForFunction(() => !document.querySelector('#gstage image').hasAttribute('href'));
  assert.equal(await p.$eval('#camera', (v) => v.srcObject), null);
  results.push({ check: 'actual WebSocket hello/msg/binary + close/wake/pageshow/reload recovery + pause/resume + relay clock + no-store photo fetch + room-close cleanup', connects, distinctReconnectTokens: ids.size, clockOffsetMs: offset, hello: hellos[0], frames: frames.filter((f) => f.header.t === 'snag'), thumbnailCount: frames.filter((f) => f.header.t === 'thumb').length, photoReads, storage, outcome: 'PASS' }); await p.close();

  const join = await page(`${origin}/?fixture=join`);
  await join.type('#tname', ' custom');
  await join.evaluate(async () => { const { fixture } = await import('/dev/fixtures.ts'); const m = fixture('join', Date.now()); m.seq = 2; m.s.takenColors = ['#FF4FA0', '#8B5CFF']; window.__phoneReview.inject(m); });
  assert.equal(await join.$$eval('#swatches button:disabled', (b) => b.length), 2);
  assert.equal(await join.$eval('#swatches [aria-checked="true"]', (b) => b.disabled), false);
  assert.equal(await join.$eval('#tname', (i) => i.value), 'Sock Goblins custom');
  await join.evaluate(async () => { const { fixture } = await import('/dev/fixtures.ts'); const m = fixture('join', Date.now()); m.seq = 3; m.s.full = true; window.__phoneReview.inject(m); });
  assert.equal(await join.$eval('#b-join', (b) => b.disabled), true);
  // A stale host screen cannot overwrite the current authoritative join screen.
  await join.evaluate(async () => { const { fixture } = await import('/dev/fixtures.ts'); const m = fixture('end', Date.now()); m.seq = 2; window.__phoneReview.inject(m); });
  await isScreen(join, 'join'); results.push({ check: 'taken colors, full room, local-name preservation, stale screens', outcome: 'PASS' }); await join.close();

  const encode = await page(`${origin}/?fixture=cam`);
  const noisyBytes = await encode.evaluate(async () => {
    const { encodeThumbnail } = await import('/src/camera.ts');
    const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 64;
    const context = canvas.getContext('2d'), pixels = context.createImageData(96, 64);
    let seed = 12345;
    for (let i = 0; i < pixels.data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; pixels.data[i] = i % 4 === 3 ? 255 : seed >>> 24; }
    context.putImageData(pixels, 0, 0); return (await encodeThumbnail(canvas)).length;
  });
  assert(noisyBytes >= 2000 && noisyBytes <= 4096);
  await encode.evaluate(async () => { const { fixture } = await import('/dev/fixtures.ts'); const m = fixture('cam', Date.now()); m.seq = 2; m.deadline = Date.now() + 7000; window.__phoneReview.inject(m); });
  await encode.waitForFunction(() => document.querySelector('#ctime').classList.contains('low') && document.querySelector('#cbar').classList.contains('low'));
  results.push({ check: 'noisy 96×64 browser JPEG encoder fits 2–4 KB; last-ten-second red timer/bar', bytes: noisyBytes, outcome: 'PASS' }); await encode.close();

  const unsupported = await page(`${origin}/?fake=1&fast=1`, () => { Object.defineProperty(navigator, 'mediaDevices', { value: undefined }); });
  await unsupported.click('#b-join'); await isScreen(unsupported, 'lobby'); await hold(unsupported); await isScreen(unsupported, 'cam');
  await unsupported.waitForFunction(() => !document.querySelector('#camera-fallback').hidden);
  assert.equal(await unsupported.$eval('#realfile', (input) => input.accept), 'image/*'); assert.equal(await unsupported.$eval('#realfile', (input) => input.getAttribute('capture')), 'environment');
  results.push({ check: 'unsupported-camera fallback', outcome: 'PASS' }); await unsupported.close();

  const embedded = await page(`${origin}/?fixture=cam`, () => { window.copiedLink = ''; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (value) => { window.copiedLink = value; } } }); }, 'Mozilla/5.0 (iPhone) Instagram FBAV/999');
  assert.equal(await embedded.$eval('#inapp', (e) => e.hidden), false); await embedded.click('#copy-link'); await embedded.waitForFunction(() => !!window.copiedLink);
  assert.equal(await embedded.evaluate(() => window.copiedLink), `${origin}/?fixture=cam`);
  results.push({ check: 'embedded-browser detection and copy-link control', outcome: 'PASS' }); await embedded.close();

  for (const allowed of [false, true]) {
    const end = await page(`${origin}/?fixture=end`, (allowed) => { window.orientationRequests = 0; Object.defineProperty(DeviceOrientationEvent, 'requestPermission', { value: async () => { window.orientationRequests++; return allowed ? 'granted' : 'denied'; } }); }, undefined, allowed);
    await end.click('#e-card'); await wait(100); assert.equal(await end.evaluate(() => window.orientationRequests), 1);
    await end.click('#e-card'); assert.equal(await end.evaluate(() => window.orientationRequests), 1, 'orientation permission is asked once per session');
    await end.evaluate(() => { document.querySelector('#e-card').style.transform = ''; window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { gamma: 25, beta: 65 })); });
    const sensorTransform = await end.$eval('#e-card', (c) => c.style.transform);
    assert.equal(sensorTransform.includes('rotateY(15deg)'), allowed);
    const rect = await end.$eval('#e-card', (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    await end.mouse.move(rect.x + rect.width * .8, rect.y + rect.height * .2); assert.notEqual(await end.$eval('#e-card', (c) => c.style.transform), '');
    const fits = await end.$eval('#b-again', (b) => b.getBoundingClientRect().bottom <= innerHeight); assert(fits, 'privacy line must leave Run it back visible');
    results.push({ check: `iOS orientation permission ${allowed ? 'granted' : 'denied'}, pointer fallback, end-screen fit`, outcome: 'PASS' }); await end.close();
  }

  const spectator = await page(`${origin}/?fixture=mash`);
  await spectator.evaluate(async () => { const { fixture } = await import('/dev/fixtures.ts'); const m = fixture('mash', Date.now()); m.seq = 2; m.s.youIn = false; window.__phoneReview.inject(m); });
  assert.equal(await spectator.$$eval('.mbtn:disabled', (buttons) => buttons.length), 0);
  await spectator.evaluate(() => { document.querySelector('[data-side="1"]').dispatchEvent(new PointerEvent('pointerdown')); document.querySelector('[data-side="-1"]').dispatchEvent(new PointerEvent('pointerdown')); });
  assert.deepEqual(await spectator.$$eval('.mbtn .tap', (counts) => counts.map((c) => c.textContent)), ['1', '1']);
  results.push({ check: 'spectator can mash either side with pointerdown', outcome: 'PASS' }); await spectator.close();

  if (process.env.PHONE_HTTPS_ORIGIN) {
    const https = await page(`${process.env.PHONE_HTTPS_ORIGIN}/?fake=1&fast=1`);
    assert.equal(await https.evaluate(() => isSecureContext), true); await https.click('#b-join'); await isScreen(https, 'lobby'); await hold(https); await isScreen(https, 'cam'); await cameraReady(https);
    results.push({ check: 'basic-ssl LAN HTTPS secure context and camera capture permission', origin: process.env.PHONE_HTTPS_ORIGIN, outcome: 'PASS' }); await https.close();
  }
  assert.deepEqual(browserErrors, []);
  const out = path.join(root, 'docs/review'); await mkdir(out, { recursive: true }); await writeFile(path.join(out, 'phone-edges.json'), JSON.stringify({ browser: await browser.version(), checks: results, browserErrors }, null, 2) + '\n');
  console.log(`PASS: ${results.length} phone edge checks, including actual WebSocket reconnection and photo fetch. No player media saved.`);
} finally {
  await browser.close(); wss.clients.forEach((client) => client.terminate()); await new Promise((resolve) => wss.close(resolve)); await new Promise((resolve) => server.close(resolve)); photo = undefined; await rm(temp, { recursive: true, force: true });
}
