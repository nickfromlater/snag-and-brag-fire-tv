// Physical display captures beside verify-live.mjs. Never use with real players.
// Screenshots perturb the device; measure frame rate in a separate run.
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

if (process.env.DEVICE_CAPTURE_SYNTHETIC !== '1' || !process.env.DEVICE_SERIAL || !process.env.DEVICE_VDA_TOOL)
  throw new Error('Requires an owned synthetic run, DEVICE_SERIAL and DEVICE_VDA_TOOL');
const root = resolve(import.meta.dirname, '../..'), require = createRequire(resolve(root, 'relay/package.json'));
const WebSocket = require('ws'), sharp = require('sharp'), execute = promisify(execFile);
const dir = resolve(process.env.DEVICE_CAPTURE_DIR ?? 'docs/review/stick-vs-mockup');
await mkdir(dir, { recursive: true });
const packageInfo = JSON.parse(await readFile(process.env.DEVICE_PACKAGE_INFO, 'utf8'));
const serial = process.env.DEVICE_SERIAL, vda = process.env.DEVICE_VDA_TOOL;
// Settled means the last useful pose in that phase, not an extended game clock.
const cases = [
  ['lobby', 'tv-01-lobby.png', 6, s => s.scene === 'lobby'],
  ['round-title', 'tv-02-round-title.png', 3, s => s.scene === 'intro' && s.phase === 'title'],
  ['prompt-reel', 'tv-03-prompt-reel.png', 3.3, s => s.scene === 'intro' && s.phase === 'reel'],
  ['countdown', 'tv-03-prompt-reel.png', 2.5, s => s.scene === 'intro' && s.phase === 'countdown'],
  ['hunt-feeds', 'tv-04-hunt-live-feeds.png', 8, s => s.scene === 'hunt' && s.phase === 'hunt'],
  ['glow-up', 'tv-05-snagged.png', 6, s => s.scene === 'hunt' && s.phase === 'glow'],
  ['color-rush', 'tv-06-pixel-judge.png', 8, s => s.scene === 'judge' && !s.banner],
  ['judge-winner', 'tv-06-pixel-judge.png', 3.2, s => s.scene === 'judge' && s.banner],
  ['brag-intro', 'tv-08-brag-lines.png', 3, s => s.scene === 'brag' && s.phase === 'brag-intro'],
  ['brag-lines', 'tv-08-brag-lines.png', 2.6, s => s.scene === 'brag' && s.phase === 'brag-lines'],
  ['brag-mash', 'tv-09-brag-mash.png', 4.5, s => s.scene === 'brag' && s.phase === 'mash'],
  ['knockout', 'tv-10-brag-knockout.png', 3.2, s => s.scene === 'brag' && s.phase === 'knockout'],
  ['showstopper', 'tv-11-showstopper-vote.png', 3.3, s => s.scene === 'show' && s.phase === 'runway'],
  ['show-vote', 'tv-11-showstopper-vote.png', 6, s => s.scene === 'show' && s.phase === 'vote'],
  ['show-winner', 'tv-12-showstopper-win.png', 4, s => s.scene === 'show' && !!s.winner],
  ['standings', 'tv-07-standings.png', 4.5, s => s.scene === 'stand'],
  ['finale-podium', 'tv-13-finale.png', 2.3, s => s.scene === 'champ' && s.phase === 'podium'],
  ['finale', 'tv-13-finale.png', 8, s => s.scene === 'champ' && s.phase === 'finale'],
].filter(c => !process.env.DEVICE_CAPTURE_ONLY || process.env.DEVICE_CAPTURE_ONLY.split(',').includes(c[0]));
let latest, ending = false, writes = Promise.resolve();
const shots = [], tasks = [], seen = new Set(), anchors = new Map();
if (process.env.DEVICE_CAPTURE_RESUME === '1') {
  const prior = JSON.parse(await readFile(resolve(dir, 'captures.json'), 'utf8'));
  if (!prior.syntheticMediaOnly || prior.packageSha256 !== packageInfo.packageSha256) throw new Error('Capture resume identity mismatch');
  shots.push(...prior.captures);
  for (const c of cases) if (['0.5s', '2s', 'settled'].every(t => shots.some(s => s.scene === c[0] && s.time === t))) seen.add(c[0]);
}
const vdaCall = args => execute(vda, ['-s', serial, ...args], { timeout: 45000, maxBuffer: 1024 * 1024 });
const metadata = s => s && Object.fromEntries(['at', 'scene', 'phase', 'round', 'completed', 'paused', 'active', 'teams', 'banner', 'winner', 'cardStage'].filter(k => k in s).map(k => [k, s[k]]));
const save = () => {
  writes = writes.then(() => writeFile(resolve(dir, 'captures.json'), JSON.stringify({
    ...packageInfo, syntheticMediaOnly: true,
    source: 'Physical retail stick composed display via gwsi-tool-screenshooter; no simulator/headless console',
    timing: 'Names are nominal request offsets from first observed native phase. Device timestamps bracket acquisition plus readback/PNG encoding; exact sub-frame timing is not certified. Capture runs are excluded from FPS acceptance.',
    captures: shots, missing: cases.filter(c => !['0.5s', '2s', 'settled'].every(t => shots.some(s => s.scene === c[0] && s.time === t))).map(c => c[0]),
  }, null, 2) + '\n'));
  return writes;
};
async function shot(c, time, seconds, entry) {
  if (shots.some(s => s.scene === c[0] && s.time === time)) return;
  await new Promise(r => setTimeout(r, Math.max(0, entry.at + seconds * 1000 - Date.now())));
  if (ending) return;
  const name = c[0] + '-' + time, remote = '/tmp/snag-lead29-' + name + '.png', temp = '/tmp/snag-lead29-' + name + '.png';
  const requestedAt = Date.now(), before = metadata(latest);
  try {
    const result = await vdaCall(['shell', 'date +%s.%N; gwsi-tool-screenshooter ' + remote + '; date +%s.%N']);
    const times = result.stdout.split(/\s+/).filter(v => /^\d{10}\.\d+$/.test(v)).map(Number);
    if (times.length !== 2) throw new Error('No device capture timing bounds');
    await vdaCall(['pull', remote, temp]);
    const native = await sharp(temp).metadata(), data = await sharp(temp).resize(1920, 1080).png().toBuffer();
    await writeFile(resolve(dir, name + '.png'), data);
    await sharp(data).resize(480, 270).png().toFile(resolve(dir, name + '-10ft.png'));
    shots.push({ scene: c[0], time, nominalSeconds: seconds, phaseObservedAt: entry.at,
      requestedAt, requestOffsetSeconds: +(requestedAt / 1000 - entry.at / 1000).toFixed(3),
      acquisitionBoundsSeconds: times.map(t => +(t - entry.at / 1000).toFixed(3)),
      run: process.env.DEVICE_CAPTURE_RUN ?? 'normal-speed synthetic hosted capture game',
      nativePixels: { width: native.width, height: native.height }, before, after: metadata(latest), file: name + '.png', reference: c[1],
    });
    if (time === 'settled') {
      const ref = await sharp(resolve(root, 'reference/screens', c[1])).resize(1920, 1080).toBuffer();
      await sharp({ create: { width: 3840, height: 1080, channels: 3, background: '#000' } }).composite([
        { input: data, left: 0, top: 0 }, { input: ref, left: 1920, top: 0 },
      ]).png().toFile(resolve(dir, c[0] + '-comparison.png'));
    }
    await save(); console.log('Captured', name, 'bounds', shots.at(-1).acquisitionBoundsSeconds.join('–') + 's');
  } finally {
    await vdaCall(['shell', 'rm -f ' + remote]);
    await unlink(temp).catch(() => {});
  }
}
const ws = new WebSocket('ws://127.0.0.1:8790/observe?runtime=native');
ws.on('message', bytes => {
  const m = JSON.parse(String(bytes));
  if (m.kind === 'cue' && m.cue === 'phase') anchors.set(m.round + '/' + m.phase, m.at);
  if (m.kind !== 'snapshot') return;
  latest = m;
  if (ending || !m.ready || !m.loaded || !m.audio || !m.active || m.paused) return;
  for (const c of cases) {
    if (seen.has(c[0]) || !c[3](m)) continue;
    seen.add(c[0]);
    const phaseAt = anchors.get(m.round + '/' + m.phase);
    // Lobby readiness and banner/winner transitions need their own observation.
    const at = ['lobby', 'round-title', 'color-rush', 'brag-intro', 'showstopper', 'standings', 'finale-podium', 'judge-winner', 'show-winner'].includes(c[0]) ? m.at : phaseAt ?? m.at;
    const entry = { ...m, at };
    console.log('Capturing', c[0], 'round', m.round);
    for (const [time, seconds] of [['0.5s', .5], ['2s', 2], ['settled', c[2]]]) tasks.push(shot(c, time, seconds, entry).catch(error => {
      console.error('Capture failed:', c[0], time, error.message.replaceAll(serial, '<device>')); process.exitCode = 1;
    }));
  }
  if (seen.size === cases.length && m.completed) void finish();
});
const poll = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ command: 'snapshot' })); }, 200);
async function finish() {
  clearInterval(poll); ws.close(); await Promise.all(tasks); await save(); ending = true;
}
ws.on('error', () => { process.exitCode = 1; void finish(); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { ending = true; void finish(); });
setTimeout(() => { process.exitCode = 1; ending = true; void finish(); }, 12 * 60 * 1000).unref();
