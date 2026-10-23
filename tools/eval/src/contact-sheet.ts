import { readFile } from 'node:fs/promises';
import sharp, { type OverlayOptions } from 'sharp';
import { COLORS, JUDGE_MASK_CELLS, TOKENS } from '@snag/shared';
import { fixturePath, type Photo } from './manifest.js';

export interface SheetResult { id: string; targets: Record<string, { match: number; mask: string }> }
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** All objects × all six targets in one sheet. Overlay is the transmitted 24×24 grid. */
export async function contactSheet(photos: Photo[], results: SheetResult[], path: string, previews?: Map<string, Buffer>): Promise<void> {
  const left = 188, cellW = 152, rowH = 162, top = 86, thumb = 128;
  const width = left + cellW * COLORS.length, height = top + rowH * photos.length;
  const composite: OverlayOptions[] = [];
  composite.push({ input: Buffer.from(`<svg width="${width}" height="${top}"><rect width="${width}" height="${top}" fill="${TOKENS.cobalt}"/><text x="12" y="24" font-size="19" fill="white">Pixel Judge ${previews ? 'after phone redaction' : 'on source fixtures'} — scores + matched-cell overlay</text><text x="12" y="44" font-size="12" fill="white">720 px JPEG q .8 → ${previews ? 'FaceRedactor → ' : ''}Chrome 480 px canvas; center 60%; closest 20%</text>${COLORS.map((c, i) => `<rect x="${left + i * cellW}" y="55" width="${cellW - 8}" height="24" fill="${c.hex}"/><text x="${left + i * cellW + 5}" y="73" font-size="13" fill="${TOKENS.ink}">${c.k}</text>`).join('')}</svg>`), left: 0, top: 0 });
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]!, result = results.find(r => r.id === photo.id)!;
    const y = top + i * rowH;
    const lines = photo.subject.match(/.{1,23}(?:\s|$)|.{1,23}/g)?.map(s => s.trim()).slice(0, 3) ?? [];
    const roles = Object.entries(photo.colors).filter(([, role]) => role !== 'distractor').map(([c, role]) => `${c}:${role}`).join(' ');
    composite.push({ input: Buffer.from(`<svg width="${left}" height="${rowH}"><text x="8" y="20" font-size="12" font-weight="bold">${escape(photo.id)}</text>${lines.map((line, n) => `<text x="8" y="${40 + n * 16}" font-size="12">${escape(line)}</text>`).join('')}<text x="8" y="100" font-size="10">${escape(roles.slice(0, 30))}</text><text x="8" y="116" font-size="10">${escape(roles.slice(30, 60))}</text></svg>`), left: 0, top: y });
    const image = await sharp(previews?.get(photo.id) ?? await readFile(fixturePath(photo))).resize(thumb, thumb).jpeg({ quality: 85 }).toBuffer();
    for (let c = 0; c < COLORS.length; c++) {
      const target = COLORS[c]!, judgment = result.targets[target.k]!, bits = Buffer.from(judgment.mask, 'base64');
      const x = left + c * cellW;
      composite.push({ input: image, left: x, top: y + 4 });
      const rectangles: string[] = [];
      for (let bit = 0; bit < JUDGE_MASK_CELLS ** 2; bit++) {
        if (!(bits[bit >>> 3]! & (1 << (bit & 7)))) continue;
        rectangles.push(`<rect x="${(bit % JUDGE_MASK_CELLS) * thumb / JUDGE_MASK_CELLS}" y="${Math.floor(bit / JUDGE_MASK_CELLS) * thumb / JUDGE_MASK_CELLS}" width="${thumb / JUDGE_MASK_CELLS}" height="${thumb / JUDGE_MASK_CELLS}" fill="#B8F23B" fill-opacity=".32" stroke="#0E0B2B" stroke-opacity=".45" stroke-width=".4"/>`);
      }
      composite.push({ input: Buffer.from(`<svg width="${thumb}" height="${thumb}">${rectangles.join('')}</svg>`), left: x, top: y + 4 });
      composite.push({ input: Buffer.from(`<svg width="${cellW}" height="28"><text x="2" y="20" font-size="14" font-weight="bold">${judgment.match}% ${escape(photo.colors[target.k] ?? 'untagged')}</text></svg>`), left: x, top: y + thumb + 4 });
    }
  }
  await sharp({ create: { width, height, channels: 3, background: TOKENS.paper } }).composite(composite).jpeg({ quality: 86 }).toFile(path);
}
