import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import type { Page } from 'puppeteer-core';
import vm from 'node:vm';
import { PNG } from 'pngjs';
import { readSource, sha256 } from './source.ts';
import { clean, decode, diff, encode, photoLayers } from './pixels.ts';
import type { PixelDiff } from './pixels.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const source = await readSource(root);
const assetsDir = join(root, 'assets');
const reviewDir = join(root, 'docs/review');
await mkdir(assetsDir, { recursive: true });
await mkdir(reviewDir, { recursive: true });
const fontReport = JSON.parse(execFileSync('uv', ['run', '--script', join(root, 'tools/render-art/convert_fonts.py'), root],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })) as { file: string; source: string; weight: number; postScriptName: string; glyphCount: number }[];
for (const name of ['LilitaOne-OFL.txt', 'Rubik-OFL.txt']) await copyFile(join(root, 'reference/fonts', name), join(assetsDir, 'fonts', name));

type Bounds = { x: number; y: number; width: number; height: number };
interface Asset {
  file: string;
  pixelSize: [number, number] | null;
  scale: number | null;
  anchor: [number, number] | null;
  logicalBounds: Bounds | null;
  source: string;
  sha256: string;
  bytes: number;
  [key: string]: unknown;
}
const files: Record<string, Asset> = {};
const evidence: Record<string, unknown> = {};
const bufById = new Map<string, Buffer>();

async function json(path: string, value: unknown) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), JSON.stringify(value, null, 2) + '\n');
}
async function save(id: string, path: string, bytes: Buffer, bounds: Bounds | null, scale: number | null, ref: string, extra: Record<string, unknown> = {}) {
  if(path.endsWith('.png'))bytes=clean(bytes);
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), bytes);
  const png = path.endsWith('.png') ? decode(bytes) : null;
  files[id] = { file: path, pixelSize: png ? [png.width, png.height] : null, scale,
    anchor: bounds && scale ? [-bounds.x * scale, -bounds.y * scale] : null,
    logicalBounds: bounds, source: ref, sha256: sha256(bytes), bytes: bytes.length, ...extra };
  bufById.set(id, bytes);
}

const faces = fontReport.flatMap(f => [
  `@font-face{font-family:'${f.weight === 400 ? 'Lilita One' : 'Rubik'}';font-weight:${f.weight};font-display:block;src:url('/${f.source}') format('woff2')}`,
  `@font-face{font-family:'ttf-${f.weight}';font-weight:${f.weight};font-display:block;src:url('/${f.file}') format('truetype')}`,
]).join('\n');
const pageHTML = `<!doctype html><meta charset="utf-8"><style>${source.css}\n${faces}
html,body{margin:0;padding:0;background:transparent;color-scheme:light}#mount{position:absolute;left:0;top:0}
#capture{position:relative;overflow:hidden}#capture>svg{display:block;overflow:visible}
</style><svg width="0" height="0" style="position:absolute"><defs id="gdefs"></defs></svg><div id="mount"></div><svg id="soxsvg" viewBox="0 0 200 240" width="0" height="0"></svg>`;
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    if (path === '/__art') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(pageHTML); return; }
    const full = resolve(root, '.' + path);
    if (!full.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    const mime = path.endsWith('.png') ? 'image/png' : path.endsWith('.ttf') ? 'font/ttf' : path.endsWith('.woff2') ? 'font/woff2'
      : path.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
    res.setHeader('Content-Type', mime); res.setHeader('Cache-Control', 'no-store');
    res.end(await readFile(full));
  } catch { res.writeHead(404).end(); }
});
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No local render port');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--mute-audio', '--force-color-profile=srgb', '--hide-scrollbars', '--disable-gpu'] });

const dataURL = (bytes: Uint8Array) => 'data:image/png;base64,' + Buffer.from(bytes).toString('base64');
function svg(content: string, b: Bounds): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${b.width}" height="${b.height}" viewBox="${b.x} ${b.y} ${b.width} ${b.height}">${content}</svg>`;
}
const box120 = (content: string) => `<svg x="0" y="0" width="120" height="120" viewBox="0 0 120 120" overflow="visible">${content}</svg>`;
const sourceOf = (name: string) => `reference/src/game.js (${name})`;
let page: Page;

async function shot(markup: string, width: number, height: number, scale = 1): Promise<Buffer> {
  await page.setViewport({ width: Math.ceil(width), height: Math.ceil(height), deviceScaleFactor: scale });
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.evaluate(({ markup, width, height }) => {
    document.getElementById('mount')!.innerHTML = `<div id="capture" style="width:${width}px;height:${height}px">${markup}</div>`;
  }, { markup, width, height });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.querySelectorAll('#capture img')).map(im => (im as HTMLImageElement).decode()));
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
  const el = await page.$('#capture');
  if (!el) throw new Error('Missing capture target');
  return Buffer.from(await el.screenshot({ omitBackground: true }));
}
async function render(id: string, content: string, b: Bounds, scale: number, ref: string, extra: Record<string, unknown> = {}) {
  const raw = await shot(svg(content, b), b.width, b.height, scale);
  await save(id, `assets/${id}.png`, clean(raw), b, scale, ref, extra);
}
const imageTag = (id: string, style = '') => `<img src="/${files[id]!.file}" style="${style}">`;

try {
  page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', req => req.url().startsWith(origin) || /^(data:|blob:|about:)/.test(req.url()) ? void req.continue() : void req.abort());
  await page.goto(origin + '/__art');
  await page.addScriptTag({ content: source.art });
  await page.addScriptTag({ content: source.defs });
  await page.addScriptTag({ content: `var $=function(s){return document.querySelector(s)};var HOST={};var RM=false;function rnd(a,b){return (a+b)/2}function A(){return {}};var _uid=0;
    ${source.stickerFunction}\n${source.hostSetup}\n${source.hostAnimation}` });
  await page.evaluate(async () => { await document.fonts.load('400 24px "Lilita One"'); await document.fonts.ready; });

  const filterBounds = await page.evaluate((ids: string[]) => {
    const mount = document.getElementById('mount')!;
    return ids.map(id => {
      mount.innerHTML = `<svg width="120" height="120"><use href="#o-${id}"/></svg>`;
      const box = (mount.querySelector('use') as SVGGraphicsElement).getBBox();
      return { id, sourceBounds: { x: box.x, y: box.y, width: box.width, height: box.height },
        filterRegion: { x: box.x - .3 * box.width, y: box.y - .3 * box.height, width: 1.6 * box.width, height: 1.7 * box.height } };
    });
  }, source.objects.map(o => o.id));
  // Common origin simplifies changing between object and photo stickers. Round outward
  // to a five-unit grid so both 1.6x and 3.2x land on whole physical pixels.
  const regions = [...filterBounds.map(f => f.filterRegion), { x: -20, y: -20, width: 160, height: 170 }];
  const x0 = Math.floor((Math.min(...regions.map(b => b.x)) - 2) / 5) * 5;
  const y0 = Math.floor((Math.min(...regions.map(b => b.y)) - 2) / 5) * 5;
  const x1 = Math.ceil((Math.max(...regions.map(b => b.x + b.width)) + 2) / 5) * 5;
  const y1 = Math.ceil((Math.max(...regions.map(b => b.y + b.height)) + 2) / 5) * 5;
  const stickerBounds: Bounds = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  const objects: Record<string, unknown> = {};
  const fringeChecks: { id: string; scale: number; background: string; diff: PixelDiff }[] = [];
  for (const object of source.objects) {
    const variants: Record<string, string> = {};
    for (const scale of [1.6, 3.2]) {
      const label = scale === 1.6 ? '192' : '384';
      const id = `stickers/${object.id}-${label}`;
      const content = box120(`<use href="#o-${object.id}" filter="url(#diecut)"/>`);
      const raw = await shot(svg(content, stickerBounds), stickerBounds.width, stickerBounds.height, scale);
      const bytes = clean(raw);
      await save(id, `assets/${id}.png`, bytes, stickerBounds, scale, sourceOf(`o-${object.id}; diecut`), { boxPixelSize: [120 * scale, 120 * scale], eyesBakedIn: false });
      variants[label] = id;
      for (const background of ['#0E0B2B', '#FFF8EC']) {
        const live = await shot(`<div style="background:${background};width:100%;height:100%">${svg(content, stickerBounds)}</div>`, stickerBounds.width, stickerBounds.height, scale);
        const bitmap = await shot(`<div style="background:${background};width:100%;height:100%"><img src="${dataURL(bytes)}" style="display:block;width:100%;height:100%"></div>`, stickerBounds.width, stickerBounds.height, scale);
        const result = diff(live, bitmap);
        if (result.maxChannelDifference > 2 || result.meanAbsoluteChannelDifference > .1) throw new Error(`Sticker fringe check failed: ${id} ${JSON.stringify(result)}`);
        fringeChecks.push({ id: object.id, scale, background, diff: result });
      }
    }
    objects[object.id] = { name: object.nm, col: object.col, eyes: object.eyes,
      housePlacement: { zone: object.zone, center: [object.x,object.y], size: object.s },
      eyePositions: object.eyes.slice(0, 2), eyeRadius: object.eyes[2], variants, ...filterBounds.find(b => b.id === object.id) };
  }
  evidence.stickerComposites = fringeChecks;
  console.log(`Rendered ${source.objects.length} stickers at both scales; dark/light composites checked.`);

  const eyeSprites: Record<string, unknown> = {};
  for (const radius of [6, 7, 8, 9, 11, 15, 16, 17.5, 20, 22.5, 24, 27.5, 28]) {
    const size = radius * 2;
    const b: Bounds = { x: -4, y: -4, width: size + 8, height: size + 8 };
    const eye = `<div class="gg" style="left:4px;top:4px;width:${size}px;height:${size}px;--ew:3px">`;
    const whiteId = `eyes/white-r${radius}`, pupilId = `eyes/pupil-r${radius}`;
    for (const [id, inner] of [[whiteId, `${eye}</div>`], [pupilId, `${eye}<i></i></div>`]] as const) {
      // Hide only the white parent for the pupil pass, retaining the exact .gg i geometry.
      const pupilCSS = id === pupilId ? '<style>#capture .gg{background:transparent;box-shadow:none}</style>' : '';
      await save(id, `assets/${id}.png`, clean(await shot(pupilCSS + inner, b.width, b.height, 4)), b, 4,
        'reference/src/style.css (.gg, .gg i, .gg i::after)', { radius, border: 3, pupilFraction: .54, pupilInsetFraction: .23 });
    }
    eyeSprites[radius] = { white: whiteId, pupil: pupilId, nativeRadius: radius, ringWidth: 3,
      centerPixels: [(radius + 4) * 4, (radius + 4) * 4] };
  }

  const photo: Record<string, unknown> = {};
  const photoChecks: { scale: number; background: string; diff: PixelDiff }[] = [];
  const synthetic = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = c.height = 320;
    const ctx = c.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 320, 320);
    gradient.addColorStop(0, '#3FE0D0'); gradient.addColorStop(.5, '#FF4FA0'); gradient.addColorStop(1, '#FFD43B');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 320, 320);
    ctx.fillStyle = '#2B3BFF'; ctx.fillRect(56, 72, 144, 176);
    ctx.fillStyle = '#FFF8EC'; ctx.fillRect(96, 112, 64, 96);
    return c.toDataURL('image/png');
  });
  const whitePhoto = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 320;
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 320, 320); return c.toDataURL(); });
  const blackPhoto = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 320;
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 320, 320); return c.toDataURL(); });
  for (const scale of [1.6, 3.2]) {
    const label = scale === 1.6 ? '192' : '384';
    const makePhoto = async (url: string, filter: string) => page.evaluate(({url, filter}) => {
      const w = window as unknown as { stickerSVG: (f: {photo: string}) => string };
      return w.stickerSVG({photo: url}).replace('url(#diecut)', `url(#${filter})`);
    }, { url, filter });
    const originalFilter = await page.evaluate(() => document.getElementById('diecut')!.outerHTML);
    const layerFilter = (name: string, merge: string) => originalFilter.replace('id="diecut"', `id="${name}"`)
      .replace(/<feMerge>[\s\S]*?<\/feMerge>/, `<feMerge>${merge}</feMerge>`);
    const variants = {
      alpha: layerFilter('photo-alpha', '<feMergeNode in="SourceAlpha"/>'),
      border: layerFilter('photo-border', '<feMergeNode in="ink"/><feMergeNode in="wh"/>'),
      shadow: layerFilter('photo-shadow', '<feMergeNode in="sh"/>'),
    };
    const layers: Record<string, Buffer> = {};
    for (const [part, filter] of Object.entries(variants)) {
      const content = `<defs>${filter}</defs>` + (await makePhoto(whitePhoto, `photo-${part}`)).replace('<svg viewBox', '<svg x="0" y="0" width="120" height="120" overflow="visible" viewBox');
      layers[part] = clean(await shot(svg(content, stickerBounds), stickerBounds.width, stickerBounds.height, scale));
    }
    const fullPhoto = async (url:string) => clean(await shot(svg((await makePhoto(url,'diecut')).replace('<svg viewBox', '<svg x="0" y="0" width="120" height="120" overflow="visible" viewBox'),stickerBounds),stickerBounds.width,stickerBounds.height,scale));
    const decomposition = photoLayers(layers.alpha!, await fullPhoto(blackPhoto), await fullPhoto(whitePhoto), layers.shadow!);
    const ids: Record<string, string> = {};
    for (const [part, bytes] of Object.entries({ mask: decomposition.mask, 'geometric-mask': decomposition.geometric,
      overlay: decomposition.overlay, shadow: decomposition.shadow })) {
      const id = `photos/${part}-${label}`; ids[part] = id;
      await save(id, `assets/${id}.png`, bytes, stickerBounds, scale, sourceOf('stickerSVG photo clip + diecut'), { boxPixelSize: [120 * scale, 120 * scale] });
    }
    photo[label] = ids;
    const liveMarkup = await makePhoto(synthetic, 'diecut');
    const photoContent = `<image href="${synthetic}" x="10" y="10" width="100" height="100" preserveAspectRatio="xMidYMid slice"/>`;
    const unmasked = clean(await shot(svg(photoContent, stickerBounds), stickerBounds.width, stickerBounds.height, scale));
    const composed = await page.evaluate(async ({mask, overlay, shadow, raw}) => {
      const images = await Promise.all([mask, overlay, shadow, raw].map(async url => { const im = new Image(); im.src = url; await im.decode(); return im; }));
      const c = document.createElement('canvas'); c.width = images[0]!.width; c.height = images[0]!.height;
      const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height;
      const t = tmp.getContext('2d')!; t.drawImage(images[3]!, 0, 0); t.globalCompositeOperation = 'destination-in'; t.drawImage(images[0]!, 0, 0);
      const ctx = c.getContext('2d')!; ctx.drawImage(images[2]!, 0, 0); ctx.drawImage(tmp, 0, 0); ctx.drawImage(images[1]!, 0, 0);
      return c.toDataURL();
    }, { mask: dataURL(decomposition.mask), overlay: dataURL(decomposition.overlay), shadow: dataURL(decomposition.shadow), raw: dataURL(unmasked) });
    for (const background of ['#0E0B2B', '#FFF8EC']) {
      const live = await shot(`<div style="background:${background};width:100%;height:100%">${svg(liveMarkup.replace('<svg viewBox', '<svg x="0" y="0" width="120" height="120" overflow="visible" viewBox'), stickerBounds)}</div>`, stickerBounds.width, stickerBounds.height, scale);
      const composite = await shot(`<div style="background:${background};width:100%;height:100%"><img src="${composed}" style="width:100%;height:100%;display:block"></div>`, stickerBounds.width, stickerBounds.height, scale);
      const result = diff(live, composite);
      await writeFile(join(reviewDir, `photo-live-${label}-${background === '#0E0B2B' ? 'dark' : 'light'}.png`), clean(live));
      await writeFile(join(reviewDir, `photo-layers-${label}-${background === '#0E0B2B' ? 'dark' : 'light'}.png`), clean(composite));
      if (result.maxChannelDifference > 3 || result.meanAbsoluteChannelDifference > .1) throw new Error(`Photo composite failed: ${JSON.stringify(result)}`);
      photoChecks.push({ scale, background, diff: result });
      if (scale === 1.6) {
        const pair = await shot(`<div style="display:flex;background:${background}"><img src="${dataURL(live)}"><img src="${dataURL(composite)}"></div>`, decode(live).width * 2, decode(live).height);
        await writeFile(join(reviewDir, `photo-${background === '#0E0B2B' ? 'dark' : 'light'}.png`), clean(pair));
      }
    }
  }
  evidence.photoComposites = photoChecks;
  console.log(`Photo frame checked against Chrome: max channel error ${Math.max(...photoChecks.map(c => c.diff.maxChannelDifference))}.`);

  const hostBounds: Bounds = { x: -20, y: -25, width: 240, height: 290 };
  const hostData = await page.evaluate(() => {
    const sox = document.getElementById('soxsvg')!;
    const tree = (element: Element): unknown => ({ tag: element.tagName, attributes: Object.fromEntries(Array.from(element.attributes).map(a => [a.name, a.value])), children: Array.from(element.children).map(tree) });
    return { svg: sox.innerHTML, tree: tree(sox), lower: document.getElementById('sx-low')!.innerHTML,
      upper: document.getElementById('sx-up')!.innerHTML,
      whites: Array.from(document.getElementById('sx-up')!.children).filter(n=>n.tagName === 'circle' && !n.hasAttribute('id')).map(n=>n.outerHTML),
      nodes: Object.fromEntries(['sx-m','sx-tg','sx-p1','sx-p2','sx-l1','sx-l2','sx-hap','sx-bl','sx-br','sx-mono'].map(id => [id, document.getElementById(id)!.outerHTML])) };
  });
  const upperOnly = source.sox.upper!;
  const whiteEyes = hostData.whites;
  if (!whiteEyes || whiteEyes.length !== 2) throw new Error('Expected two host eye whites');
  const hostParts: Record<string, string> = { lower: source.sox.lower!, upper: upperOnly,
    'white-left': whiteEyes[0]!, 'white-right': whiteEyes[1]!, 'pupil-left': hostData.nodes['sx-p1']!, 'pupil-right': hostData.nodes['sx-p2']!,
    'lid-left-neutral': hostData.nodes['sx-l1']!, 'lid-right-neutral': hostData.nodes['sx-l2']!,
    'lid-left-closed': hostData.nodes['sx-l1']!.replace('ry="0"', 'ry="20.5"'), 'lid-right-closed': hostData.nodes['sx-l2']!.replace('ry="0"', 'ry="22.5"'),
    happy: hostData.nodes['sx-hap']!.replace('opacity="0"', 'opacity="1"'), monocle: source.sox.monocle!,
    mouth: hostData.nodes['sx-m']!, tongue: hostData.nodes['sx-tg']! };
  for (const [pose, paths] of Object.entries(source.browPaths)) for (const [side, i] of [['left', 0], ['right', 1]] as const) {
    hostParts[`brow-${pose}-${side}`] = hostData.nodes[i === 0 ? 'sx-bl' : 'sx-br']!.replace(/\sd="[^"]+"/, ` d="${paths[i]}"`);
  }
  for (const [part, markup] of Object.entries(hostParts)) await render(`host/${part}`, markup, hostBounds, 2, sourceOf(`SOX / HOST setup: ${part}`));

  // Cropped atlases supply ellipses with constant-width outlines for bitmap-only
  // renderers. Scaling a closed lid PNG would distort the stroke.
  const sequences: Record<string, unknown> = {};
  for (const [part, b] of Object.entries({ mouth: {x:43,y:113,width:118,height:48}, tongue: {x:86,y:126,width:52,height:28},
    'lid-left': {x:56,y:62,width:48,height:48}, 'lid-right': {x:102,y:54,width:52,height:52} })) {
    const count = 33, cols = 8, scale = 2;
    const atlas = new PNG({ width: b.width * scale * cols, height: b.height * scale * Math.ceil(count / cols) });
    const frames: Record<string, unknown>[] = [];
    for (let n = 0; n < count; n++) {
      const amount = n / (count - 1);
      let content: string;
      if (part === 'mouth') content = hostData.nodes['sx-m']!.replace(/ry="[^"]+"/, `ry="${(3 + amount * 13).toFixed(2)}"`).replace(/cy="[^"]+"/, `cy="${(131 + amount * 4).toFixed(2)}"`);
      else if (part === 'tongue') content = hostData.nodes['sx-tg']!.replace(/ry="[^"]+"/, `ry="${(amount * 6).toFixed(2)}"`).replace(/cy="[^"]+"/, `cy="${(134 + amount * 9).toFixed(2)}"`);
      else content = hostData.nodes[part === 'lid-left' ? 'sx-l1' : 'sx-l2']!.replace(/ry="[^"]+"/, `ry="${(amount * (part === 'lid-left' ? 20.5 : 22.5)).toFixed(2)}"`);
      const frame = decode(await shot(svg(content, b), b.width, b.height, scale));
      const fx = (n % cols) * frame.width, fy = Math.floor(n / cols) * frame.height;
      PNG.bitblt(frame, atlas, 0, 0, frame.width, frame.height, fx, fy);
      frames.push({ amount, rect: [fx, fy, frame.width, frame.height], anchor: [-b.x * scale, -b.y * scale] });
    }
    const id = `host/${part}-atlas`;
    await save(id, `assets/${id}.png`, clean(encode(atlas)), b, scale, sourceOf('HOST.step ellipse attributes'), { frames, nearestFrame: 'round(clamp(amount, 0, 1) * 32)' });
    sequences[part] = id;
  }

  const frameBounds: Bounds = {x:0,y:0,width:180,height:176};
  const frameStyles = '<style>#capture .hcam{transform:none}</style>';
  for (const [part, style] of [['frame-back', ''], ['frame-front', 'background:transparent']] as const) {
    await save(`host/${part}`, `assets/host/${part}.png`, clean(await shot(frameStyles + `<div class="hcam" style="${style}"></div>`, 180, 176, 2)),
      frameBounds, 2, 'reference/src/style.css (.hcam)');
  }
  const frameMask = await shot('<div style="position:absolute;left:5px;top:5px;width:170px;height:158px;border-radius:21px;background:white"></div>', 180, 176, 2);
  await save('host/frame-mask', 'assets/host/frame-mask.png', clean(frameMask), frameBounds, 2, 'reference/src/style.css (.hcam border inner clip)');

  const hostMetadata = { viewBox: [0,0,200,240], spriteBounds: hostBounds, scale: 2, parts: hostParts,
    rawAssembly: hostData.svg, tree: hostData.tree, brows: source.browPaths,
    animationSource: source.hostAnimation,
    drawOrder: ['lower','mouth','tongue','upper','white-left','pupil-left','white-right','pupil-right','lid-left','lid-right','happy','brow-left','brow-right','monocle'],
    upperChildren: ['white-left','pupil-left','white-right','pupil-right','lid-left','lid-right','happy','brow-left','brow-right','monocle'],
    formulas: { jawTransform: 'translate(0, open * 14)', upperTransform: 'translate(0, -open * 5)',
      mouth: { cx:102, rx:55, cy:'131 + open * 4', ry:'3 + open * 13', fill:'#3A0F2B', stroke:'#0E0B2B', strokeWidth:4 },
      tongue: { cx:112, rx:24, cy:'134 + open * 9', ry:'open * 6', fill:'#FF6FA6' },
      open: 'open += (max(tgt, mood === shock ? .8 : mood === glee ? .5 : 0) - open) * min(1, dt * (typing ? 18 : 10))',
      sway: 'sin(t * 1.6) * 2.5 + (typing ? sin(t * 9) * 1.6 : 0) + (glee ? sin(t * 16) * 4 : 0) + (shock ? sin(t * 40) * 1.2 : 0)',
      swayPivot: [100,240],
      pupilOffsets: { x:'sin(t * .7) * 3', y:'cos(t * 1.3) * 2', left:[80,93,8.5], right:[128,88,9.5], shockRadiusFactor:.55, roundToDecimals:1 },
      lids: { left:{cx:80,cy:86,rx:21,ry:'lid * 20.5'}, right:{cx:128,cy:80,rx:23,ry:'lid * 22.5'}, zeroThreshold:.04,
        smoothing:'lid += (target - lid) * min(1, dt * (bk > 0 ? 45 : 16))', target:'glee || bk > 0 ? 1 : 0', blinkSeconds:.13, interval:[2.2,5], initialInterval:2.5 },
      happyOpacity:'glee ? 1 : 0', monocleShockTransform:'translate(5 -14) rotate(16 128 78)', monocleShockPivot:[128,78],
      precision: { translate:2, mouth:2, tongue:2, sway:2, lids:2 },
      hostTransformOrigin:[100,200], hop:{durationMs:620,easing:'cubic-bezier(.3,.7,.4,1)', keyframes:[{transform:'translateY(0)'},{transform:'translateY(-44px) rotate(-5deg)',offset:.35},{transform:'translateY(0) scale(1.06,.92)',offset:.72},{transform:'translateY(0)'}]},
      shockShake:{durationMs:180,iterations:2,keyframes:['translateX(0)','translateX(-6px)','translateX(6px)','translateX(0)']}, reducedMotion:'HOST.hop and shock shake disabled; HOST.step remains active' },
    frame: { stageOrigin:[30,520], hostSize:[200,200], frameSize:[180,168], shadow:[0,8], rotation:-3, rotationPivot:[90,84],
      puppetViewport:[13,11,164,197], puppetMatrix:[.82,0,0,.82,13,11.1], clip:{x:5,y:5,width:170,height:158,rx:21},
      tag:{text:'SIR SOCKSWORTH',css:source.css.match(/\.htag\{[^}]+\}/)![0]}, css:source.css.match(/\.hcam\{[^}]+\}/)![0] }, sequences };
  await json('assets/host/parts.json', hostMetadata);
  await save('host/parts', 'assets/host/parts.json', await readFile(join(root,'assets/host/parts.json')), null, null, sourceOf('SOX, HOST.setup, HOST.step, HOST.brow, HOST.hop'));

  const allGameSvgs = source.game.match(/<svg\b[\s\S]*?<\/svg>/g)!;
  const inner = (s: string) => s.slice(s.indexOf('>') + 1, s.lastIndexOf('</svg>'));
  const literal = (name: string) => vm.runInNewContext(source.game.match(new RegExp(`var ${name}='([^\\n]+)';`))![1]!.replace(/^/, "'").replace(/$/, "'")) as string;
  const props: Record<string, { markup: string; viewBox: [number,number]; scales: number[]; source?: string }> = {
    'crown-champion': {markup:inner(literal('CROWN')),viewBox:[40,30],scales:[2.4,4.8]},
    'crown-judge': {markup:inner(allGameSvgs.find(s => s.includes('top:136px;width:96px'))!),viewBox:[40,30],scales:[2.4,4.8]},
    'crown-show': {markup:inner(allGameSvgs.find(s => s.includes('class="L pcrown"'))!),viewBox:[40,30],scales:[2.4,4.8]},
    'crown-leader': {markup:inner(decodeURIComponent(source.css.match(/data:image\/svg\+xml,([^"\)]+)/)![1]!)),viewBox:[40,30],scales:[2.4,4.8]},
    trophy: {markup:inner(allGameSvgs.find(s => s.includes('class="L trophy"'))!),viewBox:[220,240],scales:[1,2]},
    magnifier: {markup:inner(literal('MAG')),viewBox:[70,70],scales:[2,4]},
    stopwatch: {markup:inner(allGameSvgs.find(s => s.includes('id="h-arc"'))!).replace(/<circle id="h-arc"[^>]+\/>/, ''),viewBox:[236,236],scales:[1,2]},
    'stopwatch-arc': {markup:allGameSvgs.find(s => s.includes('id="h-arc"'))!.match(/<circle id="h-arc"[^>]+\/>/)![0],viewBox:[236,236],scales:[1,2]},
    'brag-seam': {markup:inner(allGameSvgs.find(s => s.includes('id="b-seam"'))!).replaceAll("'+SEAM+'", source.game.match(/var SEAM='([^']+)'/)![1]!),viewBox:[1280,720],scales:[1,1.5]},
  };
  const bodySvgs = source.body.match(/<svg\b[\s\S]*?<\/svg>/g)!;
  for (const [name, selector] of [['sound','M4 9v6'],['music','M9 18V5'],['skip','M4 5l8'],['dice','cx="8.3"'],['camera','M4 8h3'],['look-up','viewBox="0 0 64 50"']] as const) {
    const markup = bodySvgs.find(s => s.includes(selector))!;
    const viewBox = name === 'look-up' ? [64,50] as [number,number] : [24,24] as [number,number];
    const currentColor=name==='skip'?'#0E0B2B':'#FFF8EC'; // .ctl.skip vs .ctl / .realbtn in the source CSS
    const groupAttrs = markup.slice(0,markup.indexOf('>')).replace(/^<svg/, '').replace(/viewBox="[^"]+"|aria-hidden="[^"]+"/g, '').replaceAll('currentColor', currentColor);
    props[name] = {markup:`<g ${groupAttrs}>${inner(markup)}</g>`,viewBox,scales:name === 'look-up' ? [1.5,3] : [4,8],source:`reference/src/body.html (${name}); reference/src/style.css (currentColor)`};
  }
  const glowDice = allGameSvgs.find(s => s.includes('cx="8.5"'))!;
  props['dice-reroll'] = {markup:`<g fill="none" stroke="#FFF8EC" stroke-width="2.4">${inner(glowDice).replaceAll('currentColor','#FFF8EC')}</g>`,viewBox:[24,24],scales:[4,8]}; // .chipb.dicey color: var(--paper)
  const iconIds: Record<string, string[]> = {};
  for (const name of ['star','heart','flame','tomato']) {
    iconIds[name] = [];
    for (const size of [96,192]) {
      const id = `icons/${name}-${size}`;
      await render(id, `<use href="#i-${name}" width="24" height="24"/>`, {x:0,y:0,width:24,height:24}, size/24, sourceOf(`i-${name}`));
      iconIds[name]!.push(id);
    }
  }
  for (const [name, prop] of Object.entries(props)) for (const scale of prop.scales) {
    const id = `props/${name}-${scale}x`;
    const overflow = name === 'brag-seam' ? 0 : name.startsWith('stopwatch') ? 2 : 0;
    await render(id, prop.markup, {x:-overflow,y:-overflow,width:prop.viewBox[0]+2*overflow,height:prop.viewBox[1]+2*overflow}, scale,
      prop.source ?? (name === 'crown-leader' ? 'reference/src/style.css (chip.lead, lane.lead crown data URL)' : sourceOf(name)));
  }
  await json('assets/props/vectors.json', { props, icons: await page.evaluate(() => ['star','heart','flame','tomato'].map(id => document.getElementById('i-'+id)!.outerHTML)),
    excluded: { reelArrows: {reason:'CSS border triangles, not SVG art', css:source.css.match(/\.reelarr[^\n]+/g)},
      boxes:'CSS cards, badges, bubbles and labels remain runtime primitives/text', canvas:'Stage, particles, spotlights and halftones are procedural canvas drawing' },
    stopwatch: {viewBox:[0,0,236,236],arc:{cx:118,cy:132,r:84,stroke:'#B8F23B',strokeWidth:16,linecap:'round',dasharray:527.8,dashoffset:'527.8 * (1 - timeLeft / HUNT_S)',transform:'rotate(-90 118 132)'}} });
  await save('props/vectors', 'assets/props/vectors.json', await readFile(join(root,'assets/props/vectors.json')), null, null, 'reference/src/game.js, body.html, style.css (raw prop/icon inventory)');
  for (const [part, markup] of Object.entries(source.house)) for (const scale of [.5,1]) {
    await render(`house/${part}-${scale}x`, markup, {x:0,y:0,width:2400,height:1200}, scale, `reference/src/art.js (house${part === 'back' ? 'Back' : 'Front'})`);
  }
  const houseObjects=source.objects.map(o=>`<use href="#o-${o.id}" x="${o.x-o.s/2}" y="${o.y-o.s/2}" width="${o.s}" height="${o.s}"/>`).join('');
  for(const scale of [.5,1]) await render(`house/objects-${scale}x`,houseObjects,{x:0,y:0,width:2400,height:1200},scale,
    sourceOf('VF/houseURL: bare object art at OBJ house coordinates'));
  await render('house/panorama-0.5x',source.house.back+source.house.front+houseObjects,{x:0,y:0,width:2400,height:1200},.5,
    sourceOf('houseURL: complete 1200x600 demo-feed panorama'));

  const fontChecks: {file:string;scale:number;diff:PixelDiff}[] = [];
  for (const font of fontReport) {
    const family = font.weight === 400 ? 'Lilita One' : 'Rubik';
    for (const scale of [1,2]) {
      const fontMarkup = (name: string) => `<div style="width:100%;height:100%;background:#2B3BFF;color:#FFF8EC;padding:12px;font-family:'${name}';font-weight:${font.weight};font-size:36px;line-height:1.25">SNAG &amp; BRAG! Sir Socksworth<br>0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz £€$% Café mañana!</div>`;
      await page.evaluate(async ({family,weight}) => {
        await document.fonts.load(`${weight} 36px "${family}"`); await document.fonts.load(`${weight} 36px "ttf-${weight}"`);
      }, {family,weight:font.weight});
      const woff = await shot(fontMarkup(family), 1150, 170, scale);
      const ttf = await shot(fontMarkup(`ttf-${font.weight}`), 1150, 170, scale);
      const result = diff(woff,ttf);
      if (result.differingPixels !== 0) throw new Error(`Font pixels changed: ${font.file} ${JSON.stringify(result)}`);
      fontChecks.push({file:font.file,scale,diff:result});
    }
    await save(`fonts/${font.file.split('/').at(-1)!.replace('.ttf','')}`, font.file, await readFile(join(root,font.file)), null, null, font.source, font);
  }
  for (const name of ['LilitaOne-OFL.txt','Rubik-OFL.txt']) await save('fonts/'+name, 'assets/fonts/'+name, await readFile(join(root,'assets/fonts',name)), null, null, 'reference/fonts/'+name);
  evidence.fonts = fontChecks;

  const poseInputs = { neutral:{t:0,open:0,typing:false,mood:'norm',lid:0,brow:'norm'}, talking:{t:.25,open:1,typing:true,mood:'norm',lid:0,brow:'up'}, glee:{t:.45,open:.5,typing:false,mood:'glee',lid:1,brow:'up'} };
  const hostPoses: Record<string,string> = {};
  for (const [name, pose] of Object.entries(poseInputs)) {
    const posed = await page.evaluate(pose => {
      document.getElementById('mount')!.innerHTML='';
      const host = (window as unknown as {HOST:Record<string,unknown> & {step:(dt:number,now:number)=>void;brow:(p:string)=>void}}).HOST;
      const {brow,...values}=pose;
      Object.assign(host, values, {tgt:pose.open,nb:999,bk:0,moodT:999}); host.brow(brow); host.step(0,0);
      return document.getElementById('soxsvg')!.innerHTML;
    },pose);
    // Assemble from the exported PNG layers/ellipse atlases, retaining nested
    // upper translation and the exact HOST.step attributes for this pose.
    const state = await page.evaluate(() => Object.fromEntries(['sx-all','sx-low','sx-up','sx-p1','sx-p2','sx-mono'].map(id => [id,Object.fromEntries(Array.from(document.getElementById(id)!.attributes).map(a=>[a.name,a.value]))])));
    const partImage = (id:string) => {
      const f=files[id]!;
      return `<image href="${dataURL(bufById.get(id)!)}" x="${f.logicalBounds!.x}" y="${f.logicalBounds!.y}" width="${f.logicalBounds!.width}" height="${f.logicalBounds!.height}"/>`;
    };
    const atlasFrame = (part:string,amount:number) => {
      const id=`host/${part}-atlas`,f=files[id]!,b=f.logicalBounds!,n=Math.round(amount*32),fx=n%8*b.width,fy=Math.floor(n/8)*b.height;
      return `<svg x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" viewBox="${fx} ${fy} ${b.width} ${b.height}" overflow="hidden"><image href="${dataURL(bufById.get(id)!)}" width="${b.width*8}" height="${b.height*5}"/></svg>`;
    };
    const pupil = (side:'left'|'right',node:string,cx:number,cy:number) => {
      const p=state[node]!;
      return `<g transform="translate(${Number(p.cx)-cx} ${Number(p.cy)-cy})">${partImage(`host/pupil-${side}`)}</g>`;
    };
    const assembled = `<g transform="${state['sx-all']!.transform}"><g transform="${state['sx-low']!.transform}">${partImage('host/lower')}</g>${atlasFrame('mouth',pose.open)}${atlasFrame('tongue',pose.open)}<g transform="${state['sx-up']!.transform}">${partImage('host/upper')}${partImage('host/white-left')}${pupil('left','sx-p1',80,93)}${partImage('host/white-right')}${pupil('right','sx-p2',128,88)}${atlasFrame('lid-left',pose.lid)}${atlasFrame('lid-right',pose.lid)}${pose.mood==='glee'?partImage('host/happy'):''}${partImage(`host/brow-${pose.brow}-left`)}${partImage(`host/brow-${pose.brow}-right`)}<g transform="${state['sx-mono']!.transform ?? ''}">${partImage('host/monocle')}</g></g></g>`;
    hostPoses[name]=assembled;
    const raster=await shot(svg(assembled,hostBounds),hostBounds.width,hostBounds.height,2);
    const live=await shot(svg(posed,hostBounds),hostBounds.width,hostBounds.height,2);
    evidence[`host-${name}`]={input:pose,diff:diff(live,raster)};
    await writeFile(join(reviewDir,`host-${name}.png`),clean(raster));
    await writeFile(join(reviewDir,`host-${name}-live.png`),clean(live));
    const background='#2B3BFF';
    const rasterOnStage=await shot(`<div style="background:${background}">${svg(assembled,hostBounds)}</div>`,hostBounds.width,hostBounds.height,2);
    const liveOnStage=await shot(`<div style="background:${background}">${svg(posed,hostBounds)}</div>`,hostBounds.width,hostBounds.height,2);
    (evidence[`host-${name}`] as Record<string,unknown>).stageDiff=diff(liveOnStage,rasterOnStage);
  }

  const sheetCell = (id: string) => { const f=files[id]!,b=f.logicalBounds!;
    return `<div style="position:relative;width:242px;height:270px">${imageTag(id,`position:absolute;left:${26+b.x*1.6}px;top:${22+b.y*1.6}px;width:${b.width*1.6}px;height:${b.height*1.6}px`)}<div style="position:absolute;top:248px;width:100%;text-align:center;font-weight:700;font-size:15px">${id.split('/').at(-1)!.replace('-192','')}</div></div>`; };
  const comparisonNames=['mug','donut','remote','cereal'];
  const sheet = `<div style="width:1500px;height:2510px;background:#2B3BFF;color:#FFF8EC;padding:24px;font-family:Rubik">
    <div style="font-family:'Lilita One';font-size:52px">SNAG &amp; BRAG — ART REVIEW</div><p style="margin:8px 0 0;font-size:18px">26 original stickers · 192 px boxes · transparent border, edge and shadow · no baked eyes</p>
    <div style="display:grid;grid-template-columns:repeat(6,242px)">${source.objects.map(o=>sheetCell(`stickers/${o.id}-192`)).join('')}</div>
    <div style="font-family:'Lilita One';font-size:34px;margin:15px 0">PNG / LIVE CHROME</div><div style="display:flex;gap:15px">${comparisonNames.map(name=>`<div style="width:345px"><div style="display:flex;gap:10px">${imageTag(`stickers/${name}-192`,'width:165px;height:auto;object-fit:contain')}<div style="width:165px">${svg(box120(`<use href="#o-${name}" filter="url(#diecut)"/>`),stickerBounds).replace('<svg xmlns', '<svg style="width:165px;height:auto" xmlns')}</div></div><div style="text-align:center;font-size:14px">${name} · bitmap / live SVG</div></div>`).join('')}</div>
    <div style="font-family:'Lilita One';font-size:34px;margin:22px 0 6px">SIR SOCKSWORTH · ASSEMBLED PNG LAYERS</div><div style="display:flex;justify-content:space-around">${Object.entries(hostPoses).map(([name,markup])=>`<div style="width:380px;text-align:center">${svg(markup,hostBounds)}<div style="font-family:'Lilita One';font-size:27px">${name.toUpperCase()}</div></div>`).join('')}</div>
    <div style="font-family:'Lilita One';font-size:30px;margin:22px 0 12px">REACTIONS, CROWNS &amp; PROPS</div><div style="display:flex;align-items:center;gap:22px;flex-wrap:wrap">${['icons/star-96','icons/heart-96','icons/flame-96','icons/tomato-96','props/crown-champion-2.4x','props/crown-judge-2.4x','props/crown-leader-2.4x','props/trophy-1x','props/magnifier-2x','props/stopwatch-1x'].map(id=>imageTag(id,'width:96px;height:110px;object-fit:contain')).join('')}</div></div>`;
  await writeFile(join(reviewDir,'art-sheet.png'),clean(await shot(sheet,1500,2510)));
  const fontSheet = `<div style="background:#2B3BFF;width:1150px;padding:20px;color:#FFF8EC">${fontReport.map(font=>`<p style="margin:0 0 12px;font:700 16px Rubik">${font.file} · ${font.postScriptName} · WOFF2 / TTF (pixel-identical)</p><div style="font-family:'ttf-${font.weight}';font-weight:${font.weight};font-size:40px;margin-bottom:24px">SNAG &amp; BRAG! Sir Socksworth 0123456789</div>`).join('')}</div>`;
  await writeFile(join(reviewDir,'fonts.png'),clean(await shot(fontSheet,1150,600)));

  const totalBytes=Object.values(files).reduce((a,f)=>a+f.bytes,0);
  if(totalBytes>15*1024*1024) throw new Error(`Asset budget exceeded: ${totalBytes}`);
  await json('assets/manifest.json', {version:1,stage:[1280,720],sources:source.hashes,generator:{package:'render-art',command:'pnpm --filter render-art build',chrome:await browser.version(),rasterization:'Chrome software rasterization (--disable-gpu), sRGB; settle two frames before/after mounting each element',png:'lossless RGBA PNG; zero RGB at alpha=0; no palette quantization'},
    conventions:{pixelSize:'physical file pixels; null for fonts/raw vectors/licenses',scale:'physical pixels per reference unit',anchor:'pixel location of reference origin (0,0); subtract when placing a bitmap',logicalBounds:'reference units, including overflow; atlas frame anchors describe the frame rather than full texture'},
    stickerBox:[120,120],stickerBounds,objects,stickerEffects:{holographic:{periodMs:2200,hueDegrees:[0,360],saturate:1.3,brightness:1.05,appliesTo:'art bitmap only; animated eyes remain unaffected',source:'reference/src/style.css (.holostk > svg, @keyframes hue)'}},eyes:{sprites:eyeSprites,ring:'3 CSS px (default --ew); keep fixed per logical pixel rather than scaling with radius',pupil:{diameterFraction:.54,insetFraction:.23,travel:'translate(x * 42%, y * 42%) of pupil size',highlight:{leftFraction:.16,topFraction:.14,sizeFraction:.30,opacity:.85}},scaleRule:'choose nearest native radius and scale pupil freely; eye whites at other radii should be a circle with the documented fixed ring/inset shade'},
    photo:{rect:{x:10,y:10,width:100,height:100,rx:20},variants:photo,drawOrder:['shadow','photo through mask','overlay'],coverage:'Calibrated from black/white photos through the unchanged full filter. M=A/(1-O); O=(T-A-(1-A)*S)/(1-S), where T is total filter alpha and S is shadow alpha. Geometric-mask stores unadjusted rounded-rect coverage. Use mask with overlay on top.'},
    host:{parts:'host/parts',sequences,poses:poseInputs},icons:iconIds,files,totalBytes});
  evidence.assetBytes=totalBytes;
  evidence.chrome=await browser.version();
  evidence.sourceHashes=source.hashes;
  evidence.lossless='PNG encoding only; alpha-zero RGB cleared. Visible preservation proven over ink and paper.';
  await json('docs/review/art-validation.json',evidence);
  console.log(`Fonts are pixel-identical at 1x/2x. Wrote ${Object.keys(files).length} assets (${(totalBytes/1024/1024).toFixed(2)} MiB) and docs/review/art-sheet.png.`);
} finally {
  await browser.close();
  await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
}
