// Synthetic native frames, normal speed only. The caller must own ~/.snag-vvd.lock.
import { WebSocket } from 'ws';
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { out: { type: 'string' }, revision: { type: 'string' }, label: { type: 'string' }, 'window-id': { type: 'string' }, 'overlay-off': { type: 'boolean' }, observe: { type: 'boolean' }, backend: { type: 'string', default: 'window' } } });
if (!values.out || !values.revision) throw new Error('Use --out directory --revision git-sha [--label label]');
if (!['window', 'console'].includes(values.backend)) throw new Error('Capture backend must be window or console (diagnostics only)');
const root = resolve(import.meta.dirname, '../..'), out = resolve(values.out);
await access(resolve(homedir(), '.snag-vvd.lock')); await mkdir(out, { recursive: true });
const run = (cmd, args) => new Promise((ok, bad) => {
  const p = spawn(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }); let text = '';
  p.stdout.on('data', b => text = (text + b).slice(-8000)); p.stderr.on('data', b => text = (text + b).slice(-8000));
  p.on('error', bad); p.on('exit', code => code === 0 ? ok(text) : bad(new Error(text.slice(-2000))));
});
const command = async value => { const text = await run('python3', ['spike/tooling/' + (values.backend === 'window' ? 'capture.py' : 'console.py'), value]); if (text.includes('KO:')) throw new Error(text.trim()); };
const wait = ms => new Promise(ok => setTimeout(ok, ms));
const records = [], captures = [], origin = Date.now(); let snapshot, frame, recording, clip, failure, poll;
const ws = new WebSocket('ws://127.0.0.1:8790/observe?runtime=native');
ws.on('message', bytes => { const record = JSON.parse(String(bytes)); records.push({ ...record, wallMs: Date.now() - origin }); if (record.kind === 'snapshot') snapshot = record; if (record.kind === 'frame-debug') frame = record; });
const send = message => ws.send(JSON.stringify(message));
const until = async (fn, timeout, label) => { const end = Date.now() + timeout; while (!fn()) { if (Date.now() >= end) throw new Error(label + ' timed out at ' + JSON.stringify(snapshot)); if (records.some(r => r.kind === 'exception')) throw new Error('Native exception'); await wait(100); } };
const save = async () => {
  const complete = records.findLast(r => r.kind === 'complete'), scenes = [...new Set(records.filter(r => r.cue === 'scene').map(r => r.scene))];
  const lines = records.filter(r => r.kind === 'voice-line'), ends = records.filter(r => r.kind === 'voice-complete');
  await writeFile(resolve(out, 'presentation.json'), JSON.stringify({ label: values.label ?? values.revision, revision: values.revision,
    capturedAt: new Date().toISOString(), target: 'VVD OS 1.2 / aarch64 Release / Hermes', captureBackend: values.backend, overlay: !values['overlay-off'], speed: 1, seed: 1, muted: true, syntheticOnly: true,
    nativeOnly: records.every(r => r.runtime === 'native'), corePass: !!complete && snapshot?.completed && snapshot.exceptions === 0 && captures.length === 8,
    visualPass: null, visualNote: 'Read the counter and scene from the PNG pixels; JS commits alone do not prove presentation.',
    complete, scenes, snapshot, captures, clip, voice: { lines: lines.length, polly: lines.filter(r => r.path === 'polly').length,
      fullPolly: lines.filter(r => r.path === 'polly' && ends.some(e => e.lineSeq === r.lineSeq && e.reason === 'ended' && e.elapsedMs >= r.durationMs - 50)).length },
    exceptions: records.filter(r => r.kind === 'exception'), audioErrors: records.filter(r => r.kind === 'audio-error'), failure }, null, 2) + '\n');
};
const shot = async name => {
  const scratch = await mkdtemp(resolve(tmpdir(), 'snag-presentation-shot-')), startedMs = Date.now() - origin, before = frame, coreBefore = snapshot;
  try {
    await command('screenrecord screenshot ' + scratch); const files = (await readdir(scratch)).filter(f => f.endsWith('.png'));
    if (files.length !== 1) throw new Error('Console did not produce exactly one PNG');
    const file = name + '.png'; await copyFile(resolve(scratch, files[0]), resolve(out, file));
    const bytes = await readFile(resolve(out, file)); captures.push({ file, captureStartedMs: startedMs, captureEndedMs: Date.now() - origin,
      sha256: createHash('sha256').update(bytes).digest('hex'), before, after: frame, coreBefore, coreAfter: snapshot });
    if (values['window-id']) {
      const windowFile = 'window-' + file, windowStartedMs = Date.now() - origin;
      await run('screencapture', ['-x', '-o', '-l', values['window-id'], resolve(out, windowFile)]);
      captures.at(-1).window = { file: windowFile, captureStartedMs: windowStartedMs, captureEndedMs: Date.now() - origin, after: frame };
    }
    await save(); console.log(name + ': core=' + snapshot.scene + ', committed frame=' + frame?.frame);
  } finally { await rm(scratch, { recursive: true, force: true }); }
};
const startClip = async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'snag-presentation-video-')), raw = resolve(dir, values.backend === 'window' ? 'transition.mp4' : 'transition.webm');
  await command('screenrecord start --size 1920x1080 --fps 60 --bit-rate 8M --time-limit 60 ' + raw);
  recording = { dir, raw, startedMs: Date.now() - origin };
};
const stopClip = async () => { if (!recording || recording.stoppedMs) return; await command('screenrecord stop'); recording.stoppedMs = Date.now() - origin; };
const finishClip = async () => {
  if (!recording) return;
  const file = resolve(out, 'intro-hunt-60fps.mp4'); let crf = 28;
  for (; crf <= 37; crf += 3) {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', recording.raw, '-an', '-r', '60', '-c:v', 'libx264', '-threads', '2', '-crf', String(crf), '-preset', 'slow', file]);
    if ((await stat(file)).size <= 10_000_000) break;
  }
  const bytes = (await stat(file)).size, video = JSON.parse(await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_frames,duration', '-of', 'json', file])).streams[0];
  if (bytes > 10_000_000 || video.codec_name !== 'h264' || video.r_frame_rate !== '60/1') throw new Error('Review clip exceeds 10 MB or is not H.264/60 fps');
  clip = { file: 'intro-hunt-60fps.mp4', bytes, crf, preset: 'slow', startedMs: recording.startedMs, stoppedMs: recording.stoppedMs, ...video };
  await rm(recording.dir, { recursive: true, force: true }); recording = undefined;
};
try {
  await new Promise((ok, bad) => { ws.once('open', ok); ws.once('error', bad); });
  if ((await run('osascript', ['-e', 'get output muted of (get volume settings)'])).trim() !== 'true') throw new Error('Mac must be muted');
  poll = setInterval(() => send({ command: 'snapshot' }), 250);
  await until(() => snapshot?.ready && snapshot.loaded && snapshot.connected && snapshot.hermes, 30000, 'Native readiness');
  if (values.observe && snapshot.scene !== 'lobby') throw new Error('Attach the presentation observer in the lobby before the game starts');
  send({ command: 'frame-debug', on: !values['overlay-off'] });
  if (!values['overlay-off']) await until(() => frame, 10000, 'Clock overlay commit');
  if (!values.observe) {
    send({ command: 'reset', speed: 1, seed: 1 });
    await until(() => snapshot?.scene === 'lobby' && snapshot.teams === 0, 10000, 'Normal-speed empty lobby');
  }
  await wait(1800); await shot('01-lobby');
  if (!values.observe) send({ command: 'bots', start: true });
  await until(() => snapshot?.scene === 'intro' && snapshot.round === 0, 12000, 'First Intro'); await startClip();
  await until(() => snapshot?.phase === 'reel', 20000, 'First reel'); await wait(500); await shot('02-intro');
  await until(() => snapshot?.scene === 'hunt' && snapshot.round === 0, 30000, 'Intro to Hunt'); await wait(1600); await shot('03-hunt'); await stopClip();
  await until(() => snapshot?.scene === 'judge', 65000, 'Pixel Judge'); await wait(5500); await shot('04-judge');
  await until(() => snapshot?.scene === 'stand' && snapshot.round === 0, 55000, 'First standings'); await wait(2600); await shot('05-stand');
  await until(() => snapshot?.scene === 'brag' && snapshot.phase === 'mash', 110000, 'Brag mash'); await wait(700); await shot('06-brag');
  await until(() => snapshot?.scene === 'show' && snapshot.phase === 'vote', 200000, 'Show vote'); await wait(1200); await shot('07-show');
  await until(() => snapshot?.completed, 90000, 'Champion'); await wait(1200); await shot('08-champ');
  await finishClip(); await save(); console.log('Eight normal-speed native captures and transition clip saved: ' + out);
} catch (error) { failure = error.message; process.exitCode = 1; console.error(failure); await stopClip().catch(() => {}); await finishClip().catch(() => {}); await save(); }
finally { clearInterval(poll); ws.close(); await writeFile(resolve(out, 'telemetry.jsonl'), records.map(r => JSON.stringify(r)).join('\n') + '\n'); if (recording) await rm(recording.dir, { recursive: true, force: true }); }
