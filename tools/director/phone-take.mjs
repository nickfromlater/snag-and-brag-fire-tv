// Submission video: the real phone controller beside the native VVD showcase.
// Records the phone page (CDP screencast, frames tagged with the showcase clock)
// for the whole game, and the VVD window for round one so the TV shows the
// phone's own photo. Fake camera = project glove art; nothing leaves loopback.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer-core';
import { acquireVvdLock, bridgeRequest } from './vvd.mjs';
import { chrome, encode, repo, run, wait } from './lib.mjs';

const { values } = parseArgs({ options: { bridge: { type: 'string', default: 'http://127.0.0.1:8791' }, out: { type: 'string' } } });
const bridge = values.bridge, out = resolve(values.out); await mkdir(join(out, 'phone'), { recursive: true });
const capture = cmd => run('python3', [join(repo, 'spike/tooling/capture.py'), ...cmd.split(' ')], { timeout: 25_000, maxBuffer: 8000 });
const release = await acquireVvdLock();
let browser, fixture, recording = false; const frames = [], log = [];
try {
  const status = await bridgeRequest(bridge, '/status'), plan = await bridgeRequest(bridge, '/plan');
  await writeFile(join(out, 'plan.json'), JSON.stringify(plan));
  if (!status.rendererReady) throw new Error('Attach the native showcase renderer first');
  fixture = await mkdtemp(join(tmpdir(), 'snag-phone-camera-'));
  const y4m = join(fixture, 'pink-glove.y4m');
  await encode(['-f', 'lavfi', '-i', 'color=c=0xFFF8EC:s=640x480:r=30', '-i', join(repo, 'assets/stickers/glove-384.png'), '-filter_complex', '[1:v]crop=384:384:128:144,scale=500:500[object];[0:v][object]overlay=70:-10:shortest=1', '-pix_fmt', 'yuv420p', '-frames:v', '90', '-f', 'yuv4mpegpipe', y4m]);
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=' + y4m] });
  const phone = await browser.newPage();
  await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  phone.on('pageerror', e => log.push({ pageerror: String(e).slice(0, 200) }));
  await bridgeRequest(bridge, '/seek', { atMs: plan.galleryBeats.lobby ?? 0 }); await wait(1000);

  // Clock: atMs while playing = playAt + (now - playWall); holds are not used after /play.
  let clock = null; const atNow = () => clock ? clock.at + (Date.now() - clock.wall) : -1;
  const cdp = await phone.createCDPSession(); let n = 0;
  cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
    const file = join(out, 'phone', String(n++).padStart(6, '0') + '.jpg');
    frames.push({ file, wall: Date.now(), atMs: atNow() });
    writeFile(file, Buffer.from(data, 'base64')).catch(() => {});
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 });

  const url = new URL(status.joinUrl);
  await phone.goto(url.href); await phone.waitForSelector('#b-join'); await wait(1500);
  const screen = () => phone.evaluate(() => document.querySelector('.pscr.on')?.id);
  for (let i = 0; i < 100 && await screen() !== 'p-lobby'; i++) { if (await screen() === 'p-join') { await phone.click('#b-join').catch(() => {}); } await wait(400); }
  log.push({ joined: await screen() }); await wait(2500);

  const reel = plan.events.find(e => e.kind === 'phase' && e.phase === 'reel' && e.round === 0).atMs;
  const r1End = plan.galleryBeats['judge-win'] + 1500;
  await bridgeRequest(bridge, '/seek', { atMs: reel }); await wait(1200);
  await capture(`screenrecord start --size 1920x1080 --fps 60 --bit-rate 8000000 --time-limit 160 ${join(out, 'tv-round1.mp4')}`); recording = true;
  const playWall = Date.now(); await bridgeRequest(bridge, '/play', {}); clock = { at: reel, wall: playWall };
  log.push({ tvRecordStartAtMs: reel, playWall });
  let snapped = new Set(), sent = new Set(), voted = new Set(), lastMash = 0;
  while (true) {
    const st = await bridgeRequest(bridge, '/status');
    if (st.completed || st.atMs >= plan.durationMs - 200) break;
    if (!st.rendererReady) throw new Error('renderer disconnected');
    if (recording && st.atMs > r1End) { await capture('screenrecord stop'); recording = false; log.push({ tvRecordStopAtMs: st.atMs }); }
    const s = await screen(); const round = Math.floor(st.atMs / 1000);
    if (s === 'p-cam' && !snapped.has(round - (round % 60))) { await wait(1600); await phone.click('#shutter').catch(() => {}); snapped.add(round - (round % 60)); log.push({ snap: atNow() }); }
    if (s === 'p-glow' && !sent.has(round - (round % 60))) { await wait(2500); await phone.click('#b-send').catch(() => {}); sent.add(round - (round % 60)); log.push({ send: atNow() }); }
    if (s === 'p-mash' && Date.now() - lastMash > 90) { lastMash = Date.now(); await phone.evaluate(() => { const b = document.querySelector('#p-mash button, #p-mash [data-mash], #p-mash'); b?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }).catch(() => {}); }
    if (s === 'p-vote' && !voted.has(round - (round % 30))) { await wait(1800); await phone.evaluate(() => { const b = [...document.querySelectorAll('#p-vote button')].find(x => !x.disabled); b?.click(); }).catch(() => {}); voted.add(round - (round % 30)); log.push({ vote: atNow() }); }
    await wait(80);
  }
  await cdp.send('Page.stopScreencast').catch(() => {});
  await wait(500);
} finally {
  if (recording) await capture('screenrecord stop').catch(() => {});
  await writeFile(join(out, 'phone-frames.json'), JSON.stringify({ frames, log }, null, 1)).catch(() => {});
  await bridgeRequest(bridge, '/hold', {}).catch(() => {}); await browser?.close();
  if (fixture) await rm(fixture, { recursive: true, force: true }); await release();
}
console.log('phone frames', frames.length, JSON.stringify(log).slice(0, 600));
