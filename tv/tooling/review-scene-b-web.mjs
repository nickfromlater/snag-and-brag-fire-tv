import puppeteer from 'puppeteer-core';
import { WebSocket } from 'ws';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..'), dir = resolve(root, 'docs/review/scene-b');
const url = process.env.TV_SCENE_URL ?? 'http://127.0.0.1:5182';
const relay = process.env.TV_SCENE_RELAY ?? 'ws://127.0.0.1:8789/ws';
const sleep = ms => new Promise(r => setTimeout(r, ms));
await mkdir(dir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--mute-audio', '--force-color-profile=srgb'] });
const errors = [], captures = [], beats = new Set();
let phone, thumbs;
try {
  const page = await browser.newPage();
  // Parallel foundation updates must not hot-reload a game during capture.
  await page.evaluateOnNewDocument(port => {
    const Socket = window.WebSocket;
    window.WebSocket = new Proxy(Socket, { construct(target, args) {
      if (new URL(args[0], location.href).port === port) return new class extends EventTarget { readyState = 0; send() {} close() {} }();
      return Reflect.construct(target, args);
    } });
  }, new URL(url).port);
  page.on('pageerror', e => errors.push(e.message.replace(/https?:\S+/g, '<url>')));
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setRequestInterception(true);
  page.on('request', request => request.url().includes('/src/config.ts') ? request.respond({ contentType: 'application/javascript', body: `export const config={relayUrl:${JSON.stringify(relay)},controlUrl:'ws://127.0.0.1:8799',debug:true,offline:false};` }) : request.continue());
  await page.goto(url);
  await page.waitForFunction(() => window.__snagTv?.ready && document.fonts.check('27px Rubik'));
  await page.exposeFunction('sceneBBeat', k => beats.add(k));
  await page.evaluate(() => { window.__snagTv.cues(e => window.sceneBBeat(e.cue.k)); window.__snagTv.command({ command: 'reset', speed: 3, seed: 1 }); });
  const code = await page.evaluate(() => window.__snagTv.getView().content.code);
  phone = new WebSocket(relay);
  await new Promise((ok, bad) => { phone.once('open', ok); phone.once('error', bad); });
  const send = m => phone.send(JSON.stringify(m));
  send({ t: 'hello', proto: 1, role: 'phone', code, cid: 'b0000000000000000000000000000001' });
  await sleep(200);
  send({ t: 'msg', m: { t: 'join', name: 'Sock Goblins', color: '#FF4FA0' } });
  await page.waitForFunction(() => window.__snagTv.getView().teams.length === 1);
  // The only images are colored rectangles generated in memory. They go through
  // the production relay thumbnail and photo paths, and are never written out.
  const images = await page.evaluate(() => {
    const jpeg = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#FFF8EC'; x.fillRect(0, 0, w, h); x.fillStyle = '#F23B2E'; x.fillRect(w * .24, h * .16, w * .52, h * .68); x.fillStyle = '#FF736A'; x.fillRect(w * .3, h * .2, w * .1, h * .45); return c.toDataURL('image/jpeg', .8).split(',')[1]; };
    return [jpeg(96, 64), jpeg(720, 720)];
  });
  const binary = (header, base64) => { const h = Buffer.from(JSON.stringify(header)), len = Buffer.alloc(4); len.writeUInt32BE(h.length); phone.send(Buffer.concat([len, h, Buffer.from(base64, 'base64')])); };
  const state = () => page.evaluate(() => { const v = window.__snagTv.getView(); return { scene: v.scene, phase: v.phase, round: v.round, glow: v.content.k === 'hunt' && v.content.glowing, banner: v.content.k === 'judge' && !!v.content.banner, cards: v.content.k === 'judge' ? v.content.cards.map(c => c.stage) : [], missedStage: v.content.k === 'judge' ? v.content.cards.find(c => c.find.missed)?.stage : undefined, feeds: v.feeds.map(f => f.state), complete: v.completed, exceptions: window.__snagTv.exceptions }; });
  const until = async (predicate, limit = 45000) => { const end = Date.now() + limit; while (Date.now() < end) { const s = await state(); if (predicate(s)) return s; if (errors.length) throw new Error(errors.join('; ')); await sleep(35); } throw new Error('Scene state timed out: ' + JSON.stringify(await state())); };
  const shot = async name => { await page.screenshot({ path: resolve(dir, name + '.png') }); captures.push(name); };
  await page.evaluate(() => window.__snagTv.command({ command: 'bots', start: true }));
  await until(s => s.phase === 'hunt');
  thumbs = setInterval(() => binary({ t: 'thumb' }, images[0]), 333);
  await sleep(550); await shot('web-hunt-live');
  // Freeze with the core pause API, without opening a menu; the dial must freeze.
  await page.evaluate(() => window.__snagTv.game.pause());
  const before = await page.$eval('input', e => e.value); await sleep(350); const after = await page.$eval('input', e => e.value);
  if (before !== after) throw new Error('Paused dial changed');
  await page.evaluate(() => window.__snagTv.game.resume());
  binary({ t: 'snag', round: 0, hex: '#F23B2E', match: 96, prompt: 'RED', roundKind: 'color' }, images[1]); clearInterval(thumbs);
  await until(s => s.feeds[0] === 'snagged'); await sleep(200); await shot('web-hunt-snagged');
  await until(s => s.phase === 'glow'); await shot('web-hunt-glowing');
  send({ t: 'msg', m: { t: 'glow', name: 'Ruby Rectangle', brag: 'A proper red letter day.', eyes: [[43, 47], [70, 47]] } });
  await until(s => s.phase === 'judge'); await shot('web-judge-backs');
  await until(s => s.cards.includes('scan')); await sleep(90); await shot('web-judge-scan');
  await until(s => s.banner); await sleep(450); await shot('web-judge-winner');
  await page.evaluate(() => window.__snagTv.command({ command: 'reduced', on: true })); await sleep(80); await shot('web-judge-reduced');
  await page.evaluate(() => window.__snagTv.command({ command: 'reduced', on: false }));
  // Complete this real-photo fixture game and a separate full all-bot game.
  await until(s => s.complete, 90000);
  await page.evaluate(() => window.__snagTv.command({ command: 'reset', speed: 3, seed: 1 }));
  send({ t: 'msg', m: { t: 'join', name: 'Sock Goblins', color: '#FF4FA0' } });
  await page.waitForFunction(() => window.__snagTv.getView().teams.length === 1);
  await page.evaluate(() => window.__snagTv.command({ command: 'bots', start: true }));
  await until(s => s.phase === 'glow'); await shot('web-hunt-missed');
  await until(s => s.missedStage === 'scored'); await shot('web-judge-missed');
  await page.evaluate(() => { window.__snagTv.command({ command: 'reset', speed: 10, seed: 1 }); window.__snagTv.command({ command: 'bots', start: true }); });
  await until(s => s.complete, 90000);
  const receipt = { target: 'web iteration', audio: 'muted', images: 'in-memory synthetic rectangles through relay', captures, beats: [...beats], errors, ...(await state()) };
  if (receipt.exceptions) throw new Error('TV runtime exception');
  await writeFile(resolve(dir, 'web-worker-b.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ complete: receipt.complete, captures: captures.length, exceptions: receipt.exceptions, errors }));
} catch (error) {
  console.error(String(error)); console.error(JSON.stringify({ errors, captures })); process.exitCode = 1;
} finally { clearInterval(thumbs); phone?.close(); await browser.close(); }
