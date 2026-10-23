import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..'), out = resolve(root, 'docs/review/tv-scene-a/web');
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--mute-audio', '--force-color-profile=srgb'] });
const delay = ms => new Promise(r => setTimeout(r, ms));
try {
  const page = await browser.newPage(), errors = [], shots = [], phases = new Set();
  page.on('pageerror', e => errors.push(e.message.replace(/https?:\S+/g, '<url>')));
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(process.env.SCENE_A_URL ?? 'http://127.0.0.1:5184');
  await page.waitForFunction(() => window.__snagTv?.ready && document.fonts.check('27px Rubik'));
  await page.evaluate(() => { const s = window.__snagTv; if (s.control) { s.control.onclose = null; s.control.close(); s.control = undefined; } clearTimeout(s.controlRetry); });
  const command = c => page.evaluate(c => window.__snagTv.command(c), c);
  const reset = async speed => { await command({ command: 'reset', seed: 1, speed }); await command({ command: 'bots', start: true }); };
  await reset(1);
  await page.waitForFunction(() => { const v = window.__snagTv.getView(); return v.scene === 'intro' && v.phase === 'reel' && !v.content.landed; }, { polling: 15 });
  await delay(420);
  await page.evaluate(() => window.__snagTv.game.pause());
  await delay(100);
  const pose = () => page.evaluate(() => { const e = document.querySelector('[data-testid="intro.reel"]'); return { frame: getComputedStyle(e).transform, strip: getComputedStyle(e.querySelector('svg').parentElement.parentElement.parentElement.parentElement).transform, elapsed: window.__snagTv.getView().motion['intro.reel'].at(-1).elapsedMs }; });
  const frozen = await pose(); await delay(550); assert.deepEqual(await pose(), frozen, 'paused reel must stay frozen');
  await page.screenshot({ path: resolve(out, 'paused-reel.png') });
  await page.evaluate(() => window.__snagTv.game.resume());
  await page.waitForFunction(() => window.__snagTv.getView().content.landed, { polling: 15 });
  const captured = new Set();
  const countDeadline = Date.now() + 15000;
  while (Date.now() < countDeadline && !captured.has('count-snag')) {
    const count = await page.evaluate(() => { const s = window.__snagTv, v = s.getView(), m = v.motion['intro.count']?.at(-1); return { text: v.content.k === 'intro' ? v.content.count : undefined, age: m ? s.clock.now() - m.startedAt : -1 }; });
    if (count.text && count.age > 340 && count.age < 700) {
      const name = 'count-' + count.text.replace('GO!', 'snag');
      if (!captured.has(name)) { captured.add(name); await page.screenshot({ path: resolve(out, name + '.png') }); shots.push(name); }
    }
    await delay(20);
  }
  await reset(2);
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const v = window.__snagTv.getView(), c = v.content;
      return { scene: v.scene, phase: v.phase, round: v.round, age: window.__snagTv.clock.now() - v.beatAt, complete: v.completed,
        title: c.k === 'intro' && c.subVisible, landed: c.k === 'intro' && c.landed, count: c.k === 'intro' ? c.count : undefined,
        raced: c.k === 'stand' && c.raced, leader: c.k === 'stand' ? c.leader : undefined };
    });
    phases.add(state.scene + ':' + state.phase);
    let name;
    if (state.scene === 'intro' && state.phase === 'title' && state.title && state.age > 1800) name = 'round-' + (state.round + 1) + '-title';
    if (state.scene === 'intro' && state.phase === 'reel' && state.landed && state.age > 900) name = 'round-' + (state.round + 1) + '-reel';
    if (state.round === 0 && state.scene === 'intro' && state.count && state.age % 760 > 280) name = 'count-' + state.count.replace('GO!', 'snag');
    if (state.scene === 'stand' && state.phase === 'standings' && state.raced && !state.leader) name = 'round-' + (state.round + 1) + '-race';
    if (state.scene === 'stand' && state.phase === 'standings' && state.leader) name = 'round-' + (state.round + 1) + '-stand';
    if (name && !captured.has(name)) { captured.add(name); await page.screenshot({ path: resolve(out, name + '.png') }); shots.push(name); }
    if (state.complete) break;
    await delay(20);
  }
  assert(await page.evaluate(() => window.__snagTv.getView().completed), 'all-bot game must finish');
  for (let r = 1; r <= 3; r++) for (const beat of ['title', 'reel', 'stand']) assert(captured.has(`round-${r}-${beat}`), `missing round ${r} ${beat}`);
  for (const count of ['3', '2', '1', 'snag']) assert(captured.has('count-' + count), 'missing countdown ' + count);
  await command({ command: 'reduced', on: true }); await reset(5);
  await page.waitForFunction(() => { const v = window.__snagTv.getView(); return v.scene === 'stand' && v.content.leader; }, { timeout: 80000, polling: 15 });
  await page.screenshot({ path: resolve(out, 'reduced-stand.png') });
  const lanes = await page.evaluate(() => {
    const v = window.__snagTv.getView(), c = v.content;
    return c.ranking.map((id, i) => { const e = document.querySelector('[data-testid="lane:' + id + '"]'), fill = document.querySelector('[data-testid="lane-fill:' + id + '"]'); return { rank: i, top: e.getBoundingClientRect().top, fillWidth: fill.getBoundingClientRect().width }; });
  });
  assert(lanes.every((l, i) => i === 0 || l.top > lanes[i - 1].top), 'reduced motion must retain final ranking');
  assert(lanes.some(l => l.fillWidth > 600), 'reduced motion must retain score bar lengths');
  assert.equal(await page.evaluate(() => window.__snagTv.exceptions), 0); assert.deepEqual(errors, []);
  const receipt = { target: 'Chrome web iteration', audio: 'muted', photos: 'three bots; no photo or thumbnail loaded', completed: true, pauseFrozen: true,
    reducedMotionRankingAndBars: true, phases: [...phases], shots, exceptions: errors, chrome: await browser.version() };
  await writeFile(resolve(out, 'verification.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ completed: true, pauseFrozen: true, reducedMotionRankingAndBars: true, captures: shots.length, exceptions: errors.length }));
} finally { await browser.close(); }
