// Exercise the README's real relay + tvsim + phone path. Synthetic media only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(new URL('../../phone/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');
const code = process.argv[2];
if (!/^[A-Z]{4}$/.test(code ?? '')) throw new Error('Usage: node tools/release/verify-local.mjs ROOM_CODE');
const origin = process.env.PHONE_ORIGIN ?? 'http://localhost:5173';
const out = new URL('../../docs/release/', import.meta.url);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--mute-audio'],
});
const errors = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => {
    // Test the actual photo-picker fallback without writing even synthetic JPEGs.
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Synthetic camera denial', 'NotAllowedError'); };
    const metrics = window.__releaseMetrics = { screens: [], snags: [], dimensions: [] };
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', event => {
          if (typeof event.data !== 'string') return;
          const envelope = JSON.parse(event.data);
          if (envelope.t === 'msg' && envelope.m.t === 'screen') {
            const { round, s } = envelope.m;
            const last = metrics.screens.at(-1);
            if (last?.screen !== s.k || last?.round !== round) metrics.screens.push({ screen: s.k, round });
          }
        });
      }
      send(data) {
        if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
          const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
          const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length)));
          if (header.t === 'snag') {
            metrics.snags.push({ round: header.round, kind: header.roundKind, match: header.match, redaction: header.redaction, maskBytes: header.mask ? atob(header.mask).length : 0, bytes: bytes.length - 4 - length });
            const blob = new Blob([bytes.slice(4 + length)], { type: 'image/jpeg' });
            createImageBitmap(blob).then(bitmap => { metrics.dimensions.push([bitmap.width, bitmap.height]); bitmap.close(); });
          }
        }
        return super.send(data);
      }
    };
  });
  await page.goto(`${origin}/?r=${code}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#b-join');
  await page.click('#b-join');
  await page.waitForFunction(() => document.querySelector('#ps')?.dataset.screen === 'lobby');
  await page.waitForFunction(() => !document.querySelector('#b-start').disabled);
  const button = await page.$eval('#b-start', element => { const rect = element.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; });
  await page.mouse.move(button.x, button.y); await page.mouse.down(); await wait(925); await page.mouse.up();
  const captured = new Set(), sent = new Set();
  const until = Date.now() + 420_000;
  let ended = false;
  while (Date.now() < until) {
    const state = await page.evaluate(() => ({
      screen: document.querySelector('#ps')?.dataset.screen,
      round: window.__releaseMetrics.screens.at(-1)?.round,
    }));
    if (state.screen === 'cam' && !captured.has(state.round)) {
      await page.evaluate(async () => {
        const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 600;
        const context = canvas.getContext('2d'); context.fillStyle = '#F23B2E'; context.fillRect(0, 0, 900, 600);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .8));
        const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'synthetic.jpg', { type: 'image/jpeg' }));
        const input = document.querySelector('#realfile'); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
        canvas.width = canvas.height = 0;
      });
      captured.add(state.round);
      console.log(`Synthetic snag sent for round ${state.round + 1}.`);
    } else if (state.screen === 'glow' && !sent.has(state.round)) {
      await page.waitForFunction(() => document.querySelectorAll('#gnames button').length > 0, { timeout: 10_000 });
      await page.click('#b-send'); sent.add(state.round);
    } else if (state.screen === 'mash') {
      await page.evaluate(() => document.querySelector('#p-mash [data-side]:not(:disabled)')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    } else if (state.screen === 'vote') {
      await page.evaluate(() => document.querySelector('.vopt:not(:disabled)')?.click());
    } else if (state.screen === 'end') { ended = true; break; }
    await wait(100);
  }
  assert(ended, 'normal-speed three-round game must reach the finale');
  const metrics = await page.evaluate(() => window.__releaseMetrics);
  assert.equal(metrics.snags.length, 3);
  assert.deepEqual(metrics.snags.map(s => s.round), [0, 1, 2]);
  assert.deepEqual(metrics.snags.map(s => s.kind), ['color', 'brag', 'show']);
  assert.equal(metrics.snags[0].maskBytes, 72);
  assert.deepEqual(metrics.dimensions, [[720, 720], [720, 720], [720, 720]]);
  assert.deepEqual([...new Set(metrics.screens.map(s => s.screen))].sort(), ['join', 'lobby', 'ready', 'cam', 'glow', 'wait', 'mash', 'vote', 'end'].sort());
  assert.equal(errors.length, 0, 'browser must have no uncaught exceptions');
  assert(await page.$eval('.privacy', element => element.textContent.includes('Photos are never saved')));
  await mkdir(out, { recursive: true });
  await page.screenshot({ path: new URL('local-phone-finale.png', out).pathname });
  await writeFile(new URL('local-game.json', out), JSON.stringify({
    date: new Date().toISOString().slice(0, 10), browser: await browser.version(),
    scenario: 'README local relay + normal-speed tvsim + actual phone; mock AWS services; synthetic File in browser memory',
    outcome: 'PASS', ...metrics, uncaughtErrors: errors.length,
    media: 'No player media, photos, thumbnails, room keys or reconnect tokens saved. Screenshot contains only synthetic fixture media.',
  }, null, 2) + '\n');
  console.log('PASS local quick start: normal-speed three-round game, all nine phone screens, three 720px synthetic snags, real 72-byte Pixel Judge mask, zero browser exceptions.');
} finally { await browser.close(); }
