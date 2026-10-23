// End-to-end smoke: a headless phone (fake camera) plays a full game against a real relay
// and the stand-in TV. Run: pnpm --filter relay start; pnpm --filter tvsim start;
// then node phone/dev/e2e-play.mjs "http://localhost:8787/?r=<ROOM>" [screenshot dir]
// Photos stay in memory. Optional screenshots redact camera pixels and photo stickers.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const [,, url, out] = process.argv;
// MediaPipe CPU inference still uses WebGL to prepare canvas input; leave Chrome's GPU enabled.
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void b.close().finally(() => process.exit(1)); });
try {
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.setCacheEnabled(false);
await p.evaluateOnNewDocument(() => {
  // Inspect only metadata; retain numeric receipts, never images or encoded masks.
  window.__e2eRedaction = {};
  window.__snagEvidence = {};
  window.__pixelMaskEvidence = [];
  const maskReceipt = (mask, round, source) => {
    const present = mask !== undefined;
    const valid = typeof mask === 'string' && mask.length === 96 && /^[A-Za-z0-9+/]{96}$/.test(mask);
    const bytes = valid ? atob(mask) : '';
    let onCells = 0;
    for (const byte of bytes) for (let bits = byte.charCodeAt(0); bits; bits >>>= 1) onCells += bits & 1;
    return { round, source, present, valid, bytes: bytes.length, onCells };
  };
  const Socket = window.WebSocket;
  window.WebSocket = class extends Socket {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', event => {
        if (typeof event.data !== 'string') return;
        try {
          const envelope = JSON.parse(event.data), m = envelope.t === 'msg' ? envelope.m : null;
          if (m?.t !== 'screen') return;
          const find = m.s.k === 'glow' ? m.s.find : m.s.k === 'wait' ? m.s.card : null;
          if (!find?.photoId || window.__pixelMaskEvidence.some(e => e.round === find.round)) return;
          window.__pixelMaskEvidence.push(maskReceipt(find.mask, find.round, 'TV find screen'));
        } catch { /* Non-screen relay messages do not affect the receipt. */ }
      });
    }
    send(data) {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
      if (bytes && bytes.length >= 4) {
        const length = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false);
        if (length <= 4096 && length + 4 <= bytes.length) {
          const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length)));
          if (header.t === 'snag') {
            const redaction = header.redaction ?? 'missing';
            window.__e2eRedaction[header.round] = redaction;
            window.__snagEvidence[header.round] = { ...maskReceipt(header.mask, header.round, 'phone snag header'), redaction };
          }
        }
      }
      return super.send(data);
    }
  };
});
const errs = []; let ignoredFavicon404s = 0;
p.on('pageerror', () => errs.push('Browser error'));
p.on('console', m => {
  if (m.type() !== 'error') return;
  // MediaPipe emits this informational initialization line on WASM stderr.
  if (m.text() === 'INFO: Created TensorFlow Lite XNNPACK delegate for CPU.') return;
  // Chrome probes this optional icon even though the phone does not reference it.
  try {
    if (new URL(m.location().url).pathname === '/favicon.ico' && /status of 404\b/.test(m.text())) { ignoredFavicon404s++; return; }
  } catch { /* Unknown console errors still fail the run. */ }
  errs.push('Browser console error');
});
await p.goto(url); await new Promise(r => setTimeout(r, 1500));
const t0 = Date.now(); let last = '', n = 0, started = false, botsDone = false;
const seen = new Set();
const wait = ms => new Promise(r => setTimeout(r, ms));
// Omitting the optional output directory keeps the entire test memory-only. If
// screenshots are requested, hide every media surface so no player pixels persist.
const shot = async tag => {
  if (!out) return;
  const style = await p.addStyleTag({ content: 'video,canvas,img,svg image{visibility:hidden!important} #vf{background-image:none!important}' });
  try { await p.screenshot({ path: `${out}/${String(n++).padStart(3, '0')}-${tag}.png` }); }
  finally { await style.evaluate((element) => element.remove()); }
};
await p.click('#b-join'); await wait(800);
while (Date.now() - t0 < 420000) {
  const k = await p.evaluate(() => document.querySelector('.pscr.on')?.id || '');
  if (k !== last) { console.log(((Date.now() - t0) / 1000).toFixed(1), k); last = k; seen.add(k); await shot(k); }
  if (k === 'p-lobby' && !botsDone) { const v = await p.$eval('#bots-toggle', e => !e.hidden).catch(() => false); if (v) { await p.click('#bots-toggle'); botsDone = true; await wait(2500); } }
  if (k === 'p-lobby' && botsDone && !started) { const ok = await p.$eval('#b-start', e => !e.disabled); if (ok) { const bx = await (await p.$('#b-start')).boundingBox(); await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.mouse.down(); await wait(1100); await p.mouse.up(); started = true; } }
  if (k === 'p-cam') { await wait(2500); await p.click('#shutter').catch(() => {}); await wait(800); }
  if (k === 'p-glow') { const g = await p.$('#gstage .stk, #gstage img, #gstage svg'); if (g) { const bx = await g.boundingBox(); if (bx) { await p.mouse.click(bx.x + bx.width * .38, bx.y + bx.height * .4); await p.mouse.click(bx.x + bx.width * .62, bx.y + bx.height * .4); } } await wait(3000); await shot('glow-ai'); await p.click('#b-send').catch(() => {}); await wait(800); }
  if (k === 'p-mash') { const btns = await p.$$('.mbtn:not([disabled])'); if (btns[0]) { const bx = await btns[0].boundingBox(); for (let i = 0; i < 10; i++) { await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.mouse.down(); await p.mouse.up(); await wait(60); } } continue; }
  if (k === 'p-vote') { await p.click('.vopt').catch(() => {}); await wait(500); }
  if (k === 'p-end') { await wait(4000); await shot('end'); break; }
  await wait(400);
}
const redaction = await p.evaluate(() => window.__e2eRedaction);
console.log('screens', [...seen].join(','), 'errors', JSON.stringify(errs.slice(0, 10)), 'ignoredFavicon404s', ignoredFavicon404s, 'secs', (Date.now() - t0) / 1000, 'redaction', JSON.stringify(redaction));
assert(seen.has('p-end'), 'game must reach the finale');
assert.deepEqual(errs, [], 'browser must have no errors');
assert.deepEqual(redaction, { 0: 'mediapipe', 1: 'mediapipe', 2: 'mediapipe' }, 'all three snaps must run local redaction');
const evidence = await p.evaluate(() => window.__pixelMaskEvidence);
const snags = await p.evaluate(() => window.__snagEvidence);
console.log('snag evidence', JSON.stringify(snags));
console.log('mask evidence', JSON.stringify(evidence));
const color = evidence.find(e => e.round === 0);
assert(color?.valid && color.bytes === 72 && color.onCells > 0, 'valid Color Rush mask must reach the TV');
assert(snags[0]?.valid && snags[0].bytes === color.bytes && snags[0].onCells === color.onCells, 'the redacted Color Rush snag must carry the mask received by the TV');
assert([1, 2].every(round => snags[round] && !snags[round].present && evidence.some(e => e.round === round && !e.present)), 'other rounds must omit masks in snag headers and TV find screens');
console.log('PASS full game; all three snags locally redacted; valid Color Rush mask reached the TV; other rounds omit masks; no photos logged or saved.');
} finally { await b.close(); }
