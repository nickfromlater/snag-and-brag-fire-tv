import { WebSocket } from 'ws';
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile, mkdtemp, readdir, copyFile, rm, stat, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawn } from 'node:child_process';

const runtime = process.argv[2] ?? 'web';
if (!['web', 'native'].includes(runtime)) throw new Error('Use web or native');
const capture = process.env.TV_VOICE_CAPTURE !== 'false';
const requirePolly = process.env.TV_VOICE_REQUIRE_POLLY === 'true';
if (runtime === 'native') await access(resolve(homedir(), '.snag-vvd.lock'));
const root = resolve(import.meta.dirname, '../..');
const output = resolve(process.env.TV_VOICE_OUTPUT_DIR ?? resolve(root, 'docs/review/voice'));
await mkdir(output, { recursive: true });
const records = [], errors = [], failures = [];
let browser, latest;
const ws = new WebSocket('ws://127.0.0.1:' + (process.env.TV_CONTROL_PORT ?? 8790) + '/observe?runtime=' + runtime);
ws.on('message', bytes => { const record = JSON.parse(String(bytes)); records.push(record); if (record.kind === 'snapshot') latest = record; });
const wait = ms => new Promise(done => setTimeout(done, ms));
const send = command => ws.send(JSON.stringify(command));
const run = (command, args) => new Promise((done, fail) => {
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }); let output = '';
  child.stdout.on('data', bytes => { output = (output + bytes).slice(-8000); });
  child.stderr.on('data', bytes => { output = (output + bytes).slice(-8000); });
  child.on('error', fail); child.on('exit', code => code ? fail(new Error(output)) : done(output));
});
const consoleCommand = async command => {
  const result = await run('python3', ['spike/tooling/capture.py', command]);
  if (result.includes('KO:')) throw new Error(result); return result;
};
const until = async (condition, ms, label, poll) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (condition()) return;
    if (errors.length || records.some(r => r.kind === 'exception')) throw new Error('Runtime exception during ' + label);
    poll?.(); await wait(50);
  }
  throw new Error(label + ' timed out; latest=' + JSON.stringify(latest));
};
const ready = async () => {
  latest = undefined;
  await until(() => latest?.ready && latest.loaded && latest.connected && (runtime === 'web' || latest.hermes), 30000, 'runtime handshake', () => send({ command: 'snapshot' }));
};
const shot = async (name, page) => {
  if (!capture) return;
  if (page) { await page.screenshot({ path: resolve(output, name + '.png') }); return; }
  const folder = await mkdtemp(resolve(tmpdir(), 'snag-voice-shot-'));
  try {
    await consoleCommand('screenrecord screenshot ' + folder);
    const files = (await readdir(folder)).filter(file => file.endsWith('.png'));
    if (files.length !== 1) throw new Error('No fresh native screenshot');
    await copyFile(resolve(folder, files[0]), resolve(output, name + '.png'));
  } finally { await rm(folder, { recursive: true, force: true }); }
};
const reset = async () => {
  records.length = 0; send({ command: 'reset', seed: 1, speed: 1 });
  await until(() => records.some(r => r.kind === 'cue' && r.seq === 1), 10000, 'game reset');
  const first = records.findIndex(r => r.kind === 'cue' && r.seq === 1); records.splice(0, first);
};
try {
  await new Promise((done, fail) => { ws.once('open', done); ws.once('error', fail); });
  if ((await run('osascript', ['-e', 'get output muted of (get volume settings)'])).trim() !== 'true') throw new Error('Mac must be muted');
  let page;
  if (runtime === 'web') {
    browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
      args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--force-color-profile=srgb', '--disable-background-timer-throttling'] });
    page = await browser.newPage(); await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push(e.name));
    await page.goto(process.env.TV_WEB_URL ?? 'http://127.0.0.1:5174');
    await page.waitForFunction(() => window.__snagTv?.ready && document.fonts.check('27px Rubik'), { timeout: 30000 });
  }
  await ready(); await wait(2000);
  const rawDir = runtime === 'native' && capture ? await mkdtemp(resolve(tmpdir(), 'snag-voice-clip-')) : undefined;
  try {
    let recording = false;
    try {
      await reset();
      await until(() => records.some(r => r.kind === 'voice-line' && r.trigger === 'lobby.open'), 10000, 'lobby speech');
      // Console recording contends with the native media pipeline during startup.
      // Start it after playback advances; capture the remaining marked speech.
      if (rawDir) { await consoleCommand('screenrecord start --size 1920x1080 --bit-rate 2M --fps 30 ' + resolve(rawDir, 'lobby.mp4')); recording = true; }
      else await wait(250);
      await shot(runtime + '-lobby-speaking', page);
      await wait(1300); await shot(runtime + '-lobby-rest', page);
      if (rawDir) await wait(2000);
    } finally { if (recording) await consoleCommand('screenrecord stop'); }
    if (rawDir) {
      const clip = resolve(output, 'native-lobby-voice.mp4');
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', resolve(rawDir, 'lobby.mp4'), '-an', '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', clip]);
      if ((await stat(clip)).size > 10000000) throw new Error('Native clip exceeds 10 MB');
    }
  } finally { if (rawDir) await rm(rawDir, { recursive: true, force: true }); }
  const lobby = records.filter(r => r.kind.startsWith('voice-'));
  const route = lobby.find(r => r.kind === 'voice-line');
  if (route?.path !== 'polly') failures.push('Mock lobby speech did not play through Polly');
  const lobbySamples = lobby.filter(r => r.kind === 'voice-sample');
  if (!lobbySamples.some(r => r.jaw >= .9) || !lobbySamples.some(r => r.jaw === 0)) failures.push('Lobby had no open/closed marked visemes');
  await writeFile(resolve(output, runtime + '-lobby-voice.json'), JSON.stringify({ pass: failures.length === 0, runtime, speed: 1, muted: true, route, samples: lobbySamples }, null, 2) + '\n');

  await reset();
  const finishedLine = trigger => {
    const line = records.find(r => r.kind === 'voice-line' && r.trigger === trigger);
    return line && records.some(r => r.kind === 'voice-complete' && r.lineSeq === line.lineSeq);
  };
  await until(() => finishedLine('lobby.open'), 20000, 'game lobby greeting');
  send({ command: 'bots', start: false });
  // Let the joined-teams line finish before the host starts, as a person would.
  await until(() => finishedLine('lobby.ready'), 20000, 'joined-teams greeting');
  send({ command: 'start' });
  let snapshotAt = 0;
  await until(() => records.some(r => r.kind === 'complete'), 600000, 'full normal-speed all-bot game', () => { if (Date.now() - snapshotAt >= 500) { snapshotAt = Date.now(); send({ command: 'snapshot' }); } });
  await wait(250); await ready(); await shot(runtime + '-finale', page);
  const complete = records.find(r => r.kind === 'complete');
  const host = records.filter(r => r.kind === 'cue' && r.cue === 'host');
  const routes = records.filter(r => r.kind === 'voice-line');
  const scenes = [...new Set(records.filter(r => r.kind === 'cue' && r.cue === 'scene').map(r => r.scene))];
  const missing = host.filter(c => !routes.some(r => r.lineSeq === c.seq));
  const duplicate = routes.filter((r, i) => routes.findIndex(o => o.lineSeq === r.lineSeq) !== i);
  if (missing.length || duplicate.length || routes.some(r => !['polly', 'blips'].includes(r.path))) throw new Error('Host route coverage failed');
  if (complete.exceptions || latest.exceptions || !latest.completed || errors.length || scenes.length !== 8) throw new Error('Game completion failed');
  const audioErrors = records.filter(r => r.kind === 'audio-error');
  if (audioErrors.length) failures.push('Native audio codec/network errors: ' + audioErrors.length);
  if (requirePolly && routes.some(r => r.path !== 'polly')) failures.push('Release gate requires every host line through mock Polly');
  const incompleteSpeech = routes.filter(r => !records.some(c => c.kind === 'voice-complete' && c.lineSeq === r.lineSeq && c.path === 'polly' && c.reason === 'ended' && c.elapsedMs >= r.durationMs));
  if (requirePolly && (incompleteSpeech.length || records.some(r => r.kind === 'voice-fallback'))) failures.push('Release gate requires every Polly clip to finish on its media clock: ' + incompleteSpeech.map(r => r.trigger).join(', '));
  const receipt = { pass: failures.length === 0, failures, audioErrors, verifiedAt: new Date().toISOString(), runtime, speed: 1, pollyMode: 'mock', muted: true, photos: 'all bot art; no player images', capture, requirePolly,
    complete, scenes, hostLines: host.length, routedLines: routes.length, polly: routes.filter(r => r.path === 'polly').length,
    fallback: routes.filter(r => r.path === 'blips').length, maximumStartLatencyMs: Math.max(...routes.map(r => r.latencyMs)),
    exceptions: errors, nativeHermes: runtime === 'native' ? latest.hermes : null, routes };
  await writeFile(resolve(output, runtime + '-voice-game.json'), JSON.stringify(receipt, null, 2) + '\n');
  await writeFile(resolve(output, runtime + '-voice-game.jsonl'), records.map(r => JSON.stringify(r)).join('\n') + '\n');
  console.log(JSON.stringify({ pass: receipt.pass, runtime, hostLines: host.length, polly: receipt.polly, fallback: receipt.fallback, exceptions: complete.exceptions, audioErrors: audioErrors.length, scenes, maximumStartLatencyMs: receipt.maximumStartLatencyMs }));
  if (failures.length) throw new Error(failures.join('; '));
} finally { ws.close(); await browser?.close(); }
