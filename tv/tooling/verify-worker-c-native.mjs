import puppeteer from 'puppeteer-core';
import { WebSocketServer, WebSocket } from 'ws';
import { mkdir, readFile, writeFile, mkdtemp, readdir, copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { memoryPhone } from './worker-c-fixtures.mjs';

const root = resolve(import.meta.dirname, '../..'), dir = resolve(root, 'docs/review/tv-worker-c');
const lock = resolve(process.env.HOME, '.snag-vvd.lock/owner');
const assertLock = async () => { if (!(await readFile(lock, 'utf8')).includes('TV scene Worker C')) throw new Error('Acquire the Worker C VVD lock first'); };
await assertLock(); await mkdir(dir, { recursive: true });
const wait = ms => new Promise(done => setTimeout(done, ms));
const run = (cmd, args) => new Promise((done, fail) => {
  const process = spawn(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }); let output = '';
  process.stdout.on('data', bytes => { output = (output + bytes).slice(-1400); });
  process.stderr.on('data', bytes => { output = (output + bytes).slice(-1400); });
  process.on('error', fail); process.on('exit', code => code === 0 ? done(output) : fail(new Error(output)));
});
const consoleCommand = async command => {
  await assertLock();
  const output = await run('python3', ['spike/tooling/capture.py', command]);
  if (output.includes('KO:')) throw new Error(output);
  return output;
};

// Device tcp:8790 is reversed to this private port. Worker B uses 8794, so
// keep Worker C separate and permit an explicit override for future sessions.
const controlPort = Number(process.env.SCENE_C_NATIVE_PORT ?? 8796);
const server = new WebSocketServer({ host: '127.0.0.1', port: controlPort });
let device, latest, recording, phone;
const encodedClips = [];
let records = [];
const fields = new Set(['kind', 'seq', 'at', 'round', 'cue', 'target', 'trigger', 'phase', 'from', 'scene', 'cues', 'exceptions', 'teams', 'completed', 'paused', 'hermes', 'ready', 'loaded', 'fontError', 'source', 'code', 'connected']);
server.on('connection', ws => {
  device = ws;
  ws.on('message', bytes => {
    let message; try { message = JSON.parse(String(bytes)); } catch { return; }
    const safe = Object.fromEntries(Object.entries(message).filter(([key, value]) => fields.has(key) && (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string' && value.length < 160 && !/https?:|data:|roomkey|tvkey/i.test(value))));
    if (safe.kind) records.push({ ...safe, receivedAt: Date.now() });
    if (safe.kind === 'snapshot') latest = safe;
  });
});
const send = command => { if (device?.readyState !== WebSocket.OPEN) throw new Error('Native control disconnected'); device.send(JSON.stringify(command)); };
const until = async (test, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (test()) return; await wait(60); } throw new Error('Native acceptance timed out'); };
const snapshot = async () => { const before = latest; send({ command: 'snapshot' }); await until(() => latest !== before, 5000); return latest; };
const quiet = async () => {
  if (process.env.SCENE_C_NATIVE_QUIET !== 'true') return;
  for (const key of ['select', 'down', 'down', 'select', 'down', 'select', 'back']) { send({ command: 'remote', key }); await wait(40); }
};
const shot = async name => {
  const folder = await mkdtemp(resolve(tmpdir(), 'snag-worker-c-shot-'));
  try {
    await consoleCommand('screenrecord screenshot ' + folder);
    const files = (await readdir(folder)).filter(file => file.endsWith('.png'));
    if (files.length !== 1) throw new Error('VVD did not produce one fresh screenshot');
    await copyFile(resolve(folder, files[0]), resolve(dir, name + '.png'));
  } finally { await rm(folder, { recursive: true, force: true }); }
  console.log('Captured ' + name);
};
const finishClip = async () => {
  if (!recording) return;
  const name = recording; recording = undefined;
  await consoleCommand('screenrecord stop');
  encodedClips.push(name);
  console.log('Recorded native ' + name);
};
const beginClip = async name => {
  if (recording === name) return;
  await finishClip(); recording = name;
  await consoleCommand('screenrecord start --size 1920x1080 --bit-rate 8M --fps 60 ' + resolve(dir, 'native-' + name + '.raw.mp4'));
};

console.log('Worker C native acceptance waiting on private control port ' + controlPort);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--mute-audio'] });
try {
  const page = await browser.newPage();
  await assertLock();
  await run('/bin/zsh', ['-c', 'set -e\nosascript -e \'set volume output muted true\'\nsource ~/vega/env\nvega device list\nvega exec vda reverse tcp:8787 tcp:8787\nvega exec vda reverse tcp:8790 tcp:' + controlPort + '\nvega device install-app --packagePath tv/build/private/kepler/tv/undefined/vega/aarch64/Release/tv_aarch64.vpkg\nvega device terminate-app --appName com.snagbrag.tv.main || true\nvega device launch-app --appName com.snagbrag.tv.main']);
  try {
    await until(() => device?.readyState === WebSocket.OPEN && records.some(r => r.kind === 'bootstrap' && r.ready && r.loaded), 60000);
  } catch (error) {
    await writeFile(resolve(dir, 'native-startup.json'), JSON.stringify(records.filter(r => r.kind !== 'cue'), null, 2) + '\n');
    throw error;
  }
  const fastSpeed = Number(process.env.SCENE_C_NATIVE_SPEED ?? 10);
  records = []; send({ command: 'reduced', on: process.env.SCENE_C_NATIVE_REDUCED === 'true' }); send({ command: 'reset', speed: fastSpeed, seed: 1 }); await wait(200); await quiet(); send({ command: 'bots', start: true });
  const heartbeat = setInterval(() => { if (device?.readyState === WebSocket.OPEN) send({ command: 'snapshot' }); }, 1000);
  try { await until(() => records.some(r => r.kind === 'complete'), 180000); } finally { clearInterval(heartbeat); }
  const complete = records.find(r => r.kind === 'complete'); await snapshot(); await wait(500); await shot('native-all-bots-finale');
  const cues = records.filter(r => r.kind === 'cue' && r.seq <= complete.cues).sort((a, b) => a.seq - b.seq);
  const contiguous = cues.length === complete.cues && cues.every((cue, i) => cue.seq === i + 1), scenes = [...new Set(cues.filter(c => c.cue === 'scene').map(c => c.scene))];
  const allBots = { target: 'VVD aarch64 Release', speed: fastSpeed, reducedProbe: process.env.SCENE_C_NATIVE_REDUCED === 'true', quietProbe: process.env.SCENE_C_NATIVE_QUIET === 'true', audio: 'muted', privacy: 'All bots; no photographs', complete, scenes, contiguousCues: contiguous, snapshot: latest };
  await writeFile(resolve(dir, 'native-all-bots.json'), JSON.stringify(allBots, null, 2) + '\n');
  if (complete.exceptions || records.some(r => r.kind === 'exception') || !contiguous || !['brag', 'show', 'champ'].every(scene => scenes.includes(scene))) throw new Error('Native all-bot game failed');
  console.log('Full native all-bot game completed with zero exceptions');
  if (process.env.SCENE_C_NATIVE_SMOKE === 'true') { await writeFile(resolve(dir, 'native-runtime.jsonl'), records.map(record => JSON.stringify(record)).join('\n') + '\n'); device?.close(); await browser.close(); server.close(); process.exit(0); }

  records = []; send({ command: 'reset', speed: 1, seed: 1 }); await wait(300);
  const lobby = await snapshot(); phone = await memoryPhone(page, lobby.code, 1); await quiet(); send({ command: 'bots', start: true });
  const captured = new Set(), clips = new Set(); let lastSkip = 0, lastScene;
  const end = Date.now() + 480000;
  while (Date.now() < end) {
    const state = await snapshot();
    const target = ['brag', 'show', 'champ'].includes(state.scene) ? state.scene : undefined;
    // The scene cue precedes the wipe swap; start recording before the first entrance.
    const upcoming = records.filter(r => r.kind === 'cue' && r.cue === 'scene').at(-1)?.scene;
    if (['brag', 'show', 'champ'].includes(upcoming) && !clips.has(upcoming) && recording !== upcoming) await beginClip(upcoming);
    if (recording && target !== recording && lastScene === recording) { clips.add(recording); await finishClip(); }
    lastScene = state.scene;
    const phaseAt = records.filter(r => r.kind === 'cue' && r.cue === 'phase').at(-1)?.receivedAt ?? Date.now(), age = Date.now() - phaseAt;
    let name;
    if (state.scene === 'brag' && state.phase === 'brag-lines' && age > 2150) name = 'native-brag-lines';
    if (state.scene === 'brag' && state.phase === 'mash' && age > 2200) name = 'native-brag-mash';
    if (state.scene === 'brag' && state.phase === 'knockout' && age > 1700) name = 'native-brag-knockout';
    if (state.scene === 'show' && state.phase === 'vote' && age > 1200) name = 'native-show-vote';
    const crownAt = records.filter(r => r.kind === 'cue' && r.target === 'show.crown').at(-1)?.receivedAt;
    if (state.scene === 'show' && crownAt && Date.now() - crownAt > 1700) name = 'native-show-win';
    if (state.scene === 'champ' && state.completed) name = 'native-champ';
    if (name && !captured.has(name)) { await shot(name); captured.add(name); }
    if (state.completed) { await wait(3500); if (recording) clips.add(recording); await finishClip(); break; }
    // Only phases belonging to other workers are fast-forwarded. Hunt/glow run
    // normally so every synthetic photo and bot find takes the real relay/core path.
    if (['title', 'reel', 'countdown', 'judge', 'standings'].includes(state.phase) && Date.now() - lastSkip > 300) { send({ command: 'remote', key: 'ff' }); lastSkip = Date.now(); }
    await wait(80);
  }
  const synthetic = { target: 'VVD aarch64 Release', audio: 'muted', privacy: 'Three synthetic object JPEGs relayed in memory; no player images', completed: latest?.completed, exceptions: latest?.exceptions, captures: [...captured], clips: [...clips], synthetic: phone.counts() };
  await writeFile(resolve(dir, 'native-synthetic.json'), JSON.stringify(synthetic, null, 2) + '\n');
  await writeFile(resolve(dir, 'native-cues.jsonl'), records.filter(r => r.kind !== 'snapshot').map(record => JSON.stringify(record)).join('\n') + '\n');
  if (!synthetic.completed || synthetic.exceptions || captured.size !== 6 || clips.size !== 3 || synthetic.synthetic.photos !== 3) throw new Error('Native Worker C acceptance failed');
  send({ command: 'reduced', on: true }); await wait(700); await shot('native-champ-reduced'); send({ command: 'reduced', on: false });
  for (const name of encodedClips) await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', resolve(dir, 'native-' + name + '.raw.mp4'), '-an', '-r', '60', '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', resolve(root, 'docs/review/tv-' + name + '.mp4')]);
  console.log(JSON.stringify(synthetic));
} finally {
  await writeFile(resolve(dir, 'native-runtime.jsonl'), records.map(record => JSON.stringify(record)).join('\n') + '\n');
  await finishClip(); phone?.stop(); device?.close(); await browser.close(); server.close();
}
