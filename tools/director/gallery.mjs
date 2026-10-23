// Native-only showcase gallery. The phone uses a project-art fake camera; all
// resulting media travels through the real phone/relay path and stays in memory.
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer-core';
import { acquireVvdLock, bridgeRequest } from './vvd.mjs';
import { chrome, encode, outsideGit, probe, repo, run, wait } from './lib.mjs';
import { finishGalleryClip } from './gallery-video.mjs';

const { values } = parseArgs({ options: { bridge: { type: 'string', default: 'http://127.0.0.1:8791' }, 'stills-only': { type: 'boolean' }, 'phone-origin': { type: 'string' }, out: { type: 'string' } } });
const bridge = values.bridge, masters = await outsideGit(join(homedir(), 'builds/snag-and-brag/footage/stills'));
const out = resolve(values.out ?? join(repo, 'docs/gallery')); await mkdir(out, { recursive: true });
const take = await outsideGit(join(homedir(), 'builds/snag-and-brag/footage', 'native-gallery-' + Date.now()));
const capture = async command => {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await run('python3', [join(repo, 'spike/tooling/capture.py'), command], { timeout: 25_000, maxBuffer: 8000 });
      if (!result.stdout.includes('OK')) throw new Error('Window capture did not finish'); return;
    } catch (error) {
      // SCShareableContent can briefly omit the existing window. Retry discovery,
      // keeping the exact same single-window guard and never using console pixels.
      if (attempt >= 2 || !String(error.stderr).includes('Need exactly one windowed VVD')) throw error;
      await wait(500);
    }
  }
};
const until = async (check, label, limit = 20_000) => { const end = Date.now() + limit; while (!await check()) { if (Date.now() > end) throw new Error(label + ' timed out'); await wait(100); } };
const release = await acquireVvdLock(); let browser, fixture, phone, recording = false, receipt = { version: 1, capturedAt: new Date().toISOString(), target: 'native VVD / aarch64 Release / Hermes', source: 'macOS ScreenCaptureKit single VVD window', syntheticOnly: true, speed: 1, audio: 'silent; Mac and Chrome muted', stills: [] };
try {
  const status = await bridgeRequest(bridge, '/status'), plan = await bridgeRequest(bridge, '/plan');
  if ((await run('osascript', ['-e', 'get output muted of (get volume settings)'])).stdout.trim() !== 'true') throw new Error('The Mac must stay muted');
  if (!status.rendererReady || !status.syntheticOnly || !status.roomCode || !status.joinUrl) throw new Error('Attach the native showcase renderer and its local relay before filming');
  receipt.seed = status.seed; receipt.expectedScores = plan.scores;
  if (!values['stills-only']) {
    fixture = await mkdtemp(join(tmpdir(), 'snag-gallery-camera-'));
    const y4m = join(fixture, 'pink-glove.y4m');
    await encode(['-f', 'lavfi', '-i', 'color=c=0xFFF8EC:s=640x480:r=30', '-i', join(repo, 'assets/stickers/glove-384.png'), '-filter_complex', '[1:v]crop=384:384:128:144,scale=500:500[object];[0:v][object]overlay=70:-10:shortest=1', '-pix_fmt', 'yuv420p', '-frames:v', '1', y4m]);
    browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=' + y4m] });
    phone = await browser.newPage(); await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }); await phone.setCacheEnabled(false);
    await phone.evaluateOnNewDocument(() => {
      window.__gallery = { thumbnails: 0, snags: [], errors: [] };
      const Socket = window.WebSocket;
      window.WebSocket = class extends Socket {
        send(data) {
          if (data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(data), n = new DataView(data).getUint32(0, false);
            const h = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + n)));
            if (h.t === 'thumb') window.__gallery.thumbnails++;
            if (h.t === 'snag') { const bits = h.mask ? atob(h.mask) : ''; let cells = 0; for (const b of bits) for (let n = b.charCodeAt(0); n; n >>>= 1) cells += n & 1;
              window.__gallery.snags.push({ round: h.round, match: h.match, redaction: h.redaction, maskBytes: bits.length, cells, jpegBytes: bytes.length - 4 - n }); }
          }
          return super.send(data);
        }
      };
    });
    phone.on('pageerror', () => { receipt.phoneErrors = (receipt.phoneErrors ?? 0) + 1; });
    await bridgeRequest(bridge, '/seek', { atMs: plan.galleryBeats.lobby }); await wait(1000);
    const url = new URL(status.joinUrl); if (values['phone-origin']) { const origin = new URL(values['phone-origin']); if (!['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Fake phone must stay on loopback'); url.host = origin.host; url.protocol = origin.protocol; }
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Use the local mock relay for synthetic footage');
    await phone.goto(url.href); await phone.waitForSelector('#b-join');
    await until(async () => {
      const screen = await phone.evaluate(() => document.querySelector('.pscr.on')?.id);
      if (screen === 'p-lobby') return true;
      if (screen === 'p-join') { await phone.click('#b-join'); await wait(400); }
      return false;
    }, 'Phone join');
    const reel = plan.events.find(e => e.kind === 'phase' && e.phase === 'reel' && e.round === 0).atMs;
    const end = plan.galleryBeats['judge-win'];
    const stopAt = Math.min(end + 650, plan.scenes.find(s => s.name === 'pixel-judge').endMs - 150);
    await bridgeRequest(bridge, '/seek', { atMs: reel }); await wait(1200);
    const source = join(take, 'color-rush-source.mp4');
    await capture(`screenrecord start --size 1920x1080 --fps 60 --bit-rate 8000000 --time-limit 90 ${source}`); recording = true;
    await bridgeRequest(bridge, '/play', {}); let snapped = false, sent = false;
    const deadline = Date.now() + 100_000;
    while ((await bridgeRequest(bridge, '/status')).atMs < stopAt) {
      if (!(await bridgeRequest(bridge, '/status')).rendererReady) throw new Error('Native renderer disconnected during Color Rush');
      if (Date.now() > deadline) throw new Error('Normal-speed Color Rush did not reach the win');
      const screen = await phone.evaluate(() => document.querySelector('.pscr.on')?.id);
      if (screen === 'p-cam' && !snapped) { await wait(1600); await phone.click('#shutter'); snapped = true; }
      if (screen === 'p-glow' && !sent) { await wait(800); await phone.click('#b-send').catch(() => {}); sent = true; }
      await wait(100);
    }
    // Keep native motion/artwork mounted through the winner. Stop the recorder
    // before holding or seeking; the still pickups can then change drivers.
    await capture('screenrecord stop'); recording = false;
    await bridgeRequest(bridge, '/hold', {});
    receipt.phone = await phone.evaluate(() => window.__gallery);
    const snag = receipt.phone.snags.find(s => s.round === 0);
    if (!snag || snag.match < 95 || snag.maskBytes !== 72 || snag.cells < 1 || snag.redaction !== 'mediapipe' || receipt.phone.thumbnails < 1 || receipt.phoneErrors) {
      console.log(JSON.stringify({ phone: receipt.phone, phoneErrors: receipt.phoneErrors ?? 0 }));
      throw new Error('Fake-camera phone did not deliver a strong locally redacted pink snag and live feed');
    }
    const master = join(take, 'color-rush.mp4');
    await encode(['-i', source, '-an', '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-threads', '2', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', master]);
    const preview = join(out, 'color-rush.mp4');
    if ((await stat(master)).size <= 10_000_000) await copyFile(master, preview);
    else await encode(['-i', master, '-vf', 'scale=1280:720', '-an', '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-threads', '2', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', preview]);
    if ((await stat(preview)).size > 10_000_000) throw new Error('Native clip exceeds 10 MB');
    receipt.clip = { master, source, preview: 'color-rush.mp4', reelAtMs: reel, winAtMs: end, stopAtMs: stopAt, ...(await probe(preview)) };
  } else {
    const prior = JSON.parse(await readFile(join(out, 'capture.json'), 'utf8')); receipt.phone = prior.phone; receipt.clip = prior.clip;
  }
  const shots = [
    ['01-lobby', 'lobby'], ['02-prompt-reel', 'prompt-reel'], ['03-hunt-feeds', 'hunt-feeds'],
    ['04-pixel-judge', 'pixel-judge-mask'], ['05-brag-off-mash', 'brag-final-mash'], ['06-showstopper-win', 'showstopper-win'],
    ['07-standings-overtake', 'standings-overtake'], ['08-finale', 'finale'], ['09-pause-menu', 'hunt-feeds'],
  ];
  for (const [file, beat] of shots) {
    const atMs = plan.galleryBeats[beat]; if (!Number.isFinite(atMs)) throw new Error('Missing readable gallery beat: ' + beat);
    await bridgeRequest(bridge, '/seek', { atMs, ...(beat === 'pixel-judge-mask' ? { pose: 'judge-mask' } : beat === 'showstopper-win' ? { pose: 'hologram' } : {}) });
    if (file.startsWith('09')) await bridgeRequest(bridge, '/remote', { key: 'back' });
    await wait(1400);
    const held = await bridgeRequest(bridge, '/status'); if (!held.rendererReady || !held.held || Math.abs(held.atMs - atMs) > 1) throw new Error('Native renderer did not hold the requested pickup');
    const scratch = await mkdtemp(join(tmpdir(), 'snag-gallery-still-'));
    try {
      await capture('screenrecord screenshot ' + scratch);
      const name = (await readdir(scratch)).find(f => f.endsWith('.png')); if (!name) throw new Error('Missing native PNG');
      const master = join(masters, file + '.png'); await rename(join(scratch, name), master); await rename(join(scratch, name + '.capture.json'), master + '.capture.json');
      const preview = join(out, file + '.jpg');
      await encode(['-i', master, '-vf', 'scale=1280:720', '-q:v', '4', '-frames:v', '1', '-update', '1', preview]);
      if ((await stat(preview)).size > 400_000) throw new Error('Gallery JPEG exceeds 400 KB');
      receipt.stills.push({ file: file + '.jpg', master, atMs, width: 1920, height: 1080, bytes: (await stat(preview)).size, ...(beat === 'pixel-judge-mask' ? { mask: 'actual fake-camera phone mask held after all four meters settle' } : {}) });
      console.log(file + ': native held beat ' + atMs);
    } finally { await rm(scratch, { recursive: true, force: true }); }
  }
  if (!values['stills-only']) Object.assign(receipt.clip, await finishGalleryClip(receipt.clip.source,
    join(masters, '04-pixel-judge.png'), receipt.clip.master, join(out, 'color-rush.mp4')));
  await writeFile(join(out, 'capture.json'), JSON.stringify(receipt, null, 2) + '\n');
  await writeFile(join(take, 'capture.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log('Nine native stills and the Color Rush clip verified: ' + out);
} catch (error) {
  await writeFile(join(take, 'failed.json'), JSON.stringify({ ...receipt, failure: error.message }, null, 2) + '\n'); throw error;
} finally {
  if (recording) await capture('screenrecord stop').catch(() => {});
  await bridgeRequest(bridge, '/hold', {}).catch(() => {}); await browser?.close();
  if (fixture) await rm(fixture, { recursive: true, force: true }); await release();
}
