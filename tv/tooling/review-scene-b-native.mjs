import { WebSocket } from 'ws';
import { readFile, mkdir, writeFile, mkdtemp, readdir, copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '../..'), dir = resolve(root, 'docs/review/scene-b');
const port = process.env.TV_CONTROL_PORT ?? '8794', relay = process.env.TV_SCENE_RELAY ?? 'ws://127.0.0.1:8789/ws';
// Only the process which acquired the shared lock may use this script.
await readFile(resolve(homedir(), '.snag-vvd.lock/scene-b-codex'));
await mkdir(dir, { recursive: true });
const sharp = createRequire(resolve(root, 'relay/package.json'))('sharp');
const sleep = ms => new Promise(r => setTimeout(r, ms)), records = [], captures = [];
const control = new WebSocket('ws://127.0.0.1:' + port + '/observe?runtime=native'); let snapshot, phone, thumbs, recording;
control.on('message', bytes => { const r = JSON.parse(String(bytes)); if (r.hermes !== true) return; records.push(r); if (r.kind === 'snapshot') snapshot = r; });
await new Promise((ok, bad) => { control.once('open', ok); control.once('error', bad); });
const command = m => control.send(JSON.stringify(m));
const run = (cmd, args) => new Promise((ok, bad) => { const p = spawn(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }); let text = ''; p.stdout.on('data', b => text += b); p.stderr.on('data', b => text += b); p.on('exit', code => code === 0 ? ok(text) : bad(new Error(text.slice(-1200)))); });
const consoleCommand = async value => { const result = await run('python3', ['spike/tooling/capture.py', value]); if (result.includes('KO:')) throw new Error(result.slice(-400)); return result; };
const until = async (test, limit = 60000) => { const end = Date.now() + limit; while (Date.now() < end) { const r = records.find(test); if (r) return r; if (records.some(r => r.kind === 'exception')) throw new Error('Native runtime exception'); await sleep(30); } throw new Error('Native beat timed out'); };
const cue = (kind, after, match = () => true) => until(r => r.kind === 'cue' && r.seq > after && r.cue === kind && match(r));
const shot = async name => {
  const folder = await mkdtemp(resolve(tmpdir(), 'snag-scene-b-shot-'));
  try {
    await consoleCommand('screenrecord screenshot ' + folder);
    const files = (await readdir(folder)).filter(file => file.endsWith('.png'));
    if (files.length !== 1) throw new Error('Require one fresh VVD-window screenshot');
    await copyFile(resolve(folder, files[0]), resolve(dir, name + '.png'));
  } finally { await rm(folder, { recursive: true, force: true }); }
  captures.push(name); console.log('Captured ' + name);
};
const startClip = async scene => { recording = scene; await consoleCommand('screenrecord start --size 1920x1080 --bit-rate 8M --fps 60 ' + resolve(root, 'docs/review/tv-' + scene + '.raw.mp4')); };
const stopClip = async () => { if (recording) { await consoleCommand('screenrecord stop'); recording = undefined; } };
const binary = (header, jpg) => { const h = Buffer.from(JSON.stringify(header)), n = Buffer.alloc(4); n.writeUInt32BE(h.length); phone.send(Buffer.concat([n, h, jpg])); };
try {
  // A command before the relay welcome can be overwritten by room initialization.
  const poll = setInterval(() => command({ command: 'snapshot' }), 200);
  try { await until(r => r.kind === 'snapshot' && r.ready && r.loaded && r.connected && r.code !== 'LOOP'); }
  finally { clearInterval(poll); }
  records.length = 0;
  command({ command: 'reset', speed: 1, seed: 1 }); await sleep(250); command({ command: 'snapshot' });
  await until(r => r.kind === 'snapshot' && r.phase === 'lobby');
  const code = snapshot.code;
  phone = new WebSocket(relay); await new Promise((ok, bad) => { phone.once('open', ok); phone.once('error', bad); });
  const send = m => phone.send(JSON.stringify(m));
  send({ t: 'hello', proto: 1, role: 'phone', code, cid: 'b0000000000000000000000000000002' }); await sleep(200);
  const join = () => send({ t: 'msg', m: { t: 'join', name: 'Sock Goblins', color: '#FF4FA0' } }); join(); await sleep(300);
  const jpeg = async (w, h) => sharp(Buffer.from(`<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="#FFF8EC"/><rect x="${w * .24}" y="${h * .16}" width="${w * .52}" height="${h * .68}" fill="#F23B2E"/><rect x="${w * .3}" y="${h * .2}" width="${w * .1}" height="${h * .45}" fill="#FF736A"/></svg>`)).jpeg({ quality: 80 }).toBuffer();
  const thumb = await jpeg(96, 64), photo = await jpeg(720, 720);
  command({ command: 'bots', start: true });
  const hunt = await cue('scene', 0, r => r.scene === 'hunt'); await startClip('hunt');
  const hunting = await cue('phase', hunt.seq, r => r.phase === 'hunt');
  thumbs = setInterval(() => binary({ t: 'thumb' }, thumb), 333);
  await sleep(1800); await shot('native-hunt-live');
  binary({ t: 'snag', round: 0, hex: '#F23B2E', match: 96, prompt: 'RED', roundKind: 'color' }, photo); clearInterval(thumbs);
  const snag = await cue('slam', hunting.seq, r => r.target?.startsWith('slot-card:'));
  await sleep(1000); await shot('native-hunt-snagged');
  const time = await cue('phase', snag.seq, r => r.phase === 'time'); await sleep(180); await shot('native-hunt-time');
  const glow = await cue('phase', time.seq, r => r.phase === 'glow'); await sleep(500); await shot('native-hunt-glowing');
  send({ t: 'msg', m: { t: 'glow', eyes: [[43, 47], [70, 47]], name: 'Ruby Rectangle', brag: 'A proper red letter day.' } });
  await sleep(300); await shot('native-hunt-ready');
  const judge = await cue('scene', glow.seq, r => r.scene === 'judge'); await stopClip(); await startClip('judge');
  await sleep(650); await shot('native-judge-backs');
  const scan = await cue('scan', judge.seq); await sleep(300); await shot('native-judge-scan');
  await cue('meter', scan.seq); await sleep(400); await shot('native-judge-meter');
  const banner = await cue('slam', scan.seq, r => r.target === 'judge.banner'); await sleep(950); await shot('native-judge-winner');
  command({ command: 'reduced', on: true }); await sleep(100); await shot('native-judge-reduced'); command({ command: 'reduced', on: false });
  await cue('scene', banner.seq, r => r.scene === 'stand'); await stopClip();
  // A missing real phone gets a zero-point card, with no fabricated object.
  command({ command: 'reset', speed: 3, seed: 1 }); await sleep(200); join(); await sleep(200); command({ command: 'bots', start: true });
  records.length = 0;
  await cue('phase', 0, r => r.phase === 'glow'); await shot('native-hunt-missed');
  // Final acceptance is a complete independent fast all-bot game.
  command({ command: 'reset', speed: 10, seed: 1 }); await sleep(200); records.length = 0; command({ command: 'bots', start: true });
  await until(r => r.kind === 'complete', 120000); command({ command: 'snapshot' }); await sleep(300);
  const complete = records.find(r => r.kind === 'complete');
  if (complete.exceptions !== 0) throw new Error('Native all-bot game reported exceptions');
  await writeFile(resolve(dir, 'native-worker-b.json'), JSON.stringify({ target: 'Vega Virtual Device', audio: 'Mac muted', images: 'memory-only synthetic JPEGs through relay', captures, complete, snapshot }, null, 2) + '\n');
  await writeFile(resolve(dir, 'native-game.jsonl'), records.map(r => JSON.stringify(r)).join('\n') + '\n');
  for (const scene of ['hunt', 'judge']) await run('ffmpeg', ['-y', '-i', resolve(root, 'docs/review/tv-' + scene + '.raw.mp4'), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-movflags', '+faststart', resolve(root, 'docs/review/tv-' + scene + '.mp4')]);
  console.log(JSON.stringify({ complete: true, exceptions: complete.exceptions, captures: captures.length }));
} finally { clearInterval(thumbs); await stopClip(); phone?.close(); control.close(); }
