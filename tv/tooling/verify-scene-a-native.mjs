import { WebSocket } from 'ws';
import { mkdir, readFile, writeFile, mkdtemp, readdir, copyFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..'), out = resolve(root, 'docs/review/tv-scene-a');
const owner = await readFile(resolve(homedir(), '.snag-vvd.lock/owner'), 'utf8');
assert(owner.startsWith('Worker A scene-a'), 'Worker A must hold the shared VVD lock before native verification');
const holder=Number(owner.match(/pid (\d+)/)?.[1]);assert(holder>0,'Lock must name a persistent holder');process.kill(holder,0);
await mkdir(out, { recursive: true });
const port = Number(process.env.TV_CONTROL_PORT ?? 8801), ws = new WebSocket('ws://127.0.0.1:' + port + '/observe?runtime=native'), records = [];
ws.on('message', bytes => { try { records.push(JSON.parse(String(bytes))); } catch {} });
await new Promise((ok, bad) => { ws.once('open', ok); ws.once('error', bad); });
const send = command => ws.send(JSON.stringify(command)), delay = ms => new Promise(r => setTimeout(r, ms));
const run = (command, args) => new Promise((ok, bad) => {
  const p = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }); let output = '';
  p.stdout.on('data', b => { output = (output + b).slice(-1600); }); p.stderr.on('data', b => { output = (output + b).slice(-1600); });
  p.on('error', bad); p.on('exit', code => code === 0 ? ok(output) : bad(new Error(output)));
});
const consoleCommand = async command => { assert.equal(await readFile(resolve(homedir(),'.snag-vvd.lock/owner'),'utf8'),owner,'VVD lock ownership changed'); const result=await run('python3', ['spike/tooling/capture.py', command]);assert(!result.includes('KO:'),'VVD rejected '+command);return result; };
const shot = async name => {
  const folder=await mkdtemp(resolve(tmpdir(),'snag-scene-a-shot-'));
  try{await consoleCommand('screenrecord screenshot '+folder);const files=(await readdir(folder)).filter(f=>f.endsWith('.png'));assert.equal(files.length,1,'Require one fresh native frame');await copyFile(resolve(folder,files[0]),resolve(out,name+'.png'));}
  finally{await rm(folder,{recursive:true,force:true});}
};
const until = async (predicate, timeout = 180000) => { const end = Date.now() + timeout; while (Date.now() < end) { const result = predicate(); if (result) return result; await delay(40); } throw new Error('Native scene verification timed out'); };
const cue = (predicate, start = 0) => records.slice(start).find(r => r.kind === 'cue' && predicate(r));
let recording = false;
const startClip = async name => { await consoleCommand('screenrecord start --size 1920x1080 --bit-rate 8M --fps 60 ' + resolve(out, name + '.raw.mp4')); recording = true; };
const stopClip = async () => { if (recording) { await consoleCommand('screenrecord stop'); recording = false; } };
try {
  const readyAt=records.length;const readiness=setInterval(()=>send({command:'snapshot'}),250);
  try{await until(()=>records.slice(readyAt).find(r=>r.kind==='snapshot'&&r.ready&&r.loaded&&r.connected&&r.hermes),20000);}finally{clearInterval(readiness);}
  const resetAt=records.length;
  send({ command: 'reset', speed: 1, seed: 1 }); await delay(600);
  await until(()=>records.slice(resetAt).find(r=>r.kind==='engine'&&r.hermes),10000);
  send({ command: 'join', index: 0 }); await delay(100);
  await startClip('intro'); send({ command: 'bots', start: true });
  const title = await until(() => cue(r => r.target === 'intro.title' && r.cue === 'slam' && r.round === 0));
  await delay(Math.max(0, title.at + 900 - Date.now())); await shot('title');
  await until(() => records.filter(r => r.cue === 'phase' && r.phase === 'reel' && r.round === 0).length >= 2);
  await delay(1000); await shot('reel');
  for (let i = 0; i < 4; i++) {
    await until(() => records.filter(r => r.cue === 'count' && r.target === 'intro' && r.round === 0).length > i);
    const event = records.filter(r => r.cue === 'count' && r.target === 'intro' && r.round === 0)[i];
    await delay(Math.max(0, event.at + 360 - Date.now())); await shot(['count-3', 'count-2', 'count-1', 'snag'][i]);
  }
  await until(() => cue(r => r.cue === 'scene' && r.scene === 'hunt')); await stopClip();
  await until(() => cue(r => r.cue === 'scene' && r.scene === 'stand' && r.round === 0));
  await startClip('stand');
  const standings = await until(() => cue(r => r.cue === 'slam' && r.target === 'stand.title' && r.round === 0));
  await delay(Math.max(0, standings.at + 600 - Date.now())); await shot('stand-entry');
  await delay(Math.max(0, standings.at + 1650 - Date.now())); await shot('stand-race');
  await delay(Math.max(0, standings.at + 3750 - Date.now())); await shot('stand');
  await until(() => cue(r => r.cue === 'phase' && r.phase === 'title' && r.round === 1)); await stopClip();
  const fastStart = records.length;
  send({ command: 'reset', speed: 10, seed: 1 }); await delay(250); send({ command: 'bots', start: true });
  const complete = await until(() => records.slice(fastStart).find(r => r.kind === 'complete'));
  send({ command: 'snapshot' }); await delay(250);
  const game = records.slice(fastStart), cues = game.filter(r => r.kind === 'cue' && r.seq <= complete.cues).sort((a, b) => a.seq - b.seq);
  assert.equal(complete.exceptions, 0); assert(!game.some(r => r.kind === 'exception'));
  assert.equal(cues.length, complete.cues); cues.forEach((r, i) => assert.equal(r.seq, i + 1));
  const scenes = [...new Set(cues.filter(r => r.cue === 'scene').map(r => r.scene))];
  for (const scene of ['intro', 'hunt', 'judge', 'stand', 'brag', 'show', 'champ']) assert(scenes.includes(scene), 'missing ' + scene);
  await shot('fast-finale');
  for (const name of ['intro', 'stand']) await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', resolve(out, name + '.raw.mp4'), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', resolve(root, 'docs/review/tv-' + name + '.mp4')]);
  const receipt = { target: 'Vega VVD aarch64 Release', resolution: '1920x1080', recordingRequestedFps: 60, audio: 'Mac muted; clips omit audio',
    captureFixture: 'four teams: local host fixture takes no photo; three seeded bots', photos: 'no photo or thumbnail captured', complete, scenes, contiguousCues: true,
    captures: ['title', 'reel', 'count-3', 'count-2', 'count-1', 'snag', 'stand-entry', 'stand-race', 'stand', 'fast-finale'], snapshot: game.findLast(r => r.kind === 'snapshot') };
  await writeFile(resolve(out, 'native-verification.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ complete, scenes, contiguousCues: true, screenshots: 10, clips: 2 }));
} finally { if(await readFile(resolve(homedir(),'.snag-vvd.lock/owner'),'utf8').catch(()=>null)===owner)await stopClip(); ws.close(); }
