import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';
const root = resolve(import.meta.dirname, '../..'), sharp = createRequire(resolve(root, 'relay/package.json'))('sharp');
const rows = [
  ['intro-slam', '1 · TITLE SLAM — ring behind the title'],
  ['judge-banner', '2 · PIXEL JUDGE — confetti behind the winner banner'],
  ['brag-knockout', '3 · BRAG KNOCKOUT — sparks/confetti beneath winner and host copy'],
  ['show-holography', '4 · SHOWSTOPPER — holography beneath find/team/ribbon copy'],
  ['champ-fireworks', '5 · CHAMPION — firework origins beside the rendered name'],
];
const width = 2560, header = 96, rowHeight = 766, height = header + rows.length * rowHeight + 64;
const annotations = [`<rect width="${width}" height="${height}" fill="#0E0B2B"/>`,
  '<text x="30" y="41" fill="#FFF8EC" font-size="30" font-weight="bold">Snag &amp; Brag · effects and text · 2026-10-14</text>',
  '<text x="30" y="78" fill="#FF4FA0" font-size="24" font-weight="bold">BEFORE</text>',
  '<text x="1310" y="78" fill="#B8F23B" font-size="24" font-weight="bold">AFTER · normal speed, seed 1, bot art, mock Polly, muted Chrome</text>'];
const composites = [];
for (const [i, [name, label]] of rows.entries()) {
  const y = header + i * rowHeight;
  annotations.push(`<text x="30" y="${y + 32}" fill="#FFF8EC" font-size="25" font-weight="bold">${label}</text>`);
  for (const [column, mode] of ['before', 'after'].entries()) composites.push({ input: resolve(root, 'docs/review/tv/polish1/effects/' + mode + '-' + name + '.png'), left: column * 1280, top: y + 46 });
}
annotations.push(`<text x="30" y="${height - 24}" fill="#FFF8EC" font-size="23">Separate live runs: particle randomness, speech progress and generated room codes may differ. No player media.</text>`);
const background = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><g font-family="sans-serif">${annotations.join('')}</g></svg>`);
const file = resolve(root, 'docs/review/tv/effects-text-before-after.png');
await sharp(background).composite(composites).png({ compressionLevel: 9 }).toFile(file);
const bytes = (await stat(file)).size; if (bytes > 10000000) throw new Error('Comparison exceeds 10 MB');
console.log(JSON.stringify({ file: 'docs/review/tv/effects-text-before-after.png', width, height, bytes }));
