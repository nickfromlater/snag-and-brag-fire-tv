import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import sharp from 'sharp';
import { readManifest, fixturePath } from './manifest.js';
import { photoDir, reviewDir } from './paths.js';

export async function validateFixtures(): Promise<{ objects: number; faces: number; jpegBytes: number; folderBytes: number; files: number }> {
  const manifest = await readManifest();
  let jpegBytes = 0;
  for (const photo of manifest.photos) {
    const jpeg = await readFile(fixturePath(photo));
    const metadata = await sharp(jpeg).metadata();
    if (metadata.width !== 720 || metadata.height !== 720 || metadata.format !== 'jpeg') throw new Error(`${photo.id}: wrong capture format`);
    if (metadata.exif || metadata.xmp || metadata.iptc) throw new Error(`${photo.id}: unexpected retained source metadata`);
    // Chrome adds its own standard sRGB ICC on canvas JPEG export; this is color
    // information, not retained source EXIF/GPS or personal metadata.
    if (metadata.space !== 'srgb') throw new Error(`${photo.id}: expected sRGB capture`);
    if (jpeg.length !== photo.bytes || createHash('sha256').update(jpeg).digest('hex') !== photo.sha256) throw new Error(`${photo.id}: fixture receipt mismatch`);
    jpegBytes += jpeg.length;
  }
  const files = await readdir(photoDir, { recursive: true });
  let folderBytes = 0;
  const listed = new Set(manifest.photos.map(p => p.file));
  for (const file of files) {
    const path = resolve(photoDir, file), info = await stat(path);
    if (!info.isFile()) continue;
    folderBytes += info.size;
    if (/\.(jpg|jpeg|png|webp)$/i.test(path) && !listed.has(relative(photoDir, path))) throw new Error(`Unlisted photo: ${file}`);
  }
  if (folderBytes >= 15_000_000) throw new Error('Photo folder exceeds the 15 MB budget');
  return { objects: manifest.photos.filter(p => p.kind === 'object').length, faces: manifest.photos.filter(p => p.kind === 'face').length, jpegBytes, folderBytes, files: manifest.photos.length };
}

if (process.argv[1]?.endsWith('validate.ts')) {
  validateFixtures().then(async result => {
    await mkdir(reviewDir, { recursive: true });
    await writeFile(resolve(reviewDir, 'fixtures-check.json'), JSON.stringify(result, null, 2) + '\n');
    process.stdout.write(JSON.stringify(result) + '\n');
  }).catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1; });
}
