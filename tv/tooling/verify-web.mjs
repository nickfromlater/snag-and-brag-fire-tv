import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..'), output = resolve(root, 'docs/review/tv');
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--mute-audio','--force-color-profile=srgb'] });
try {
  const page = await browser.newPage(), errors = [], scenes = new Set();
  page.on('pageerror', e => { errors.push(e.message.replace(/https?:\S+/g, '<url>')); });
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(process.env.TV_WEB_URL ?? 'http://127.0.0.1:5174');
  await page.waitForFunction(() => window.__snagTv?.ready && document.fonts.check('27px Rubik'), { timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: resolve(output, 'web-lobby.png') });
  await page.keyboard.press('Enter'); await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: resolve(output, 'web-lobby-menu.png') });
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.__snagTv.command({ command: 'reset', speed: 10 }); window.__snagTv.command({ command: 'bots', start: true }); });
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => { const v = window.__snagTv.getView(); return { scene: v.scene, complete: v.completed }; });
    scenes.add(state.scene); if (state.complete) break;
    await new Promise(r => setTimeout(r, 100));
  }
  const complete = await page.evaluate(() => window.__snagTv.getView().completed);
  await page.screenshot({ path: resolve(output, 'web-finale.png') });
  const receipt = { webIterationOnly: true, audio: 'muted', photos: 'all bots; none loaded', complete, scenes: [...scenes], exceptions: errors, chrome: await browser.version() };
  await writeFile(resolve(output, 'web-verification.json'), JSON.stringify(receipt, null, 2) + '\n');
  if (!complete || errors.length) throw new Error(JSON.stringify(receipt));
  console.log(JSON.stringify(receipt));
} finally { await browser.close(); }
