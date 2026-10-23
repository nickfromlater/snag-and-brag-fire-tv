// Bake the approved Canvas backdrop into local, silent video. No player media,
// external requests or full game UI enter this asset pipeline.
import { readFile, mkdir, copyFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const root = resolve(import.meta.dirname, '../..');
const require = createRequire(resolve(root, 'tv/package.json'));
const puppeteer = require('puppeteer-core');
const fps = 30, frames = 300;
const source = await readFile(resolve(root, 'reference/src/game.js'), 'utf8');
const background = source.slice(source.indexOf('var BG={'), source.indexOf('var FX={'));
if (!background.startsWith('var BG={') || !background.includes('BG.draw=function')) throw new Error('Reference backdrop not found');
const folder = resolve(root, 'assets/stage-video'), raw = resolve(root, 'tv/assets/raw');
await mkdir(folder, { recursive: true }); await mkdir(raw, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--mute-audio', '--disable-gpu', '--force-color-profile=srgb'] });
const receipts = [];
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', r => /^(data:|blob:|about:)/.test(r.url()) ? r.continue() : r.abort());
  await page.setContent('<canvas id="tvbg" width="1280" height="720"></canvas>');
  await page.addScriptTag({ content: `var seed=1397637447;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
    var $=s=>document.querySelector(s),clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),rnd=(a,b)=>a+random()*(b-a),pick=a=>a[Math.floor(random()*a.length)];
    ${background}
    window.initialDoodles=JSON.parse(JSON.stringify(BG.doodles));` });
  for (const mood of ['normal', 'urgent', 'tension', 'party', 'gold']) {
    await page.evaluate(mood => {
      BG.mood = mood; BG.cur = JSON.parse(JSON.stringify(BG.pal[mood])); BG.tgt = BG.pal[mood];
      BG.t = BG.ang = 0; BG.doodles = JSON.parse(JSON.stringify(window.initialDoodles));
      BG.draw(0); window.firstBackground = document.createElement('canvas');
      window.firstBackground.width = 1280; window.firstBackground.height = 720;
      window.firstBackground.getContext('2d').drawImage(BG.c.canvas, 0, 0);
    }, mood);
    const file = resolve(folder, mood + '.mp4');
    const ffmpeg = spawn(process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-threads', '2',
      '-f', 'image2pipe', '-framerate', String(fps), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-threads', '2',
      '-preset', 'fast', '-crf', '20', '-profile:v', 'main', '-level:v', '3.1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', file],
      { stdio: ['pipe', 'ignore', 'inherit'] });
    const ended = once(ffmpeg, 'exit');
    for (let frame = 0; frame < frames; frame++) {
      const png = await page.evaluate(({ frame, fps, frames }) => {
        BG.draw(frame === 0 ? 0 : 1 / fps);
        // A short dissolve closes the decorative loop without a hard seam.
        const t = Math.max(0, (frame - (frames - fps)) / (fps - 1));
        if (t > 0) { BG.c.globalAlpha = t * t * (3 - 2 * t); BG.c.drawImage(window.firstBackground, 0, 0); BG.c.globalAlpha = 1; }
        return BG.c.canvas.toDataURL('image/png').split(',')[1];
      }, { frame, fps, frames });
      if (!ffmpeg.stdin.write(Buffer.from(png, 'base64'))) await once(ffmpeg.stdin, 'drain');
    }
    ffmpeg.stdin.end(); const [code] = await ended;
    if (code !== 0) throw new Error('Backdrop encoding failed: ' + mood);
    const bytes = (await stat(file)).size;
    if (bytes >= 10 * 1024 * 1024) throw new Error('Backdrop exceeds per-file limit');
    await copyFile(file, resolve(raw, 'stage-' + mood + '.mp4'));
    receipts.push({ mood, file: 'assets/stage-video/' + mood + '.mp4', bytes, width: 1280, height: 720, fps, frames, seconds: frames / fps, audio: false });
    console.log('Backdrop', mood, bytes, 'bytes');
  }
} finally { await browser.close(); }
await writeFile(resolve(folder, 'manifest.json'), JSON.stringify({ source: 'reference/src/game.js BG.draw', loopDissolveFrames: fps, clips: receipts }, null, 2) + '\n');
