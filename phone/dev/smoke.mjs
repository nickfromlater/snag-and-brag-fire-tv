import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { writeFakeCamera } from './fake-camera.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = process.env.PHONE_ORIGIN ?? 'http://127.0.0.1:5173';
const temp = await mkdtemp(path.join(tmpdir(), 'snag-phone-camera-'));
const cameraFile = path.join(temp, 'synthetic-red.y4m'); await writeFakeCamera(cameraFile);
const results = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${cameraFile}`] });

async function open(url, setup) {
  const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  if (setup) await page.evaluateOnNewDocument(setup);
  await page.goto(url, { waitUntil: 'networkidle0' }); await page.evaluate(async () => document.fonts.ready);
  return { page, errors };
}
async function screen(page, key, round) {
  await page.waitForFunction((key, round) => { const ps = document.querySelector('#ps'); return ps?.dataset.screen === key && (round === undefined || ps.dataset.round === String(round)); }, { timeout: 20000 }, key, round);
}
async function hold(page, ms = 925) {
  const b = await page.$eval('#b-start', (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(b.x, b.y); await page.mouse.down(); await wait(ms); await page.mouse.up();
}
async function join(page) { await screen(page, 'join'); await page.click('#b-join'); await screen(page, 'lobby'); await hold(page); }

try {
  const { page, errors } = await open(`${origin}/?fake=1&fast=1`, () => { window.hapticCalls = []; navigator.vibrate = (pattern) => { window.hapticCalls.push(pattern); return true; }; });
  const network = []; page.on('request', (r) => { if (/^https?:/.test(r.url()) && !r.url().startsWith(origin)) network.push(r.url()); });
  await page.click('#b-join'); await screen(page, 'lobby');
  await page.click('#bots-toggle'); assert.equal(await page.$eval('#b-start', (b) => b.disabled), true);
  assert.equal(await page.$eval('#b-start-l', (b) => b.textContent), 'Waiting for teams…');
  await page.click('#bots-toggle'); await hold(page, 350); await screen(page, 'lobby');
  assert.equal(await page.evaluate(() => window.__phoneReview.messages.filter((m) => m.t === 'start').length), 0, 'short hold must not start');
  await page.evaluate(() => { window.hapticCalls = []; }); await hold(page);
  assert.deepEqual(await page.evaluate(() => window.hapticCalls), [10, 10, 10, 10], '850 ms start hold must have four haptic ticks');
  for (let round = 0; round < 3; round++) {
    await screen(page, 'cam', round); await page.waitForFunction(() => window.__phoneReview.inspect().cameraReady); await wait(750);
    const before = await page.evaluate(() => window.__phoneReview.frames.filter((f) => f.header.t === 'thumb').length);
    assert(before >= 2, 'camera must produce thumbnails before snag');
    await page.click('#shutter'); await screen(page, 'glow', round);
    await page.waitForFunction(() => !window.__phoneReview.inspect().cameraActive);
    const atSnag = await page.evaluate(() => window.__phoneReview.frames.filter((f) => f.header.t === 'thumb').length);
    if (round === 0) {
      await page.click('#gnames .chipb:nth-child(2)'); await page.click('#gbrags button:nth-child(2)');
      await page.click('#gstage', { offset: { x: 100, y: 90 } }); await page.click('#gstage', { offset: { x: 160, y: 90 } });
    }
    await page.waitForFunction((n) => window.__phoneReview.aiReads >= n, {}, round + 1);
    assert.equal(await page.$eval('#aiwait', (e) => e.hidden), true);
    if (round === 0) {
      assert.equal(await page.$eval('#gnames [aria-checked="true"]', (e) => e.textContent), 'The Thingamajig', 'late AI must preserve a picked name');
      assert.equal(await page.$eval('#gbrags [aria-checked="true"]', (e) => e.textContent), 'Nobody asked for this. Everybody needed it.', 'late AI must preserve a picked brag');
    } else assert.equal(await page.$eval('#gnames [aria-checked="true"]', (e) => e.textContent), 'Mugsy Malone');
    const after = await page.evaluate(() => window.__phoneReview.frames.filter((f) => f.header.t === 'thumb').length);
    assert.equal(after, atSnag, 'preview frames must stop at the snag');
    if (round === 1) await page.evaluate(() => window.__phoneReview.expire());
    else await page.click('#b-send');
    await screen(page, 'wait');
    if (round === 0) {
      await page.evaluate(() => { for (let i = 0; i < 12; i++) document.querySelectorAll('#react button')[i % 4].click(); });
      const reactions = await page.evaluate(() => window.__phoneReview.messages.filter((m) => m.t === 'react'));
      assert.equal(reactions.length, 6); assert.equal(new Set(reactions.map((m) => m.kind)).size, 4);
    }
    if (round === 1) {
      const auto = await page.evaluate(() => window.__phoneReview.messages.filter((m) => m.t === 'glow')[1]);
      assert.deepEqual(auto.eyes, [[42, 46], [78, 46]], 'deadline uses default eyes');
      await screen(page, 'mash'); await page.waitForFunction(() => !document.querySelector('[data-side="-1"]').disabled);
      assert.equal(await page.$eval('[data-side="1"]', (b) => b.disabled), true, 'fighter can only mash their own sticker');
      await page.evaluate(() => { for (let i = 0; i < 35; i++) document.querySelector('[data-side="-1"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
      await wait(160);
      const taps = await page.evaluate(() => window.__phoneReview.messages.filter((m) => m.t === 'tap'));
      assert(taps.some((m) => m.n === 35 && m.side === -1), 'pointerdown taps must batch every 100 ms');
    }
    if (round === 2) {
      await screen(page, 'vote'); assert.equal(await page.$$eval('.vopt', (b) => b.length), 3);
      await page.evaluate(() => { document.querySelectorAll('.vopt').forEach((button) => button.click()); });
      await screen(page, 'end'); assert.equal(await page.evaluate(() => window.__phoneReview.messages.filter((m) => m.t === 'vote').length), 1, 'vote must lock after one tap');
    }
  }
  const receipt = await page.evaluate(() => { const r = window.__phoneReview; return { seen: r.seen, rounds: r.rounds, frames: r.frames, aiReads: r.aiReads, errors: r.errors, messages: r.messages }; });
  assert.deepEqual([...receipt.seen].sort(), ['join', 'lobby', 'ready', 'cam', 'glow', 'wait', 'mash', 'vote', 'end'].sort());
  assert.deepEqual(receipt.rounds, [-1, 0, 1, 2, 3]); assert.equal(receipt.aiReads, 3);
  const snags = receipt.frames.filter((f) => f.header.t === 'snag'), thumbs = receipt.frames.filter((f) => f.header.t === 'thumb');
  assert.equal(snags.length, 3);
  for (const [i, frame] of snags.entries()) {
    assert.equal(frame.width, 720); assert.equal(frame.height, 720); assert.equal(frame.header.round, i);
    assert.equal(frame.header.roundKind, ['color', 'brag', 'show'][i]); assert.match(frame.header.hex, /^#[0-9a-f]{6}$/i);
    assert(frame.bytes > 1000 && frame.bytes < 1000000);
    if (i === 0) assert(frame.header.match >= 90 && frame.header.match <= 99, 'red scene must match the red Pixel Judge target'); else assert.equal(frame.header.match, 0);
  }
  for (const frame of thumbs) { assert.equal(frame.width, 96); assert.equal(frame.height, 64); assert(frame.bytes > 600 && frame.bytes <= 4096); assert.deepEqual(frame.header, { t: 'thumb' }); }
  assert.equal(errors.length + receipt.errors.length, 0); assert.deepEqual(network, []);
  assert(await page.$eval('.privacy', (p) => p.textContent.includes('Photos were never saved.')));
  const end = await page.$eval('#e-card', (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  await page.mouse.move(end.x + end.width * .8, end.y + end.height * .2);
  assert.notEqual(await page.$eval('#e-card', (c) => c.style.transform), '', 'pointer tilt must work without device orientation');
  await page.click('#b-again'); await screen(page, 'lobby');
  results.push({ check: 'full fake-TV game', screens: receipt.seen, rounds: receipt.rounds, aiReads: receipt.aiReads, snags, thumbnailCount: thumbs.length, thumbnailBytes: { min: Math.min(...thumbs.map((f) => f.bytes)), max: Math.max(...thumbs.map((f) => f.bytes)) }, outcome: 'PASS' });
  await page.close();

  const denied = await open(`${origin}/?fake=1&fast=1`, () => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Synthetic denial', 'NotAllowedError'); };
  });
  await join(denied.page); await screen(denied.page, 'cam');
  await denied.page.waitForFunction(() => !document.querySelector('#camera-fallback').hidden);
  await denied.page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 600;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#F23B2E'; ctx.fillRect(0, 0, 900, 600);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', .8));
    const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'synthetic.jpg', { type: 'image/jpeg' }));
    const file = document.querySelector('#realfile'); file.files = transfer.files; file.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await screen(denied.page, 'glow');
  const fallback = await denied.page.evaluate(() => window.__phoneReview.frames.find((f) => f.header.t === 'snag'));
  assert.equal(fallback.width, 720); assert.equal(fallback.height, 720); assert(fallback.header.match >= 98);
  assert.equal(denied.errors.length, 0); results.push({ check: 'permission-denied file fallback (synthetic File in memory)', frame: fallback, outcome: 'PASS' }); await denied.page.close();

  const entry = await open(origin);
  assert.equal(await entry.page.$$eval('.code-tiles input', (a) => a.length), 4);
  assert.equal(await entry.page.$$eval('#ps', (a) => a.length), 0, 'no room means no WebSocket');
  assert.equal(entry.errors.length, 0); results.push({ check: 'four-letter code entry', outcome: 'PASS' }); await entry.page.close();

  const out = path.join(root, 'docs/review'); await mkdir(out, { recursive: true });
  await writeFile(path.join(out, 'phone-smoke.json'), JSON.stringify({ browser: await browser.version(), checks: results, media: 'synthetic only; all payloads kept in browser memory; temporary Y4M deleted' }, null, 2) + '\n');
  console.log('PASS: every screen, three rounds, real fake-camera capture, Pixel Judge, binary headers, thumbnail budget, late AI, auto-send, reactions, taps, vote, pointer tilt, restart, denied-camera file fallback, and code entry.');
} finally { await browser.close(); await rm(temp, { recursive: true, force: true }); }
