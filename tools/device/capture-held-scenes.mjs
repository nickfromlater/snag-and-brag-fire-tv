// Native held-pose review through the existing opt-in director. No web/VVD pixels.
// Normal-speed failures/FPS are separate evidence; seeking suppresses old cues.
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

if (process.env.DEVICE_CAPTURE_SYNTHETIC !== '1' || !process.env.DEVICE_SERIAL || !process.env.DEVICE_VDA_TOOL)
  throw new Error('Owned synthetic physical device required');
const root = resolve(import.meta.dirname, '../..'), require = createRequire(resolve(root, 'relay/package.json'));
const WebSocket = require('ws'), sharp = require('sharp'), execute = promisify(execFile);
const dir = resolve(process.env.DEVICE_CAPTURE_DIR ?? 'docs/review/stick-vs-mockup');
const identity = JSON.parse(await readFile(process.env.DEVICE_PACKAGE_INFO, 'utf8'));
if (!identity.flags.showcase) throw new Error('Held capture requires the inspected opt-in package');
const serial = process.env.DEVICE_SERIAL, vda = process.env.DEVICE_VDA_TOOL;
const origin = 'http://127.0.0.1:8791', wait = ms => new Promise(r => setTimeout(r, ms));
const request = async (path, body) => {
  const response = await fetch(origin + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!response.ok) throw new Error('Director request rejected'); return response.json();
};
const plan = await request('/plan');
let status = await request('/status');
const readyDeadline = Date.now() + 30000;
while (!status.rendererReady && Date.now() < readyDeadline) { await wait(250); status = await request('/status'); }
if (!status.syntheticOnly || !status.rendererReady) throw new Error('Attach the physical native renderer first');
const phase = (name, round) => plan.events.find(e => e.kind === 'phase' && e.phase === name && e.round === round).atMs;
const scene = (name, round) => plan.events.find(e => e.kind === 'scene' && e.scene === name && e.round === round).atMs + 470;
const slam = target => plan.events.find(e => e.kind === 'slam' && e.target === target).atMs;
const lastPose = (base, fallback) => Math.min(base + fallback, (plan.events.find(e => e.kind === 'phase' && e.atMs > base && e.phase !== 'reel')?.atMs ?? plan.durationMs) - 50);
const cases = [
  ['lobby', scene('lobby', -1) - 470, 6500, 'tv-01-lobby.png'],
  ['round-title', scene('intro', 0), scene('intro', 0) + 3000, 'tv-02-round-title.png'],
  ['prompt-reel', phase('reel', 0), plan.galleryBeats['prompt-reel'], 'tv-03-prompt-reel.png'],
  ['countdown', phase('countdown', 0), phase('countdown', 0) + 2500, 'tv-03-prompt-reel.png'],
  ['hunt-feeds', phase('hunt', 0), phase('hunt', 0) + 8000, 'tv-04-hunt-live-feeds.png'],
  ['glow-up', phase('glow', 0), phase('judge', 0) - 50, 'tv-05-snagged.png'],
  ['color-rush', scene('judge', 0), plan.galleryBeats['judge-win'], 'tv-06-pixel-judge.png'],
  ['judge-winner', slam('judge.banner'), plan.galleryBeats['judge-win'], 'tv-06-pixel-judge.png'],
  ['brag-intro', scene('brag', 1), lastPose(scene('brag', 1), 3000), 'tv-08-brag-lines.png'],
  ['brag-lines', phase('brag-lines', 1), lastPose(phase('brag-lines', 1), 2900), 'tv-08-brag-lines.png'],
  ['brag-mash', phase('mash', 1), phase('mash', 1) + 4500, 'tv-09-brag-mash.png'],
  ['knockout', phase('knockout', 1), lastPose(phase('knockout', 1), 3200), 'tv-10-brag-knockout.png'],
  ['showstopper', scene('show', 2), phase('vote', 2) - 50, 'tv-11-showstopper-vote.png'],
  ['show-vote', phase('vote', 2), phase('tally', 2) - 50, 'tv-11-showstopper-vote.png'],
  ['show-winner', slam('show.ribbon'), plan.galleryBeats['showstopper-win'], 'tv-12-showstopper-win.png'],
  ['standings', scene('stand', 0), scene('stand', 0) + 4500, 'tv-07-standings.png'],
  ['finale-podium', scene('champ', 3), phase('finale', 3) - 50, 'tv-13-finale.png'],
  ['finale', phase('finale', 3), plan.galleryBeats.finale, 'tv-13-finale.png'],
];
const call = args => execute(vda, ['-s', serial, ...args], { timeout: 45000, maxBuffer: 1024 * 1024 });
let native, phone, photoReady = false, phoneError;
const observer = new WebSocket('ws://127.0.0.1:8790/observe?runtime=native');
observer.on('message', bytes => { const m = JSON.parse(String(bytes)); if (m.kind === 'snapshot') native = m; if (m.kind === 'showcase-photo' && m.ready) photoReady = true; });
const poll = setInterval(() => { if (observer.readyState === 1) observer.send(JSON.stringify({ command: 'snapshot' })); }, 400);
const until = async (test, label) => { const end = Date.now() + 30000; while (!test()) { if (phoneError) throw new Error(phoneError); if (Date.now() > end) throw new Error(label + ' timed out'); await wait(100); } };
const captures = [], media = [];
await mkdir(dir, { recursive: true });
if (process.env.DEVICE_CAPTURE_RESUME === '1') {
  const prior = JSON.parse(await readFile(resolve(dir, 'captures.json'), 'utf8'));
  if (!prior.syntheticMediaOnly || prior.packageSha256 !== identity.packageSha256 || !prior.captureMode?.startsWith('held')) throw new Error('Held capture resume identity mismatch');
  captures.push(...prior.captures);
}
const save = () => writeFile(resolve(dir, 'captures.json'), JSON.stringify({ ...identity,
  source: 'Physical retail Fire TV Stick composed display via gwsi-tool-screenshooter; existing native director holds exact core poses',
  syntheticMediaOnly: true, captureMode: 'held native diagnostic poses, not normal-speed gameplay or FPS acceptance',
  timing: '0.5s and 2s are exact scripted core offsets from scene/phase entry (component scenes include the 470ms swap). Settled uses the recorded core beat. Readback happens while the core pose is held. Native animation/transient behavior must be judged from the separate live run.',
  captures, missing: cases.filter(c => !['0.5s', '2s', 'settled'].every(t => captures.some(s => s.scene === c[0] && s.time === t))).map(c => c[0]),
}, null, 2) + '\n');
try {
  await until(() => native?.ready && native?.loaded && native?.active && native?.audio, 'Native ready');
  // RAM-only approved glove art delivered as a synthetic JPEG/thumbnail through
  // the hosted phone protocol. No browser camera, AI call or real media source.
  const rgba = await sharp(resolve(root, 'assets/stickers/glove-384.png')).resize(520, 520).toBuffer();
  const photo = await sharp({ create: { width: 720, height: 720, channels: 3, background: '#FFF8EC' } }).composite([{ input: rgba, left: 100, top: 80 }]).jpeg({ quality: 85 }).toBuffer();
  const thumb = await sharp(photo).resize(96, 64).jpeg().toBuffer(); media.push(photo, thumb);
  let joined = false;
  phone = new WebSocket('wss://d2q0olvpmfmvjn.cloudfront.net/ws');
  phone.on('error', () => { phoneError = 'Synthetic phone connection failed'; });
  phone.on('open', () => phone.send(JSON.stringify({ t: 'hello', proto: 1, role: 'phone', code: native.code, cid: randomBytes(16).toString('hex') })));
  phone.on('message', (bytes, binary) => {
    if (binary) return; const e = JSON.parse(String(bytes));
    if (e.t === 'error') { phoneError = 'Synthetic phone rejected'; return; }
    if (e.t === 'msg' && e.m.t === 'screen' && e.m.s.k === 'join' && !joined) {
      joined = true; phone.send(JSON.stringify({ t: 'msg', m: { t: 'join', name: 'Device Capture', color: '#FF4FA0' } }));
    }
  });
  await until(() => joined, 'Synthetic phone join');
  const binary = (header, payload) => {
    const h = Buffer.from(JSON.stringify(header)), b = Buffer.alloc(4 + h.length + payload.length);
    b.writeUInt32BE(h.length); h.copy(b, 4); payload.copy(b, 4 + h.length); phone.send(b, () => b.fill(0));
  };
  await request('/seek', { atMs: phase('hunt', 0) + 1800 }); await wait(1000);
  for (let n = 0; n < 3; n++) { binary({ t: 'thumb' }, thumb); await wait(350); }
  binary({ t: 'snag', round: 0, hex: '#FF4FA0', match: 99, prompt: 'Pink', roundKind: 'color', redaction: 'none', mask: Buffer.alloc(72, 255).toString('base64') }, photo);
  await until(() => photoReady, 'Synthetic native photo'); await wait(1500);
  for (const c of cases) for (const [time, offset] of [['0.5s', 500], ['2s', 2000], ['settled', c[2] - c[1]]]) {
    if (process.env.DEVICE_CAPTURE_ONLY && !process.env.DEVICE_CAPTURE_ONLY.split(',').includes(c[0]) || captures.some(s => s.scene === c[0] && s.time === time)) continue;
    const atMs = c[1] + offset;
    await request('/seek', { atMs }); await wait(1400);
    const held = await request('/status');
    if (!held.rendererReady || !held.held || held.atMs !== atMs) throw new Error('Native hold identity failed');
    const name = c[0] + '-' + time, remote = '/tmp/snag-held-' + name + '.png', temp = '/tmp/snag-held-' + name + '.png';
    const before = native;
    try {
      const result = await call(['shell', 'date +%s.%N; gwsi-tool-screenshooter ' + remote + '; date +%s.%N']);
      const bounds = result.stdout.split(/\s+/).filter(v => /^\d{10}\.\d+$/.test(v)).map(Number);
      await call(['pull', remote, temp]);
      const metadata = await sharp(temp).metadata(), png = await sharp(temp).resize(1920, 1080).png().toBuffer();
      await writeFile(resolve(dir, name + '.png'), png);
      await sharp(png).resize(480, 270).png().toFile(resolve(dir, name + '-10ft.png'));
      captures.push({ scene: c[0], time, coreEntryAtMs: c[1], coreAtMs: atMs, offsetMs: offset, held: true,
        nativeScene: before.scene, nativePhase: before.phase, nativeRound: before.round,
        deviceReadbackBoundsEpochSeconds: bounds, nativePixels: { width: metadata.width, height: metadata.height }, file: name + '.png', reference: c[3] });
      if (time === 'settled') {
        const ref = await sharp(resolve(root, 'reference/screens', c[3])).resize(1920, 1080).toBuffer();
        await sharp({ create: { width: 3840, height: 1080, channels: 3, background: '#000' } }).composite([{ input: png, left: 0, top: 0 }, { input: ref, left: 1920, top: 0 }]).png().toFile(resolve(dir, c[0] + '-comparison.png'));
      }
      await save(); console.log('Held physical capture', name, 'core', atMs, before.scene, before.phase);
    } finally { await call(['shell', 'rm -f ' + remote]); await unlink(temp).catch(() => {}); }
  }
} catch (error) { console.error(error.message.replaceAll(serial, '<device>')); process.exitCode = 1; }
finally { clearInterval(poll); observer.close(); phone?.close(); for (const b of media) b.fill(0); await save(); }
