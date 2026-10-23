// Native keyframes for reference/style.css's 2.2s hue cycle; no art is redrawn.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { chrome, repo } from './lib.mjs';
const file = join(repo, 'assets/manifest.json'), manifest = JSON.parse(await readFile(file, 'utf8'));
const directory = join(repo, 'assets/holograms'); await rm(directory, { recursive: true, force: true }); await mkdir(directory, { recursive: true });
for (const key of Object.keys(manifest.files)) if (key.startsWith('holograms/')) delete manifest.files[key];
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--mute-audio'] });
try {
  const page = await browser.newPage();
  for (const [id, object] of Object.entries(manifest.objects)) {
    const base = manifest.files[object.variants['384']], bytes = await readFile(join(repo, base.file));
    const layers = await page.evaluate(async ({ uri }) => {
      const image = new Image(); image.src = uri; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      return [0, 90, 180, 270].map(hue => {
        context.clearRect(0, 0, canvas.width, canvas.height); context.filter = `hue-rotate(${hue}deg)`; context.drawImage(image, 0, 0); context.filter = 'none';
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < pixels.data.length; i += 4) if (!pixels.data[i + 3]) pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 0;
        context.putImageData(pixels, 0, 0); return canvas.toDataURL('image/png').split(',')[1];
      });
    }, { uri: 'data:image/png;base64,' + bytes.toString('base64') });
    for (const [layer, encoded] of layers.entries()) {
      const png = Buffer.from(encoded, 'base64'), key = `holograms/${id}-${layer}`, target = 'assets/' + key + '.png';
      await writeFile(join(repo, target), png);
      const { frames: _frames, ...metadata } = base;
      manifest.files[key] = { ...metadata, file: target, source: 'reference/style.css hue cycle; original sticker at ' + layer * 90 + ' degrees', bytes: png.length, sha256: createHash('sha256').update(png).digest('hex') };
    }
  }
  manifest.totalBytes = Object.values(manifest.files).reduce((n, entry) => n + entry.bytes, 0);
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
  console.log('Baked four native hue keyframes for each of the 26 reference objects.');
} finally { await browser.close(); }
