import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { PhotoCanvas } from './browser.js';
import { photoDir } from './paths.js';
import { fixturePath, type Manifest } from './manifest.js';

/** Only public source URLs listed in the fixture manifest; no player-photo input path. */
export async function downloadFixture(url: string): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['upload.wikimedia.org', 'thumb.wikimedia.org', 'cdn.stocksnap.io'].includes(parsed.hostname)) {
    throw new Error('Fixture fetch accepts only the approved public image hosts');
  }
  // Commons supplies analytics query strings that can bypass thumbnail caches.
  parsed.search = '';
  const response = await fetch(parsed, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'SnagBragEval/0.1 (public licensed fixtures)' } });
  if (!response.ok) throw new Error(`Fixture download HTTP ${response.status}`);
  const chunks: Uint8Array[] = []; let length = 0;
  const reader = response.body!.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 6 * 1024 * 1024) throw new Error('Fixture download exceeded 6 MB');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter(a => a !== '--');
  const input = args[0] ? resolve(args[0]) : resolve(photoDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(input, 'utf8')) as Manifest;
  const canvas = await PhotoCanvas.open();
  try {
    for (const photo of manifest.photos) {
      const path = fixturePath(photo);
      try {
        const current = await readFile(path);
        if (createHash('sha256').update(current).digest('hex') === photo.sha256) continue;
      } catch { /* A missing fixture is downloaded below. */ }
      const source = await downloadFixture(photo.downloadUrl);
      const capture = await canvas.capture(source);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, capture.jpeg);
      photo.fetched = new Date().toISOString().slice(0, 10);
      photo.sha256 = createHash('sha256').update(capture.jpeg).digest('hex');
      photo.bytes = capture.jpeg.length;
      photo.sourceWidth = capture.width; photo.sourceHeight = capture.height;
      // Public fixture bytes only. Originals are never written to disk.
      source.fill(0);
      process.stdout.write(`Fetched ${photo.id}: ${photo.bytes} bytes\n`);
      await writeFile(resolve(photoDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    }
    manifest.capture.encoder = await canvas.version();
    await writeFile(resolve(photoDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  } finally { await canvas.close(); }
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  main().catch(() => { process.stderr.write('Fixture fetch failed; originals remain in memory only.\n'); process.exitCode = 1; });
}
