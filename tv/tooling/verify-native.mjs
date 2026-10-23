import { WebSocket } from 'ws';
import { mkdir, writeFile, unlink, mkdtemp, readdir, copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..'), dir = resolve(process.env.TV_VERIFY_OUTPUT_DIR ?? resolve(root, 'docs/review/tv'));
await mkdir(dir, { recursive: true });
const mode = process.argv[2] ?? 'game', records = [];
const controlPort = Number(process.env.TV_CONTROL_PORT ?? 8790);
const ws = new WebSocket('ws://127.0.0.1:' + controlPort + '/observe?runtime=native');
let latest;
ws.on('message', bytes => {
  let m; try { m = JSON.parse(String(bytes)); } catch { return; }
  records.push(m); if (m.kind === 'snapshot') latest = m;
});
const wait = ms => new Promise(ok => setTimeout(ok, ms));
const send = m => ws.send(JSON.stringify(m));
const run = (cmd, args) => new Promise((ok, bad) => {
  const p = spawn(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; const capture = b => { out = (out + b).slice(-6000); };
  p.stdout.on('data', capture); p.stderr.on('data', capture);
  p.on('error', bad); p.on('exit', code => code === 0 ? ok(out) : bad(new Error(out.slice(-1500))));
});
const device = command => run('/bin/zsh', ['-c', 'source ~/vega/env\n' + command]);
const consoleCommand = async command => {
  const out = await run('python3', ['spike/tooling/capture.py', command]);
  if (out.includes('KO:')) throw new Error('VVD console rejected command: ' + out.trim());
  return out;
};
const shot = async name => {
  const folder = await mkdtemp(resolve(tmpdir(), 'snag-tv-shot-'));
  try {
    await consoleCommand('screenrecord screenshot ' + folder);
    const files = (await readdir(folder)).filter(file => file.endsWith('.png'));
    if (files.length !== 1) throw new Error('VVD did not produce one fresh screenshot');
    await copyFile(resolve(folder, files[0]), resolve(dir, name + '.png'));
  } finally { await rm(folder, { recursive: true, force: true }); }
};
const save = (name, data) => writeFile(resolve(dir, name), JSON.stringify(data, null, 2) + '\n');
const until = async (fn, ms, label, poll) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    if (records.some(r => r.kind === 'exception')) throw new Error('Native exception: ' + JSON.stringify(records.find(r => r.kind === 'exception')));
    poll?.(); await wait(250);
  }
  const cue = records.findLast(r => r.kind === 'cue');
  throw new Error(label + ' timed out. Last native snapshot: ' + JSON.stringify(latest) + '; cue: ' + JSON.stringify(cue) + '. Check loggingctl log -f and vda reverse --list.');
};
const ready = async () => {
  latest = undefined;
  await until(() => latest?.ready && latest.loaded && latest.hermes === true && latest.connected, 20000, 'Native app/relay/fonts handshake', () => send({ command: 'snapshot' }));
};
const reset = async speed => {
  records.length = 0; latest = undefined;
  send({ command: 'reset', speed, seed: 1 });
  await until(() => records.some(r => r.kind === 'engine' && r.hermes), 10000, 'Native reset acknowledgment');
  const first = records.findIndex(r => r.kind === 'cue' && r.seq === 1);
  if (first < 0) throw new Error('Native reset did not deliver cue 1');
  records.splice(0, first); // Discard queued cues from the game before reset.
  await ready();
};
try {
  await Promise.race([
    new Promise((ok, bad) => { ws.once('open', ok); ws.once('error', bad); }),
    wait(10000).then(() => { throw new Error('Local TV control unavailable on port 8790'); }),
  ]);
  const muted = (await run('osascript', ['-e', 'get output muted of (get volume settings)'])).trim();
  if (muted !== 'true') throw new Error('Mute the Mac before native verification');
  if (mode !== 'video') await ready();
  if (mode === 'game') {
    const gameSpeed=Number(process.env.TV_VERIFY_GAME_SPEED??3);
    await reset(gameSpeed);
    if (process.env.TV_VERIFY_REDUCED === 'true') send({ command: 'reduced', on: true });
    send({ command: 'bots', start: true });
    await until(() => records.some(r => r.kind === 'complete'), Math.max(120000,600000/gameSpeed), 'Native full game', () => send({command:'snapshot'}));
    await ready(); await shot('native-finale');
    const complete = records.find(r => r.kind === 'complete');
    const cues = records.filter(r => r.kind === 'cue' && r.seq <= complete.cues).sort((a, b) => a.seq - b.seq);
    const scenes = [...new Set(cues.filter(c => c.cue === 'scene').map(c => c.scene))];
    const engine = records.find(r => r.kind === 'engine');
    if (complete.exceptions !== 0 || latest.exceptions !== 0) throw new Error('Native game had exceptions');
    if (!latest.completed || !engine?.hermes || !engine.binary) throw new Error('Native completion/runtime evidence is missing');
    if (cues.length !== complete.cues || cues.some((c, i) => c.seq !== i + 1)) throw new Error('Native cue log is incomplete');
    if (['lobby', 'intro', 'hunt', 'judge', 'stand', 'brag', 'show', 'champ'].some(scene => !scenes.includes(scene))) throw new Error('Native game missed a scene');
    await writeFile(resolve(dir, 'native-fast-game.jsonl'), cues.map(r => JSON.stringify(r)).join('\n') + '\n');
    const receipt = { verifiedAt: new Date().toISOString(), target: 'VVD OS 1.2 aarch64 Release', mode, speed: gameSpeed, seed: 1,
      audio: 'Mac muted; native audio enabled', photos: 'All bots; no player photos or thumbnails', engine, complete, scenes,
      contiguousCues: true, nativeOnly: records.every(r => r.runtime === 'native'), snapshot: latest,
      cueLog: 'docs/review/tv/native-fast-game.jsonl', screenshot: 'docs/review/tv/native-finale.png' };
    if (!receipt.nativeOnly) throw new Error('Web telemetry contaminated the native receipt');
    await save('native-verification.json', receipt);
    console.log(JSON.stringify({ mode, complete, scenes, engine, contiguousCues: true }));
  } else if (mode === 'eyes-layers') {
    for (let level = 0; level <= 7; level++) {
      send({ command: 'diagnostic-layer', level });
      await wait(800); await ready(); await shot('native-eyes-layer-' + level);
      console.log('Native layer ' + level + ' answers snapshots');
    }
  } else if (mode === 'eyes-compose') {
    for (const on of [false, true]) {
      send({ command: 'eyes-enabled', on });
      await reset(1);
      await until(() => records.some(r => r.kind === 'cue' && r.cue === 'host-finish'), 10000, 'Composition lobby welcome');
      await shot('native-eyes-compose-' + (on ? 'enabled' : 'disabled') + '-start');
      await wait(4000); await shot('native-eyes-compose-' + (on ? 'enabled' : 'disabled') + '-end');
    }
    console.log('Captured full native lobby with eyes disabled and enabled');
  } else if (mode === 'eyes-probe') {
    const snapshots = {};
    for (const driver of ['native', 'sampled', 'still']) {
      send({ command: 'eyes-probe', driver });
      await wait(1000); await shot('native-eyes-single-' + driver + '-start');
      await wait(4000); await shot('native-eyes-single-' + driver + '-end');
      latest = undefined;
      await until(() => latest?.ready, 5000, 'Single eye snapshot', () => send({ command: 'snapshot' }));
      snapshots[driver] = latest;
    }
    await save('native-eyes-probe.json', { verifiedAt: new Date().toISOString(), target: 'VVD OS 1.2 aarch64 Release',
      task: 'One native-driver eye on a plain ready card: a fixed loop, the production sampler with settling-to-idle transition, and a still control',
      snapshots, exceptions: records.filter(r => r.kind === 'exception').length,
      screenshots: ['native', 'sampled', 'still'].flatMap(driver => ['start', 'end'].map(time => 'docs/review/tv/native-eyes-single-' + driver + '-' + time + '.png')) });
    console.log('Captured single native Animated eye and still-eye controls; inspect card heartbeat and pupil positions');
  } else if (mode === 'eyes-lobby') {
    await reset(1);
    await until(() => records.some(r => r.kind === 'cue' && r.cue === 'host-finish'), 10000, 'Lobby welcome');
    await wait(300);
    await shot('native-eyes-lobby');
    const folder = await mkdtemp(resolve(tmpdir(), 'snag-tv-eyes-clip-')), raw = resolve(folder, 'lobby.mp4');
    try {
      await consoleCommand('screenrecord start --size 1920x1080 --bit-rate 8M --fps 60 ' + raw);
      try { await wait(8000); } finally { await consoleCommand('screenrecord stop'); }
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-an', '-t', '8', '-r', '60', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', resolve(dir, 'native-eyes-lobby.mp4')]);
      const video = JSON.parse(await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames,duration', '-of', 'json', resolve(dir, 'native-eyes-lobby.mp4')]));
      if (video.streams[0]?.r_frame_rate !== '60/1' || video.streams[0]?.nb_frames !== '480') throw new Error('Eye clip is not 8 seconds at 60 fps');
      await ready();
      await save('native-eyes-lobby-verification.json', { verifiedAt: new Date().toISOString(), target: 'VVD OS 1.2 aarch64 Release',
        capture: 'ScreenCaptureKit VVD-window recording; 1920x1080; 8 seconds; 60 fps; silent', video: video.streams[0], snapshot: latest,
        nativeOnly: records.every(r => r.runtime === 'native'), exceptions: records.filter(r => r.kind === 'exception').length,
        screenshot: 'docs/review/tv/native-eyes-lobby.png', clip: 'docs/review/tv/native-eyes-lobby.mp4' });
    } finally { await rm(folder, { recursive: true, force: true }); }
    console.log('Native eyes lobby screenshot and 8 s 60 fps window clip captured');
  } else if (mode === 'lobby') {
    await reset(1);
    await until(() => records.some(r => r.kind === 'cue' && r.cue === 'host-finish'), 10000, 'Lobby welcome');
    await wait(200); await shot('native-lobby');
    send({ command: 'remote', key: 'select' }); await wait(450); await shot('native-menu');
    send({ command: 'remote', key: 'back' });
    console.log('Native lobby, welcome bubble and focus ring captured');
  } else if (mode === 'video') {
    await device('vega device terminate-app --appName com.snagbrag.tv.main'); await wait(500);
    records.length = 0;
    const raw = resolve(dir, 'native-lobby.raw.mp4');
    await consoleCommand('screenrecord start --size 1920x1080 --bit-rate 8M --fps 60 ' + raw);
    try {
      await device('vega device launch-app --appName com.snagbrag.tv.main'); await ready();
      await until(() => records.some(r => r.kind === 'bootstrap' && r.loaded && r.ready), 15000, 'Native fonts');
      await wait(3500);
      for (let i = 0; i < 3; i++) {
        send({ command: 'join', index: i });
        latest = undefined;
        await until(() => latest?.teams === i + 1, 5000, 'Simulated join ' + (i + 1), () => send({ command: 'snapshot' }));
        await wait(2000);
      }
      send({ command: 'start' });
      await until(() => records.some(r => r.kind === 'cue' && r.cue === 'phase' && r.phase === 'hunt'), 50000, 'Intro/reel/countdown');
      await wait(1800);
    } finally { await consoleCommand('screenrecord stop'); }
    const cues = records.filter(r => r.kind === 'cue'), phases = cues.filter(r => r.cue === 'phase').map(r => r.phase);
    const counts = cues.filter(r => r.cue === 'count' && r.target === 'intro').map(r => r.text);
    if (!['title', 'reel', 'countdown', 'hunt'].every(p => phases.includes(p)) || counts.join(',') !== '3,2,1,SNAG!') throw new Error('Recording missed a required beat');
    await run('ffmpeg', ['-y', '-i', raw, '-an', '-r', '60', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', resolve(root, 'docs/review/tv-lobby.mp4')]);
    await writeFile(resolve(dir, 'video-cues.jsonl'), cues.map(r => JSON.stringify(r)).join('\n') + '\n');
    await save('video-verification.json', { verifiedAt: new Date().toISOString(), target: 'VVD aarch64 Release', capture: '1920x1080 at 60 fps',
      audio: 'muted; silent export', photos: '3 synthetic teams; no photos', phases, counts, exceptions: records.filter(r => r.kind === 'exception').length,
      nativeOnly: records.every(r => r.runtime === 'native'), clip: 'docs/review/tv-lobby.mp4' });
    await unlink(raw);
    console.log('Native boot, 3 joins, wipe, title, reel and 3-2-1 SNAG! recorded');
  } else if (mode === 'audio') {
    await reset(1); await wait(3000);
    for (const codec of ['wav', 'ogg']) {
      send({ command: 'audio-probe', codec });
      await until(() => records.filter(r => r.kind === 'audio-latency' && r.codec === codec).length >= 2, 15000, codec + ' probe');
    }
    await save('audio-latency.json', records.filter(r => r.kind.startsWith('audio-')));
    console.log(JSON.stringify(records.filter(r => r.kind === 'audio-latency')));
  } else if (mode === 'memory') {
    await reset(1); send({ command: 'fixture-stress', seconds: 95 }); await wait(1500);
    send({ command: 'fixture-view', on: true }); send({ command: 'perf', on: true });
    for (let i = 0; i < 15; i++) { send({ command: 'feed-state' }); await wait(6000); }
    await shot('native-mask-feeds'); send({ command: 'fixture-view', on: false }); send({ command: 'perf', on: false }); send({ command: 'fixture-stress', seconds: 0 });
    await save('native-feeds.json', records.filter(r => r.kind === 'feed-state'));
    console.log('Four reused native slots stressed with synthetic JPEGs');
  } else throw new Error('Unknown native verification mode');
} finally { ws.close(); }
