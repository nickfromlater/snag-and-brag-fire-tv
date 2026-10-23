// Native SDK client round trips, no account/Alexa/login and no image-bearing state.
import { WebSocket } from 'ws';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

await access(resolve(homedir(), '.snag-vvd.lock'));
const dir = resolve(import.meta.dirname, '../../docs/review/tv/polish1'); await mkdir(dir, { recursive: true });
const route = process.env.TV_MEDIA_ROUTE === 'handler' ? 'handler' : 'sdk';
const records = [], checks = [];
const ws = new WebSocket('ws://127.0.0.1:' + (process.env.TV_CONTROL_PORT ?? 8869) + '/observe?runtime=native');
let latest;
ws.on('message', bytes => { const r = JSON.parse(String(bytes)); records.push(r); if (r.kind === 'snapshot') latest = r; });
const send = m => ws.send(JSON.stringify(m)), wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, label, timeout = 20000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (records.some(r => r.kind === 'exception')) throw new Error('Native exception');
    if (records.some(r => r.kind === 'media-injection-error')) throw new Error('SDK injection failed');
    if (fn()) return;
    send({ command: 'snapshot' }); await wait(100);
  }
  throw new Error(label + ' timed out');
};
const inject = async action => {
  const from = records.length; send({ command: 'media-control', route, action });
  await until(() => records.slice(from).some(r => r.kind === (route === 'sdk' ? 'media-injected' : 'media-handler') && r.action === action), action);
  const handler = records.slice(from).find(r => r.kind === 'media-handler' && r.action === action);
  const endpoint = records.slice(from).find(r => r.kind === 'media-endpoint');
  if (!handler || (route === 'sdk' && (!endpoint?.focused || !endpoint.active))) throw new Error('Missing ' + route + ' -> handler proof for ' + action);
  checks.push({ action, endpoint, handler });
};
let pass = false, reason;
try {
  await new Promise((ok, bad) => { ws.once('open', ok); ws.once('error', bad); });
  await until(() => latest?.ready && latest.loaded && latest.connected && latest.hermes, 'native ready');
  send({ command: 'reset', speed: 1, seed: 1 });
  await until(() => latest?.scene === 'lobby' && records.some(r => r.kind === 'voice-complete'), 'normal lobby greeting');
  send({ command: 'bots', start: false });
  await until(() => records.some(r => r.kind === 'voice-line' && r.trigger === 'lobby.ready'), 'bots greeting');
  const readyLine = records.findLast(r => r.kind === 'voice-line' && r.trigger === 'lobby.ready');
  await until(() => records.some(r => r.kind === 'voice-complete' && r.lineSeq === readyLine.lineSeq), 'bots greeting completion');
  send({ command: 'start' });
  await until(() => latest?.scene === 'intro' && records.some(r => r.kind === 'voice-line' && r.trigger === 'intro.title'), 'live game');
  await inject('pause');
  await until(() => latest?.paused, 'paused game');
  const before = records.filter(r => r.kind === 'cue').length, phase = latest.phase;
  await wait(2000); send({ command: 'snapshot' }); await wait(150);
  if (!latest.paused || latest.phase !== phase || records.filter(r => r.kind === 'cue').length !== before) throw new Error('Whole-show timeline advanced while paused');
  checks.push({ pausedTimelineMs: 2000, samePhase: true, noNewCues: true });
  await inject('pause'); // Idempotence must survive a platform round trip.
  await inject('play'); await until(() => latest?.paused === false, 'resumed show');
  await inject('togglePlayPause'); await until(() => latest?.paused, 'platform toggle pause');
  await inject('togglePlayPause'); await until(() => latest?.paused === false, 'platform toggle resume');
  await inject('pause');
  const previous = latest.phase; await inject('next');
  await until(() => !latest?.paused && latest?.phase !== previous, 'Next resumes and skips the phase');
  checks.push({ nextPhaseChanged: true, previous, phase: latest.phase });
  await inject('fastForward');
  send({ command: 'reset', speed: 1, seed: 1 });
  await until(() => latest?.scene === 'lobby' && records.findLast(r => r.kind === 'media-session')?.active === false, 'release session in lobby');
  pass = latest.exceptions === 0 && records.every(r => r.runtime === 'native');
} catch (e) { reason = e instanceof Error ? e.message : String(e); process.exitCode = 1; }
finally {
  ws.close();
  await writeFile(resolve(dir, 'alexa-native-' + route + '.json'), JSON.stringify({ pass, reason, verifiedAt: new Date().toISOString(), speed: 1, runtime: 'VVD aarch64 Release/Hermes', injectedVia: route === 'sdk' ? 'Vega Media Controls SDK client -> platform service -> registered game handler' : 'debug command -> same registered handler (platform discovery/Alexa route unverified)', spokenAlexaTested: false, checks, lastSnapshot: latest, events: records.filter(r => r.kind.startsWith('media-') || r.kind === 'exception') }, null, 2) + '\n');
  console.log(JSON.stringify({ pass, reason, checks: checks.length, exceptions: latest?.exceptions }));
}
