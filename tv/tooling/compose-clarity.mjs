import { createRequire } from 'node:module';
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const sharp = createRequire(resolve(root, 'relay/package.json'))('sharp');
const output = resolve(root, 'docs/review/clarity');
const beats = JSON.parse(await readFile(resolve(output, 'beats.json'), 'utf8'));
const refs = [
  'reference/screens/tv-01-lobby.png', 'docs/review/clarity/mockup/round-1-title.png',
  'reference/screens/tv-03-prompt-reel.png', 'docs/review/clarity/mockup/countdown.png',
  'reference/screens/tv-04-hunt-live-feeds.png', 'reference/screens/tv-05-snagged.png',
  'docs/review/clarity/mockup/glow-up.png', 'reference/screens/tv-06-pixel-judge.png',
  'reference/screens/tv-06-pixel-judge.png', 'reference/screens/tv-07-standings.png',
  'reference/screens/tv-08-brag-lines.png', 'reference/screens/tv-09-brag-mash.png',
  'reference/screens/tv-10-brag-knockout.png', 'reference/screens/tv-11-showstopper-vote.png',
  'reference/screens/tv-12-showstopper-win.png', 'reference/screens/tv-13-finale.png',
  'docs/review/clarity/mockup/round-2-title.png', 'docs/review/clarity/mockup/round-3-title.png',
  'reference/screens/tv-04-hunt-live-feeds.png', 'reference/screens/tv-04-hunt-live-feeds.png',
];
const manifest = [];
for (const [i, [name]] of beats.entries()) {
  const ref = resolve(root, refs[i]);
  await access(ref);
  const inputs = [ref, resolve(output, 'before', name + '.png'), resolve(output, 'after', name + '.png')];
  const captions = ['APPROVED MOCKUP', 'BEFORE', 'AFTER · CLARITY'];
  const panels = await Promise.all(inputs.map(async (file, index) => ({
    input: await sharp(file).resize(1920, 1080, { fit: 'contain', background: '#0E0B2B' }).png().toBuffer(),
    left: index * 1920, top: 60,
  })));
  const labels = Buffer.from('<svg width="5760" height="60">' + captions.map((t, n) => '<text x="' + (n * 1920 + 24) + '" y="41" font-family="Arial" font-weight="bold" font-size="30" fill="#FFF8EC">' + t + '</text>').join('') + '</svg>');
  const compare = resolve(output, name + '-compare.png');
  await sharp({ create: { width: 5760, height: 1140, channels: 3, background: '#0E0B2B' } }).composite([...panels, { input: labels, left: 0, top: 0 }]).png().toFile(compare);
  await Promise.all([
    sharp(inputs[1]).resize(480, 270).png().toFile(resolve(output, name + '-before-10ft.png')),
    sharp(inputs[2]).resize(480, 270).png().toFile(resolve(output, name + '-10ft.png')),
    sharp(compare).resize(1440, 285).png().toFile(resolve(output, name + '-compare-10ft.png')),
  ]);
  manifest.push({ name, reference: refs[i], before: 'before/' + name + '.png', after: 'after/' + name + '.png', compare: name + '-compare.png', couch: name + '-10ft.png' });
}
await writeFile(resolve(output, 'images.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Composed ' + manifest.length + ' mockup/before/after comparisons and 25% couch views.');
