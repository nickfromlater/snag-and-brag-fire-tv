// Worker C acceptance harness. Persist only filtered receipts and synthetic captures.
import puppeteer from 'puppeteer-core';
import { WebSocket } from 'ws';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
const root = resolve(import.meta.dirname, '../..'), output = resolve(root, 'docs/review/worker-c');
const mode = process.argv[2] ?? 'web', url = process.env.WORKER_C_WEB_URL ?? 'http://127.0.0.1:5174';
const relay = process.env.WORKER_C_RELAY_URL ?? 'ws://127.0.0.1:8787/ws';
const wait = ms => new Promise(ok => setTimeout(ok, ms));
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--mute-audio', '--force-color-profile=srgb'] });

// Canvas generates three artificial objects in memory. JPEG bytes never touch disk.
async function syntheticJpegs(page) {
  const data = await page.evaluate(() => [0, 1, 2].map(i => {
    const c = document.createElement('canvas'); c.width = c.height = 720; const x = c.getContext('2d');
    x.fillStyle = '#FFF8EC'; x.fillRect(0, 0, 720, 720);
    x.fillStyle = ['#F23B2E', '#3FE0D0', '#FFD43B'][i]; x.strokeStyle = '#0E0B2B'; x.lineWidth = 20;
    x.beginPath(); x.roundRect(190, 190, 290, 350, 40); x.fill(); x.stroke();
    x.beginPath(); x.arc(490, 310, 90, -Math.PI / 2, Math.PI / 2); x.stroke();
    x.fillStyle = '#FFFFFF'; x.beginPath(); x.roundRect(220, 220, 30, 180, 15); x.fill();
    return c.toDataURL('image/jpeg', .8).split(',')[1];
  }));
  return data.map(s => Buffer.from(s, 'base64'));
}
async function phone(code, jpegs, speed = 1) {
  const health = await fetch(new URL('/healthz', relay.replace(/^ws/, 'http'))).then(r => r.json());
  if (health.aiMode !== 'mock' || health.pollyMode !== 'mock') throw new Error('Acceptance requires the local mock relay');
  const ws = new WebSocket(relay), cid = randomBytes(16).toString('hex'); let screen, taps, stopped = false;
  const captured = new Set(), sent = new Set(), glowed = new Set(), voted = new Set();
  const states = [], errors = [];
  const send = m => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'msg', m })); };
  const ready = new Promise((ok, bad) => {
    ws.on('error', () => bad(new Error('Synthetic phone connection failed')));
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', proto: 1, role: 'phone', code, cid })));
    ws.on('message', bytes => {
      let m; try { m = JSON.parse(String(bytes)); } catch { return; }
      if (m.t === 'error') { errors.push(m.code); return; }
      if (m.t === 'welcome') send({ t: 'join', name: 'Sock Goblins', color: '#FF4FA0' });
      if (m.t !== 'msg' || m.m.t !== 'screen') return;
      screen = m.m;
      if (screen.me) ok();
      const state = `${screen.round}:${screen.s.k}:${screen.paused}`;
      if (states.at(-1) !== state) states.push(state);
      if (screen.paused) return;
      const s = screen.s;
      if (s.k === 'cam' && !captured.has(screen.round)) {
        captured.add(screen.round); const round = screen.round;
        setTimeout(() => {
          if (stopped || screen.round !== round || screen.s.k !== 'cam') return;
          const header = Buffer.from(JSON.stringify({ t: 'snag', round, hex: ['#F23B2E', '#3FE0D0', '#FFD43B'][round], match: 88, prompt: [screen.prompt?.a, screen.prompt?.b, screen.prompt?.c].filter(Boolean).join(' '), roundKind: ['color', 'brag', 'show'][round] }));
          const n = Buffer.alloc(4); n.writeUInt32BE(header.length); ws.send(Buffer.concat([n, header, jpegs[round]]));
          sent.add(round);
        }, 50);
      }
      if (s.k === 'glow' && !glowed.has(screen.round)) { glowed.add(screen.round); setTimeout(() => send({ t: 'glow', eyes: [[43, 44], [70, 44]], name: 'Captain Cup', brag: 'Handle with care. I was born for this.' }), 2000 / speed); }
      if (s.k === 'vote' && !voted.has(screen.round)) { const target = s.options.find(f => f.team !== screen.me.id); if (target) { voted.add(screen.round); send({ t: 'vote', team: target.team }); } }
    });
  });
  taps = setInterval(() => {
    if (screen?.paused || screen?.s.k !== 'mash' || screen.s.phase !== 'mash') return;
    const s = screen.s, side = s.left.team.id === screen.me.id ? -1 : s.right.team.id === screen.me.id ? 1 : -1;
    send({ t: 'tap', n: Math.max(1, Math.round(speed)), side });
  }, 100);
  const timeout = setTimeout(() => ws.close(), 15000);
  try { await ready; } finally { clearTimeout(timeout); }
  return { stop() { stopped = true; clearInterval(taps); ws.close(); }, counts() { return { photos: sent.size, photoRounds: [...sent], cameras: [...captured], glows: glowed.size, votes: voted.size, states, errors }; } };
}

const captureCases = [
  ['brag-lines', v => v.content.k === 'brag' && v.content.match.lineSide === 1],
  ['brag-mash', v => v.content.k === 'brag' && v.phase === 'mash' && Object.values(v.content.match.taps).some(n => n >= 3)],
  ['brag-knockout', v => v.content.k === 'brag' && v.phase === 'knockout' && !!v.content.match.winner && !v.content.match.bye],
  ['show-vote', v => v.content.k === 'show' && v.phase === 'vote'],
  ['show-win', v => v.content.k === 'show' && !!v.content.winner],
  ['champ-finale', v => v.content.k === 'champ' && v.content.objectVisible && v.content.fourth],
];
async function web(page) {
  const errors = [], photoResponses = [], captured = new Set(), scenes = new Set();
  // Native workers share 8790. Keep their acceptance commands out of this web game.
  await page.evaluateOnNewDocument(() => {
    const Socket = window.WebSocket;
    window.WebSocket = class extends Socket {
      constructor(address, protocols) { super(String(address).replace('127.0.0.1:8790', '127.0.0.1:58995'), protocols); }
    };
  });
  page.on('pageerror', () => errors.push('pageerror'));
  page.on('console', m => {
    const prefix = '[TV] '; if (!m.text().startsWith(prefix)) return;
    try { const r = JSON.parse(m.text().slice(prefix.length)); if (r.kind === 'relay-error') errors.push(r.code); } catch {}
  });
  page.on('response', r => { if (new URL(r.url()).pathname.startsWith('/p/')) photoResponses.push(r.status()); });
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(url); await page.waitForFunction(() => window.__snagTv?.ready && document.fonts.check('27px Rubik'), { timeout: 30000 });
  const jpegs = await syntheticJpegs(page);
  const speed = Number(process.env.WORKER_C_SPEED ?? 1);
  await page.evaluate(speed => window.__snagTv.command({ command: 'reset', speed, seed: 1 }), speed);
  const code = await page.evaluate(() => window.__snagTv.getView().content.code), p = await phone(code, jpegs, speed);
  try {
    await page.evaluate(() => window.__snagTv.command({ command: 'bots', start: true }));
    const end = Date.now() + 540000 / speed;
    let previous;
    while (Date.now() < end) {
      const state = await page.evaluate(() => {
        const v = window.__snagTv.getView(); return { scene: v.scene, phase: v.phase, complete: v.completed, content: v.content, exceptions: window.__snagTv.exceptions };
      });
      scenes.add(state.scene);
      if (state.scene !== previous) { console.log('Web scene ' + state.scene); previous = state.scene; }
      for (const [name, match] of captureCases) if (!captured.has(name) && match(state)) {
        // Let the current hero animation settle in game time, then freeze the core cleanly.
        const hold = (name.endsWith('knockout') ? 1200 : name === 'show-win' ? 1000 : name === 'champ-finale' ? 1400 : 480) / speed;
        await wait(hold); await page.evaluate(() => {
          const s = window.__snagTv; s.game.pause();
          // Hide only the debug capture menu in this detached renderer snapshot.
          s.view = { ...s.getView(), menu: null }; s.notify();
        }); await wait(80);
        await page.screenshot({ path: resolve(output, 'web-' + name + '.png') });
        await page.evaluate(() => window.__snagTv.game.resume()); captured.add(name);
        console.log('Captured web ' + name);
      }
      if (state.complete) break;
      await wait(65);
    }
    const final = await page.evaluate(() => { const v = window.__snagTv.getView(); return { complete: v.completed, teams: v.teams.length, exceptions: window.__snagTv.exceptions }; });
    const receipt = { target: 'Chrome iteration', speed, audio: 'muted', ...final, scenes: [...scenes], captures: [...captured], synthetic: p.counts(), photoResponses, errors };
    await writeFile(resolve(output, 'web-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify(receipt));
    if (!final.complete || final.exceptions || errors.length || captured.size !== captureCases.length || p.counts().photos !== 3) throw new Error('Worker C web acceptance failed');
  } finally { p.stop(); }
}

try {
  const page = await browser.newPage();
  if (mode !== 'web') throw new Error('Use web; the shared native harness is verify-worker-c-native.mjs');
  await web(page);
} finally { await browser.close(); }
