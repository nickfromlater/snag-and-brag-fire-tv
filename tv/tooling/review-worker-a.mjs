import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Worker A's web review. Always reset to bot-only content before any capture.
const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, 'docs/review/tv-worker-a-web');
const url = process.env.TV_WEB_URL ?? 'http://127.0.0.1:5175';
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--mute-audio', '--force-color-profile=srgb'],
});
const errors = [], captures = [], phases = new Set(), seen = new Set(), leaderSeenAt = new Map();
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message.replace(/https?:\S+/g, '<url>')));
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(url);
  await page.waitForFunction(() => window.__snagTv?.ready && document.fonts.check('30px Rubik'), { timeout: 30000 });
  await page.evaluate(async () => {
    const session = window.__snagTv;
    // Detach this review tab from the shared VVD control broadcast. Other workers
    // may reset the native app while this independent web game is running.
    if (session.control) { session.control.onclose = null; session.control.close(); session.control = undefined; }
    clearTimeout(session.controlRetry);
    // Use the exact Vite module URL already loaded by the app, including its
    // version query, so the probe instruments the running engine instance.
    const audioModule = performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === '/src/stage/audio.ts')?.name;
    if (!audioModule) throw new Error('The app audio module is not loaded');
    const { AudioEngine } = await import(audioModule);
    const play = AudioEngine.prototype.play;
    window.__workerARollAudit = { expected: 0, calls: 0, cues: 0 };
    window.__workerABadgeAudit = [];
    AudioEngine.prototype.play = function (name, args) {
      if (name === 'rollTick') window.__workerARollAudit.calls++;
      return play.call(this, name, args);
    };
    session.cues(event => {
      if (event.cue.k === 'roll') {
        window.__workerARollAudit.cues++;
        window.__workerARollAudit.expected += Math.ceil(event.cue.durationMs / event.cue.tickMs);
      }
      if (event.cue.k === 'animate' && event.cue.target === 'lane-badge:cp') {
        const audit = { round: event.round, expected: event.cue.iterations, hops: 0, samples: 0 };
        window.__workerABadgeAudit.push(audit);
        const duration = event.cue.durationMs * event.cue.iterations / session.clock.speed;
        const start = performance.now(); let down = false;
        const interval = setInterval(() => {
          const node = document.querySelector('[data-testid="lane-badge:cp"]');
          const y = node ? new DOMMatrix(getComputedStyle(node).transform).m42 : 0;
          if (y < -6 && !down) { audit.hops++; down = true; }
          else if (y >= -6) down = false;
          audit.samples++;
          if (performance.now() - start > duration + 80) clearInterval(interval);
        }, 12);
      }
    });
    session.command({ command: 'reset', speed: 2, seed: 1 });
    session.command({ command: 'bots', start: true });
  });
  const end = Date.now() + 150000;
  let completed = false;
  while (Date.now() < end) {
    // Select fields explicitly. Never serialize a TvView, feed, thumbnail or photo.
    const state = await page.evaluate(() => {
      const session = window.__snagTv, view = session.getView(), c = view.content;
      const age = target => {
        const motion = view.motion[target]?.at(-1);
        return motion ? session.clock.now() - motion.startedAt : -1;
      };
      return {
        scene: view.scene, phase: view.phase, round: view.round,
        completed: view.completed, exceptions: session.exceptions,
        botsOnly: view.teams.every(t => t.bot),
        title: c.k === 'intro' && view.phase === 'title' && c.titleVisible && c.subVisible && age('intro.sub') > 600,
        reel: c.k === 'intro' && c.landed && view.phase === 'reel' && session.clock.now() - view.beatAt > 500,
        count: c.k === 'intro' ? c.count : undefined,
        countAge: c.k === 'intro' ? age('intro.count') : -1,
        race: c.k === 'stand' && view.phase === 'standings' && c.raced && !c.reordered && age('lane-fill:' + view.teams[0]?.id) > 600,
        settled: c.k === 'stand' && view.phase === 'standings' && !!c.leader,
      };
    });
    if (!state.botsOnly) throw new Error('Review requires bot-only content');
    phases.add(state.scene + ':' + state.phase);
    if (state.settled && !leaderSeenAt.has(state.round)) leaderSeenAt.set(state.round, Date.now());
    let name;
    if (state.title) name = 'round-' + (state.round + 1) + '-title';
    else if (state.reel) name = 'round-' + (state.round + 1) + '-reel';
    else if (state.round === 0 && state.countAge > 300 && state.countAge < 560 && state.count) name = 'count-' + (state.count === 'GO!' ? 'snag' : state.count);
    else if (state.race && state.round === 0) name = 'stand-race';
    else if (state.settled && state.round < 3 && Date.now() - leaderSeenAt.get(state.round) > 350) name = 'round-' + (state.round + 1) + '-stand';
    if (name && !seen.has(name)) {
      seen.add(name);
      const spelling = name === 'count-snag' ? await page.evaluate(async () => {
        const { glyphCache } = await import('/src/stage/glyphs.ts');
        const expected = glyphCache.get('SNAG!', 250, 1).d;
        return [...document.querySelectorAll('path')].some(p => p.getAttribute('d') === expected && p.getAttribute('fill') === '#B8F23B');
      }) : undefined;
      await page.screenshot({ path: resolve(output, name + '.png') });
      captures.push({ name, scene: state.scene, phase: state.phase, round: state.round, snagCorrect: spelling });
      console.log(name);
    }
    if (state.completed) { completed = true; break; }
    await new Promise(r => setTimeout(r, 35));
  }
  const scoreRollSound = await page.evaluate(() => window.__workerARollAudit);
  const badgeHops = await page.evaluate(() => window.__workerABadgeAudit);
  const receipt = {
    target: 'Chrome web iteration; native acceptance is separate',
    resolution: '1920x1080', audio: 'muted', photos: 'three bots only; none loaded',
    speed: 2, seed: 1, completed, phases: [...phases], captures, scoreRollSound, badgeHops, errors,
  };
  await writeFile(resolve(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  const snag = captures.find(c => c.name === 'count-snag');
  console.log(JSON.stringify({ completed, captures: captures.length, snagCorrect: snag?.snagCorrect, scoreRollSound, badgeHops, exceptions: errors.length }));
  if (!completed || errors.length || !snag?.snagCorrect || !scoreRollSound?.cues || scoreRollSound.calls !== scoreRollSound.expected || !badgeHops.length || badgeHops.some(h => h.hops !== h.expected)) throw new Error('Worker A web review failed; see receipt.json');
} finally {
  await browser.close();
}
