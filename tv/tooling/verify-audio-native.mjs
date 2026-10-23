// Native effect-bank decoder evidence. Hold ~/.snag-vvd.lock; Mac stays muted.
import { WebSocket } from 'ws';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '../..');
const [codec = 'ogg', name = 'native-audio-effects', ...ids] = process.argv.slice(2);
if (!['ogg', 'wav'].includes(codec) || !/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid codec or receipt name');
await access(resolve(homedir(), '.snag-vvd.lock'));
if (execFileSync('osascript', ['-e', 'get output muted of (get volume settings)'], { encoding: 'utf8' }).trim() !== 'true') throw new Error('Mute the Mac');
const manifest = JSON.parse(await readFile(resolve(root, 'assets/audio/manifest.json'), 'utf8'));
const expected = manifest.files.filter(f => f.kind === 'sfx' && (!ids.length || ids.includes(f.id))).map(f => f.id);
if (!expected.length || ids.some(id => !expected.includes(id))) throw new Error('Unknown effect id');
const dir = resolve(root, 'docs/review/tv');
await mkdir(dir, { recursive: true });
const ws = new WebSocket('ws://127.0.0.1:' + (process.env.TV_CONTROL_PORT ?? 8790) + '/observe?runtime=native');
const records = []; let latest;
ws.on('message', bytes => { const m = JSON.parse(String(bytes)); records.push(m); if (m.kind === 'snapshot') latest = m; });
const wait = ms => new Promise(ok => setTimeout(ok, ms));
let poll;
try {
  await new Promise((ok, bad) => { ws.once('open', ok); ws.once('error', bad); });
  poll = setInterval(() => ws.send(JSON.stringify({ command: 'snapshot' })), 500);
  const deadline = Date.now() + 20000;
  while (!latest?.ready || !latest.loaded || !latest.hermes || !latest.connected) {
    if (Date.now() > deadline) throw new Error('Native handshake timed out');
    await wait(100);
  }
  await wait(1800); records.length = 0;
  const started = Date.now();
  ws.send(JSON.stringify({ command: 'audio-effects', codec, ...(ids.length ? { files: ids } : {}) }));
  while (!records.some(r => r.kind === 'audio-effects-complete')) {
    if (Date.now() - started > 360000) throw new Error('Effect bank timed out');
    if (records.some(r => r.kind === 'exception')) throw new Error('Native exception during probe');
    await wait(100);
  }
  const effects = records.filter(r => r.kind === 'audio-effect');
  const errors = records.filter(r => r.kind === 'audio-error');
  const complete = records.find(r => r.kind === 'audio-effects-complete');
  const pass = complete.pass && complete.players <= 10 && !errors.length && effects.length === expected.length * 2 && expected.every(id => [false, true].every(warm => effects.some(r => r.file === id && r.warm === warm && r.pass))) && records.every(r => r.runtime === 'native');
  const receipt = { verifiedAt: new Date().toISOString(), target: 'VVD OS 1.2 aarch64 Release / Hermes', codec, productionPool: true, muted: true, expectedIds: expected, durationSeconds: (Date.now() - started) / 1000, effects, errors, complete, pass };
  await writeFile(resolve(dir, name + '.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ codec, pass, tested: effects.length, passed: effects.filter(r => r.pass).length, failed: effects.filter(r => !r.pass).map(r => r.file), errors: errors.length, receipt: 'docs/review/tv/' + name + '.json' }));
  if (!pass) process.exitCode = 1;
} finally { clearInterval(poll); ws.close(); }
