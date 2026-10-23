import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..'), sharp = createRequire(resolve(root, 'relay/package.json'))('sharp');
const native = process.argv[2] === 'native', prefix = native ? 'native' : 'web', title = native ? 'VVD ACCEPTANCE' : 'WEB ITERATION — NATIVE ACCEPTANCE PENDING';
const label = (text, width) => ({ input: Buffer.from(`<svg width="${width}" height="44"><rect width="100%" height="100%" fill="#FFF8EC"/><text x="16" y="29" font-family="Arial" font-size="20" font-weight="bold" fill="#0E0B2B">${text}</text></svg>`) });
const groups = {
  hunt: [['tv-04-hunt-live-feeds.png', prefix + '-hunt-live.png'], ['tv-05-snagged.png', prefix + '-hunt-snagged.png']],
  judge: [['tv-06-pixel-judge.png', prefix + '-judge-winner.png']],
};
for (const [scene, rows] of Object.entries(groups)) {
  const layers = [];
  for (let i = 0; i < rows.length; i++) {
    const [reference, actual] = rows[i], top = i * 772;
    layers.push({ ...label('REFERENCE: ' + reference, 1280), left: 0, top });
    layers.push({ ...label(title + ' • RED SYNTHETIC FIXTURE', 1280), left: 1312, top });
    layers.push({ input: await sharp(resolve(root, 'reference/screens', reference)).resize(1280, 720).png().toBuffer(), left: 0, top: top + 44 });
    layers.push({ input: await sharp(resolve(root, 'docs/review/scene-b', actual)).resize(1280, 720).png().toBuffer(), left: 1312, top: top + 44 });
  }
  await sharp({ create: { width: 2592, height: rows.length * 772, channels: 4, background: '#0E0B2B' } }).composite(layers).png().toFile(resolve(root, 'docs/review/tv-' + scene + (native ? '' : '-web') + '-compare.png'));
}
console.log('Wrote ' + prefix + ' hunt and judge comparison sheets');
