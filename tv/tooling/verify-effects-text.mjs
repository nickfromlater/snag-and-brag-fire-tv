// Real web stage, normal-speed mock Polly and all-bot art; no player media.
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const mode = process.argv[2]; if (!['before', 'after'].includes(mode)) throw new Error('Use before or after');
const health = await fetch(process.env.TV_EFFECTS_HEALTH_URL ?? 'http://127.0.0.1:8787/healthz').then(r => r.json());
if (health.aiMode !== 'mock' || health.pollyMode !== 'mock') throw new Error('Effects capture requires a local mock relay');
const output = resolve(import.meta.dirname, '../../docs/review/tv/polish1/effects'); await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--force-color-profile=srgb', '--disable-background-timer-throttling'] });
const wait = ms => new Promise(ok => setTimeout(ok, ms)), captures = [], records = [], errors = [];
const selection = process.env.TV_EFFECTS_CASE;
const cases = [
  { name: 'intro-slam', hold: 330, matches: v => v.content.k === 'intro' && v.round === 0 && v.content.titleVisible },
  { name: 'judge-banner', hold: 280, matches: v => v.content.k === 'judge' && v.content.banner && v.content.crown },
  { name: 'brag-knockout', hold: 330, matches: v => v.content.k === 'brag' && v.phase === 'knockout' && v.motion['brag.ko']?.length && v.content.match.winner && !v.content.match.bye },
  { name: 'show-holography', hold: 400, matches: v => v.content.k === 'show' && v.content.holographic && v.content.crown },
  { name: 'champ-fireworks', hold: 1100, matches: v => v.content.k === 'champ' && v.content.name && v.content.objectVisible },
].filter(c => !selection || c.name === selection);
if (!cases.length) throw new Error('Unknown capture case');
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  // Isolate this read/capture game from observers testing the native target.
  await page.evaluateOnNewDocument(() => {
    const Socket = window.WebSocket;
    window.WebSocket = class extends Socket {
      constructor(url, protocols) { super(String(url).replace(/127\.0\.0\.1:(?:8790|8869)/, '127.0.0.1:58995'), protocols); }
    };
  });
  page.on('pageerror', e => errors.push(e.name));
  page.on('console', m => { if (!m.text().startsWith('[TV] ')) return; try { records.push(JSON.parse(m.text().slice(5))); } catch {} });
  await page.goto(process.env.TV_WEB_URL ?? 'http://127.0.0.1:5187');
  await page.waitForFunction(() => window.__snagTv?.ready && document.fonts.check('27px Rubik'), { timeout: 30000 });
  await page.evaluate(() => window.__snagTv.command({ command: 'reset', speed: 1, seed: 1 }));
  const until = async (fn, ms, label) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return; if (errors.length || records.some(r => r.kind === 'exception')) throw new Error('Web exception'); await wait(50); } throw new Error(label + ' timed out'); };
  const finished = trigger => { const line = records.findLast(r => r.kind === 'voice-line' && r.trigger === trigger); return line && records.some(r => r.kind === 'voice-complete' && r.lineSeq === line.lineSeq); };
  await until(() => finished('lobby.open'), 20000, 'greeting');
  await page.evaluate(() => window.__snagTv.command({ command: 'bots', start: false }));
  await until(() => finished('lobby.ready'), 20000, 'teams greeting');
  await page.evaluate(() => window.__snagTv.command({ command: 'start' }));
  const seen = new Set(), scenes = new Set(), end = Date.now() + 600000;
  let complete = false;
  while (Date.now() < end) {
    const v = await page.evaluate(() => window.__snagTv.getView()); scenes.add(v.scene);
    if (errors.length || v.teams.some(t => !t.bot)) throw new Error('Capture must be all-bot, without browser errors');
    for (const c of cases) if (!seen.has(c.name) && c.matches(v)) {
      seen.add(c.name); await wait(c.hold);
      const at = await page.evaluate(() => { const s = window.__snagTv, v = s.getView(); return { scene: v.scene, phase: v.phase, round: v.round, paused: v.paused, speed: s.clock.speed, exceptions: s.exceptions }; });
      if (at.scene !== v.scene || at.speed !== 1 || at.paused || at.exceptions) throw new Error('Capture missed a normal-speed beat');
      const file = mode + '-' + c.name + '.png'; await page.screenshot({ path: resolve(output, file) });
      captures.push({ name: c.name, screenshot: 'docs/review/tv/polish1/effects/' + file, ...at }); console.log(mode + ' ' + c.name);
    }
    if (v.completed) { complete = true; break; }
    if (selection && captures.length === cases.length) break;
    await wait(40);
  }
  const pass = (complete || !!selection) && captures.length === cases.length && errors.length === 0 && !records.some(r => r.kind === 'exception' || r.kind === 'audio-error');
  await writeFile(resolve(output, mode + (selection ? '-' + selection : '') + '.json'), JSON.stringify({ pass, verifiedAt: new Date().toISOString(), mode, speed: 1, mockPolly: true, allBots: true, muted: true, complete, captureOnly: !!selection, scenes: [...scenes], captures, errors,
    pollyLines: records.filter(r => r.kind === 'voice-line' && r.path === 'polly').length, fallbackLines: records.filter(r => r.kind === 'voice-line' && r.path === 'blips').length }, null, 2) + '\n');
  if (!pass) throw new Error('Incomplete effects capture');
  console.log(JSON.stringify({ pass, mode, captures: captures.length, scenes: scenes.size }));
} finally { await browser.close(); }
process.exit(0);
