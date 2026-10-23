import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { beatNames, encode, galleryFiles, homeFootage, outsideGit, readManifest, wait } from './lib.mjs';
import { openWeb, takeWebStill } from './web.mjs';
import { stillsVvd } from './vvd.mjs';

export async function thumbnail(file, seed = 20261022) {
  const web = await openWeb({ seed });
  try {
    await web.start(); await wait(1500);
    await web.page.evaluate(() => window.__DIRECTOR.thumbnail());
    await web.page.evaluate(content => { const style = document.createElement('style'); style.textContent = content; document.body.append(style); }, 'html,body,.stage,.tvcol,.tvframe,.tvbox{width:1500px!important;height:1000px!important}#tv{height:853.333px!important;--s:1.171875!important}#tvbg,#world,#tvin{height:853.333px!important}#tvbg{object-fit:cover}#lgt{font-size:24px}');
    await web.page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
    await web.page.screenshot({ path: file, type: 'png' });
    if (web.errors.length) throw new Error(web.errors.join('\n'));
  } finally { await web.close(); }
}

export async function stillsFromMaster(manifest, directory, { keepExisting = false } = {}) {
  await mkdir(directory, { recursive: true });
  for (const [i, name] of beatNames.entries()) {
    const target = join(directory, galleryFiles[i]);
    if (keepExisting && await stat(target).then(() => true, () => false)) continue;
    const live = join(dirname(manifest.master), 'gallery', galleryFiles[i]);
    if (manifest.target === 'web' && manifest.galleryChecks?.some(c => c.name === name && c.okay)
      && await stat(live).then(() => true, () => false)) {
      if (resolve(live) !== resolve(target)) await copyFile(live, target);
      continue;
    }
    await encode(['-ss', (manifest.beats[name] / 1000).toFixed(6), '-i', manifest.master, '-frames:v', '1', '-update', '1', target]);
  }
  await thumbnail(join(directory, '07-devpost-thumbnail.png'), manifest.seed);
}
export async function stillsWeb(directory, { seed = 20261022, speed = 1 } = {}) {
  await mkdir(directory, { recursive: true });
  const seen = new Set(); let snapshots = Promise.resolve(), failure;
  const web = await openWeb({ seed, speed, onCue: e => {
    if (e.kind !== 'beat' || !beatNames.includes(e.name) || seen.has(e.name)) return;
    seen.add(e.name);
    snapshots = snapshots.then(() => takeWebStill(web.page, e.name, join(directory, galleryFiles[beatNames.indexOf(e.name)]))).catch(error => { failure = error; });
  } });
  try {
    await web.start(); const deadline = Date.now() + 600_000;
    while (seen.size < 6 && Date.now() < deadline && !failure && !web.errors.length) await wait(200);
    await snapshots;
    if (failure) throw failure;
    if (web.errors.length) throw new Error(web.errors.join('\n'));
    if (seen.size !== 6) throw new Error('Missing named gallery beats');
  } finally { await web.close(); }
  await thumbnail(join(directory, '07-devpost-thumbnail.png'), seed);
  return galleryFiles.map(name => join(directory, name));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ args: process.argv.slice(2).filter(a => a !== '--'), options: { target: { type: 'string', default: 'web' }, from: { type: 'string' }, out: { type: 'string' }, seed: { type: 'string', default: '20261022' }, speed: { type: 'string', default: '1' }, bridge: { type: 'string', default: 'http://127.0.0.1:8790' } } });
  const directory = values.out ? resolve(values.out) : join(await outsideGit(join(homeFootage, `stills-${Date.now()}`)), 'gallery');
  if (values.from) await stillsFromMaster(await readManifest(resolve(values.from)), directory);
  else if (values.target === 'web') await stillsWeb(directory, { seed: Number(values.seed), speed: Number(values.speed) });
  else if (values.target === 'vvd') { await stillsVvd(directory, values.bridge); await thumbnail(join(directory, '07-devpost-thumbnail.png'), Number(values.seed)); }
  else throw new Error('Target must be web or vvd');
  for (const file of [...galleryFiles, '07-devpost-thumbnail.png']) if ((await stat(join(directory, file))).size > 10_000_000) throw new Error('Still exceeds commit limit');
  console.log(`Six 1920×1080 stills and 1500×1000 thumbnail: ${directory}`);
}
