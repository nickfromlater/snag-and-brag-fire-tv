import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { makeStageRasters } from './stage-rasters.mjs';
const root = resolve(import.meta.dirname, '../..'), tv = resolve(root, 'tv');
const require = createRequire(resolve(tv, 'package.json'));
const opentype = require('opentype.js'), puppeteer = require('puppeteer-core');
const generated = resolve(tv, 'src/stage/generated'), backgrounds = resolve(root, 'assets/stage');
await mkdir(generated, { recursive: true }); await mkdir(backgrounds, { recursive: true }); await mkdir(resolve(tv, 'assets/raw'), { recursive: true });
const manifest = JSON.parse(await readFile(resolve(root, 'assets/manifest.json'), 'utf8'));
const font = opentype.loadSync(resolve(root, 'assets/fonts/LilitaOne-Regular.ttf'));
const characters = [...new Set(Array.from({ length: 224 }, (_, i) => String.fromCharCode(i + 32)).concat(['’', '‘', '“', '”', '…', '—', '–', '★']))];
const glyphs = {}, kerning = {};
for (const c of characters) { const g = font.charToGlyph(c); glyphs[c] = { advance: g.advanceWidth, commands: g.path.commands }; }
for (const a of characters) for (const b of characters) { const k = font.getKerningValue(font.charToGlyph(a), font.charToGlyph(b)); if (k) kerning[a + b] = k; }
await writeFile(resolve(generated, 'glyphs.json'), JSON.stringify({ units: font.unitsPerEm, ascender: font.ascender, descender: font.descender, glyphs, kerning }) + '\n');
const rubik = opentype.loadSync(resolve(root, 'assets/fonts/Rubik-900.ttf')), rubikGlyphs = {}, rubikKerning = {};
for (const c of characters) { const g = rubik.charToGlyph(c); rubikGlyphs[c] = { advance: g.advanceWidth, commands: g.path.commands }; }
for (const a of characters) for (const b of characters) { const k = rubik.getKerningValue(rubik.charToGlyph(a), rubik.charToGlyph(b)); if (k) rubikKerning[a + b] = k; }
await writeFile(resolve(generated, 'rubik-glyphs.json'), JSON.stringify({ units: rubik.unitsPerEm, ascender: rubik.ascender, descender: rubik.descender, glyphs: rubikGlyphs, kerning: rubikKerning }) + '\n');
// All Canvas numbers below are ported from BG.draw / tvvig in reference/src.
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--mute-audio', '--disable-gpu', '--force-color-profile=srgb'] });
const backgroundNames = [], eyeAssets = [], eyeInfo = {};
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true); page.on('request', r => /^(file:|data:|blob:|about:)/.test(r.url()) ? r.continue() : r.abort());
  await page.evaluateOnNewDocument(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.setContent((await readFile(resolve(root, 'reference/mockup/snag-and-brag.html'), 'utf8')).replace('var BG={', 'var BG=window.BG={'));
  const data = await page.evaluate(() => {
    const output = {}, palettes = window.BG.pal;
    const make = (name, w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); output[name] = c.toDataURL('image/png').split(',')[1]; };
    const rgb = (v, a = 1) => 'rgba(' + v.map(x => x | 0).join(',') + ',' + a + ')';
    const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
    for (const [mood, p] of Object.entries(palettes)) {
      make('overlay-' + mood, 1280, 720, x => {
        const glow = x.createRadialGradient(640, 426, 40, 640, 426, 700); glow.addColorStop(0, rgb(p.glow, .6)); glow.addColorStop(.55, rgb(p.glow, 0)); x.fillStyle = glow; x.fillRect(0, 0, 1280, 496);
        const floor = x.createLinearGradient(0, 496, 0, 720); floor.addColorStop(0, rgb(mix(p.base, [10, 8, 40], .42))); floor.addColorStop(1, rgb(mix(p.base, [10, 8, 40], .8))); x.fillStyle = floor; x.fillRect(0, 496, 1280, 224);
        const shine = x.createRadialGradient(640, 496, 10, 640, 496, 660); shine.addColorStop(0, rgb(p.glow, .42)); shine.addColorStop(1, rgb(p.glow, 0)); x.fillStyle = shine; x.fillRect(0, 496, 1280, 224);
        x.lineWidth = 2; x.strokeStyle = rgb(p.glow, .2); x.beginPath(); for (let q = -16; q <= 16; q++) { const bx = 640 + q * 120; x.moveTo(640 + (bx - 640) * 300 / 524, 496); x.lineTo(bx, 720); } x.stroke();
        x.fillStyle = rgb(mix(p.glow, [255, 255, 255], .45), .95); x.fillRect(0, 494, 1280, 4);
      });
      const intensity = window.BG.spot[mood];
      // Bake light color/alpha to reproduce additive luminosity over the mood base.
      const light = (weight, base = p.base) => {
        const alpha = Math.max(...base.map((v, i) => (v === 255 ? 0 : Math.min(255 - v, [255, 248, 230][i] * weight) / (255 - v))));
        return rgb(base.map((v, i) => alpha ? Math.min(255, v + [255, 248, 230][i] * weight / alpha) : 255), alpha);
      };
      make('cone-' + mood, 264, 676, x => { const g = x.createLinearGradient(132, 0, 132, 676); g.addColorStop(0, light(.17 * intensity)); g.addColorStop(1, light(0)); x.fillStyle = g; x.beginPath(); x.moveTo(120, 0); x.lineTo(144, 0); x.lineTo(252, 676); x.lineTo(12, 676); x.closePath(); x.fill(); });
      make('pool-' + mood, 300, 78, x => { x.translate(150, 39); x.scale(1, .26); const g = x.createRadialGradient(0, 0, 4, 0, 0, 150); g.addColorStop(0, light(.36 * intensity, mix(p.base, [10, 8, 40], .5))); g.addColorStop(1, light(0)); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 150, 0, Math.PI * 2); x.fill(); });
    }
    make('halftone', 1280, 720, x => { x.globalAlpha = .3; x.drawImage(window.BG.hal, 0, 0); });
    make('vignette', 1280, 720, x => { x.save(); x.translate(640, 316.8); x.scale(1.6, 1); const g = x.createRadialGradient(0, 0, 0, 0, 0, 720); g.addColorStop(.62, 'rgba(5,6,31,0)'); g.addColorStop(1, 'rgba(5,6,31,.42)'); x.fillStyle = g; x.fillRect(-400, -316.8, 800, 720); x.restore(); });
    return output;
  });
  for (const [name, base64] of Object.entries(data)) { await writeFile(resolve(backgrounds, name + '.png'), Buffer.from(base64, 'base64')); backgroundNames.push(name); }
  // CSS .gg keeps its 3 px outer ring and inset shade at every sticker size.
  // Bake the actual eye radius instead of scaling those strokes with the sticker.
  const sizes = [78, 120, 130, 180, 200, 220, 250];
  const radii = [...new Set(Object.keys(manifest.eyes.sprites).map(Number).filter(r=>r<=11).flatMap(r=>sizes.map(size=>Number((r*size/120).toFixed(5)))))].sort((a,b)=>a-b);
  const css = await readFile(resolve(root,'reference/src/style.css'),'utf8');
  const rule = css.match(/\.gg\{[^}]+\}/)[0];
  await page.setViewport({width:96,height:96,deviceScaleFactor:4});
  await mkdir(resolve(root,'assets/eyes'),{recursive:true});
  for(const radius of radii){
    const side=Math.ceil(radius*2+8),id='eyes/native-white-r'+radius,path=resolve(root,'assets',id+'.png');
    await page.setContent('<style>:root{--ink:#0E0B2B}html,body{margin:0;background:transparent}'+rule+'</style><div class="gg" style="left:4px;top:4px;width:'+radius*2+'px;height:'+radius*2+'px;--ew:3px"></div>');
    await page.screenshot({path,omitBackground:true,clip:{x:0,y:0,width:side,height:side}});
    eyeAssets.push([id,path]);
    eyeInfo[id]={file:'assets/'+id+'.png',pixelSize:[side*4,side*4],scale:4,anchor:[16,16],logicalBounds:{x:-4,y:-4,width:side,height:side},radius,border:3,source:'reference/src/style.css (.gg); actual stage radius, unscaled 3 px ring/shade'};
  }
} finally { await browser.close(); }
await writeFile(resolve(generated,'eye-bitmaps.json'),JSON.stringify(eyeInfo,null,2)+'\n');
const assets = Object.entries(manifest.files).filter(([, d]) => d.file.endsWith('.png')).map(([id, d]) => [id, resolve(root, d.file)]);
for (const name of backgroundNames) assets.push(['stage/' + name, resolve(backgrounds, name + '.png')]);
assets.push(...await makeStageRasters(root));
assets.push(...eyeAssets);
const relativeImport = p => './' + relative(generated, p).replaceAll('\\', '/');
const nativePath = async p => {const dest = resolve(generated,'native-assets',relative(resolve(root,'assets'),p)); await mkdir(resolve(dest,'..'),{recursive:true}); await copyFile(p,dest); return relativeImport(dest);};
const nativeAssets = []; for(const [id,p] of assets) nativeAssets.push([id,await nativePath(p)]);
await writeFile(resolve(generated, 'assets.ts'), "import type { ImageSourcePropType } from 'react-native';\nconst bank: Record<string, ImageSourcePropType> = {\n" + nativeAssets.map(([id, p]) => JSON.stringify(id) + ': require(' + JSON.stringify(p) + '),').join('\n') + '\n};\nexport default bank;\n');
await writeFile(resolve(generated, 'assets.web.ts'), assets.map(([, p], i) => 'import a' + i + ' from ' + JSON.stringify(relativeImport(p)) + ';').join('\n') + "\nimport type { ImageSourcePropType } from 'react-native';\nconst bank = {\n" + assets.map(([id], i) => JSON.stringify(id) + ': {uri:a' + i + '},').join('\n') + '\n};\nexport default bank as Record<string, ImageSourcePropType>;\n');
const nativeFonts = {};
const fonts = { 'Lilita One': 'LilitaOne-Regular.ttf', Rubik: 'Rubik-800.ttf', 'Rubik Medium': 'Rubik-500.ttf', 'Rubik Bold': 'Rubik-700.ttf', 'Rubik Black': 'Rubik-900.ttf' };
for(const [family,f] of Object.entries(fonts)) nativeFonts[family] = await nativePath(resolve(root,'assets/fonts',f));
// Keep notices beside generated fonts and in the native package's raw assets.
for (const f of ['LilitaOne-OFL.txt', 'Rubik-OFL.txt']) {
  await nativePath(resolve(root, 'assets/fonts', f));
  await copyFile(resolve(root, 'assets/fonts', f), resolve(tv, 'assets/raw', f));
}
await copyFile(resolve(root, 'LICENSE'), resolve(tv, 'assets/raw/PROJECT-LICENSE.txt'));
for (const f of ['base-64-MIT.txt', 'qrcode-generator-MIT.txt', 'jpeg-js-BSD.txt', 'react-native-fast-image-PML.txt']) {
  await copyFile(resolve(root, 'tools/release/licenses', f), resolve(tv, 'assets/raw', f));
}
await writeFile(resolve(generated, 'fonts.ts'), 'export const fonts = {\n' + Object.entries(nativeFonts).map(([family, f]) => JSON.stringify(family) + ': require(' + JSON.stringify(f) + '),').join('\n') + '\n};\n');
await writeFile(resolve(generated, 'fonts.web.ts'), Object.values(fonts).map((f, i) => 'import f' + i + ' from ' + JSON.stringify(relativeImport(resolve(root, 'assets/fonts', f))) + ';').join('\n') + '\nexport const fonts = {\n' + Object.keys(fonts).map((family, i) => JSON.stringify(family) + ': f' + i + ',').join('\n') + '\n};\n');
const audio = JSON.parse(await readFile(resolve(root, 'assets/audio/manifest.json'), 'utf8'));
for (const mood of ['normal', 'urgent', 'tension', 'party', 'gold']) await copyFile(resolve(root, 'assets/stage-video', mood + '.mp4'), resolve(tv, 'assets/raw', 'stage-' + mood + '.mp4'));
// Native plays OGG music and one PCM effects atlas; per-file WAVs are web/debug only.
for (const f of audio.files) { await copyFile(resolve(root, f.ogg), resolve(tv, 'assets/raw', f.id + '.ogg')); await rm(resolve(tv, 'assets/raw', f.id + '.wav'), { force: true }); }
// Vega's media src setter runs a synchronous native load (100-800 ms on the stick, and one
// hang killed the app). Every effect voice loads this atlas once and then only seeks.
{
  const rate = audio.format.sampleRate, channels = audio.format.channels, gap = Math.round(rate * 1.5), parts = [], clips = {};
  let cursor = 0;
  const pcmOf = bytes => {
    let at = 12, fmt, data;
    while (at + 8 <= bytes.length) { const id = bytes.toString('ascii', at, at + 4), size = bytes.readUInt32LE(at + 4); if (id === 'fmt ') fmt = bytes.subarray(at + 8, at + 8 + size); if (id === 'data') data = bytes.subarray(at + 8, at + 8 + size); at += 8 + size + (size & 1); }
    if (!fmt || !data || fmt.readUInt16LE(0) !== 1 || fmt.readUInt16LE(2) !== channels || fmt.readUInt32LE(4) !== rate || fmt.readUInt16LE(14) !== 16) throw new Error('SFX atlas needs PCM16 ' + rate + ' Hz x' + channels);
    return data;
  };
  for (const f of audio.files.filter(f => f.kind === 'sfx')) {
    const pcm = pcmOf(await readFile(resolve(root, f.wav))), frames = pcm.length / (channels * 2);
    clips[f.id] = { start: cursor / rate, duration: frames / rate };
    parts.push(pcm, Buffer.alloc(gap * channels * 2)); cursor += frames + gap;
  }
  const body = Buffer.concat(parts), header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + body.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(body.length, 40);
  // Vorbis keeps 1.5 s silences nearly free (a PCM atlas with these gaps would be ~30 MB), and
  // the gap absorbs late end timers when JS is busy. Seeks behave the same as PCM on Vega.
  const pcm = resolve(tv, 'assets/raw/sfx-atlas.wav'), ogg = resolve(tv, 'assets/raw/sfx-atlas.ogg');
  await writeFile(pcm, Buffer.concat([header, body]));
  await new Promise((done, fail) => execFile('/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', pcm, '-c:a', 'libvorbis', '-q:a', '5', ogg], error => error ? fail(error) : done()));
  await rm(pcm, { force: true });
  await writeFile(resolve(generated, 'sfx-atlas.json'), JSON.stringify({ file: 'sfx-atlas.ogg', gapSeconds: 1.5, clips }, null, 1) + '\n');
}
// The retained spike benchmark uses these four synthetic audio fixtures.
for (const f of ['music.mp3', 'sfx1.mp3', 'sfx2.mp3', 'sfx3.mp3']) await copyFile(resolve(root, 'spike/vega-app/assets/raw', f), resolve(tv, 'assets/raw', f));
await writeFile(resolve(generated, 'audio.web.ts'), audio.files.map((f, i) => 'import a' + i + ' from ' + JSON.stringify(relativeImport(resolve(root, f.wav))) + ';').join('\n') + '\nexport const audioUrls: Record<string,string> = {\n' + audio.files.map((f, i) => JSON.stringify(f.id) + ': a' + i + ',').join('\n') + '\n};\n');
await writeFile(resolve(generated, 'audio.ts'), 'export const audioUrls: Record<string,string> = {};\n');
console.log('Generated ' + assets.length + ' bitmap imports, ' + characters.length + ' glyphs, ' + backgroundNames.length + ' stage layers; production audio copied unchanged.');

await import('./photo-mask.mjs');
