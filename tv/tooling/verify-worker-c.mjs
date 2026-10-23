import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { memoryPhone } from './worker-c-fixtures.mjs';

const root = resolve(import.meta.dirname, '../..'), dir = resolve(root, 'docs/review/tv-worker-c');
const url = process.env.SCENE_C_URL ?? 'http://127.0.0.1:5176';
const synthetic = process.argv[2] === 'synthetic';
const speed = Number(process.env.SCENE_C_SPEED ?? 4);
await mkdir(dir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--mute-audio', '--force-color-profile=srgb'] });
const wait = ms => new Promise(done => setTimeout(done, ms));
let phone;
try {
  const page = await browser.newPage(), errors = [], scenes = new Set(), captures = new Set(), states = [];
  page.on('pageerror', error => errors.push(error.message.replace(/https?:\S+/g, '<url>')));
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(url);
  await page.waitForFunction(() => window.__snagTv?.ready && document.fonts.check('27px Rubik'), { timeout: 30000 });
  // Web iteration is local to this page. Shared VVD controls must not reset it.
  await page.evaluate(() => { const s = window.__snagTv; s.stopped = true; clearTimeout(s.controlRetry); s.control?.close(); });
  await page.evaluate(speed => window.__snagTv.command({ command: 'reset', speed, seed: 1 }), speed);
  if (synthetic) {
    const code = await page.evaluate(() => window.__snagTv.getView().content.code);
    phone = await memoryPhone(page, code, speed);
  }
  await page.evaluate(() => window.__snagTv.command({ command: 'bots', start: true }));
  const end = Date.now() + 180000;
  while (Date.now() < end) {
    // Only explicit metadata is serialized. Never serialize image-bearing snapshots.
    const state = await page.evaluate(() => {
      const s = window.__snagTv, v = s.getView(), c = v.content, elapsed = s.clock.now() - v.beatAt;
      return { scene: v.scene, phase: v.phase, elapsed, complete: v.completed, paused: v.paused,
        line: c.k === 'brag' ? c.match.lineSide : null, winner: 'winner' in c && !!c.winner,
        heroElapsed: v.motion['show.crown']?.at(-1)?.elapsedMs ?? 0,
        object: c.k === 'champ' && c.objectVisible, exceptions: s.exceptions };
    });
    scenes.add(state.scene);
    let name;
    if (state.scene === 'brag' && state.phase === 'brag-lines' && state.line === 1 && state.elapsed > 1900) name = 'web-brag-lines';
    if (state.scene === 'brag' && state.phase === 'mash' && state.elapsed > 2000) name = 'web-brag-mash';
    if (state.scene === 'brag' && state.phase === 'knockout' && state.elapsed > 1200) name = 'web-brag-knockout';
    if (state.scene === 'show' && state.phase === 'vote' && state.elapsed > 1500) name = 'web-show-vote';
    if (state.scene === 'show' && state.winner && state.heroElapsed > 1200) name = 'web-show-win';
    if (state.scene === 'champ' && state.object && state.complete) name = 'web-champ';
    if (name && !captures.has(name)) {
      await page.screenshot({ path: resolve(dir, name + '.png') });
      captures.add(name); states.push({ name, ...state });
    }
    if (state.complete) break;
    await wait(25);
  }
  const final = await page.evaluate(() => ({ completed: window.__snagTv.getView().completed, exceptions: window.__snagTv.exceptions }));
  await page.evaluate(() => window.__snagTv.command({ command: 'reduced', on: true }));
  await wait(150); await page.screenshot({ path: resolve(dir, 'web-champ-reduced.png') });
  await page.evaluate(() => window.__snagTv.game.pause());
  await wait(120); await page.screenshot({ path: resolve(dir, 'web-pause-menu.png') });
  const pausedAt = await page.evaluate(() => window.__snagTv.getView().motion['champ.trophy']?.at(-1)?.elapsedMs);
  await wait(200);
  const pausedAgain = await page.evaluate(() => window.__snagTv.getView().motion['champ.trophy']?.at(-1)?.elapsedMs);
  if (pausedAt !== pausedAgain) throw new Error('Core motion changed while paused');
  const edgeCases = [];
  // Frozen, synthetic renderer fixtures exercise dropouts without adding a game
  // state machine or debug action to production. The all-rounds core run is above.
  await page.evaluate(async () => { const s = window.__snagTv; s.game.dispose(); s.fixtureBase = s.getView(); const { particleEngine } = await import('/src/stage/particles.ts'); particleEngine.clear(); });
  for (const count of [3, 2, 1, 0]) {
    const bounds = await page.evaluate(async n => {
      const s = window.__snagTv, base = s.fixtureBase;
      const finds = base.feeds.filter(feed => feed.find && !feed.find.missed).slice(0, n).map(feed => feed.find);
      s.view = { ...base, scene: 'show', phase: 'runway', backgroundMood: 'tension', paused: true, menu: null, motion: {}, host: { ...base.host, visible: false }, content: { k: 'show', pedestals: finds.map((find, i) => ({ find, visible: true, spotlight: .25, voters: i === 0 && n > 1 ? [finds[1].team] : [] })), voting: false, holographic: false, crown: false } };
      s.notify(); await new Promise(done => setTimeout(done, 150));
      const { anchors } = await import('/src/stage/context.tsx');
      const blocks = finds.map(find => anchors.get('pedestal:' + find.team));
      const vote = n > 1 ? anchors.get('vote-badge:' + finds[0].team + ':' + finds[1].team) : undefined;
      return { count: n, centered: !n || Math.abs((blocks[0].x + blocks.at(-1).x + 272) / 2 - 640) < .01, voteInStageSpace: !vote || Math.abs(vote.x + vote.width / 2 - (blocks[0].x + 136)) < .01 && vote.y === 460 };
    }, count);
    await page.screenshot({ path: resolve(dir, 'web-show-' + count + '-finds.png') }); edgeCases.push(bounds);
  }
  await page.evaluate(() => {
    const s = window.__snagTv, base = s.fixtureBase, left = base.teams[0], right = base.teams[1];
    s.view = { ...base, scene: 'brag', phase: 'knockout', backgroundMood: 'normal', paused: true, menu: null, motion: {}, host: { ...base.host, visible: false }, content: { k: 'brag', match: { left: left.id, right: right.id, kicker: 'SEMI-FINAL', points: 100, final: false, p: 0, taps: {}, bye: left.id, winner: left.id } } }; s.notify();
  });
  await wait(160); await page.screenshot({ path: resolve(dir, 'web-brag-bye.png') });
  if (edgeCases.some(state => !state.centered || !state.voteInStageSpace)) throw new Error('Dropout pedestal/flight layout failed');
  const receipt = { target: 'Chrome web iteration', url, audio: 'muted', privacy: synthetic ? 'Synthetic objects through the memory-only relay photo path' : 'All bots; no player photographs or thumbnails', synthetic: phone?.counts(), ...final, pauseFrozen: pausedAt === pausedAgain, edgeCases, scenes: [...scenes], captures: [...captures], states, errors };
  await writeFile(resolve(dir, synthetic ? 'web-synthetic-check.json' : 'web-check.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ ...final, scenes: receipt.scenes, captures: receipt.captures, errors }));
  if (!final.completed || final.exceptions || errors.length || captures.size !== 6 || synthetic && (phone.counts().photos !== 3 || phone.counts().wireErrors.length)) throw new Error('Worker C web acceptance failed');
} finally { phone?.stop(); await browser.close(); }
