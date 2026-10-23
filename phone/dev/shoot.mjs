import puppeteer from 'puppeteer-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.join(root, 'docs/review');
const origin = process.env.PHONE_ORIGIN ?? 'http://127.0.0.1:5173';
const files = ['phone-01-join.png', 'phone-02-lobby.png', 'phone-03-mission.png', 'phone-04-camera.png', 'phone-05-glow-up.png', 'phone-06-wait-reactions.png', 'phone-07-mash.png', 'phone-08-vote.png', 'phone-09-end-card.png'];
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--mute-audio'] });
try {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1000, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${origin}/?gallery=1`, { waitUntil: 'networkidle0' });
  const iframes = await page.$$('.gallery iframe');
  if (iframes.length !== 9) throw new Error('Gallery did not render all nine screens.');
  const images = [];
  for (let i = 0; i < iframes.length; i++) {
    const frame = await iframes[i].contentFrame(); await frame.waitForSelector('#ps[data-screen]');
    await frame.evaluate(async () => {
      await document.fonts.ready;
      for (const animation of document.getAnimations()) {
        if (animation.effect?.getTiming().iterations === Infinity) { animation.pause(); animation.currentTime = 0; }
        else animation.finish();
      }
    });
    await iframes[i].screenshot({ path: path.join(out, files[i]) });
    images.push({ name: files[i], ours: (await readFile(path.join(out, files[i]))).toString('base64'), reference: (await readFile(path.join(root, 'reference/screens', files[i]))).toString('base64') });
  }
  if (errors.length) throw new Error(`Gallery browser errors: ${errors.join(', ')}`);
  await page.setViewport({ width: 820, height: 960, deviceScaleFactor: 1 });
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;padding:12px;background:#0A0E4A;color:#FFF8EC;font:800 14px Arial}header{display:grid;grid-template-columns:390px 390px;gap:16px;padding:8px 0 16px;color:#FFD43B}section{margin-bottom:16px}h2{margin:0 0 8px;font-size:14px}.row{display:flex;gap:16px}img{width:390px;height:844px;display:block}</style><header><div>PHONE · w/phone</div><div>APPROVED MOCKUP</div></header>${images.map((image) => `<section><h2>${image.name}</h2><div class="row"><img src="data:image/png;base64,${image.ours}"><img src="data:image/png;base64,${image.reference}"></div></section>`).join('')}`);
  await page.screenshot({ path: path.join(out, 'phone-compare.png'), fullPage: true });
  await writeFile(path.join(out, 'phone-shoot.txt'), `Nine synthetic fixture screenshots, 390×844 each.\nLeft: w/phone. Right: approved reference, normalized from 465×1025 to 390×844.\nBrowser errors: ${errors.length}.\nCamera fixture is synthetic; no player photos are captured or saved.\n`);
  console.log(`Saved nine screens and ${path.join(out, 'phone-compare.png')}`);
} finally { await browser.close(); }
