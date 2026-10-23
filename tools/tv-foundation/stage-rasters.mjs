// Deterministic render assets from the existing glyph outlines and ray geometry.
// No player media or network requests enter this generator.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export async function makeStageRasters(root) {
  const sharp = createRequire(resolve(root, 'relay/package.json'))('sharp');
  const { BG_PALETTES, ROUNDS, TOKENS, TICKER } = await import(pathToFileURL(resolve(root, 'shared/src/constants.ts')).href);
  const { seededRng } = await import(pathToFileURL(resolve(root, 'shared/src/game/random.ts')).href);
  const { starD } = await import(pathToFileURL(resolve(root, 'tv/src/stage/background-geometry.ts')).href);
  const bank = JSON.parse(await readFile(resolve(root, 'tv/src/stage/generated/glyphs.json'), 'utf8'));
  const folder = resolve(root, 'assets/stage'); await mkdir(folder, { recursive: true });
  const assets = [], texts = {};
  const shape = (text, size, spacing) => {
    const factor = size / bank.units, baseline = bank.ascender * factor;
    let x = 0, d = '', previous = '';
    for (const character of text) {
      const glyph = bank.glyphs[character] ?? bank.glyphs['?']; x += (bank.kerning[previous + character] ?? 0) * factor;
      for (const c of glyph.commands) {
        const p = (a, b) => (x + (a ?? 0) * factor).toFixed(2) + ' ' + (baseline - (b ?? 0) * factor).toFixed(2);
        d += c.type;
        if (c.type === 'M' || c.type === 'L') d += p(c.x, c.y);
        else if (c.type === 'Q') d += p(c.x1, c.y1) + ' ' + p(c.x, c.y);
        else if (c.type === 'C') d += p(c.x1, c.y1) + ' ' + p(c.x2, c.y2) + ' ' + p(c.x, c.y);
      }
      x += glyph.advance * factor + spacing; previous = character;
    }
    return { d, width: Math.max(0, x - spacing), height: (bank.ascender - bank.descender) * factor, baseline };
  };
  const specs = [
    ['SNAG', 188, TOKENS.yolk, 14, 10, 1], ['BRAG', 188, TOKENS.bubble, 14, 10, 1],
    ['&', 96, TOKENS.bubble, 5, 0, 1], ['Join the show', 44, TOKENS.ink, 0, 0, 0],
    ['3', 330, TOKENS.yolk, 14, 10, 1], ['2', 330, TOKENS.yolk, 14, 10, 1], ['1', 330, TOKENS.bubble, 14, 10, 1], ['SNAG!', 250, TOKENS.lime, 14, 10, 1],
  ];
  for (const round of ROUNDS) {
    let size = 168; while (size > 16 && shape(round.name, size, 1).width > 1022) size--;
    specs.push([round.name, size, TOKENS.yolk, 14, 10, 1]);
  }
  for (const [index, spec] of specs.entries()) {
    const [text, size, color, stroke, shadow, spacing] = spec, glyph = shape(text, size, spacing), pad = stroke / 2 + 2;
    const width = glyph.width + pad * 2, height = glyph.height + shadow + stroke;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g transform="translate(${pad} 0)"><path d="${glyph.d}" fill="${TOKENS.ink}" stroke="${TOKENS.ink}" stroke-width="${stroke}" stroke-linejoin="round" transform="translate(0 ${shadow})"/><path d="${glyph.d}" fill="${TOKENS.ink}" stroke="${TOKENS.ink}" stroke-width="${stroke}" stroke-linejoin="round"/><path d="${glyph.d}" fill="${color}"/></g></svg>`;
    const id = 'stage/title-' + index, file = resolve(folder, 'title-' + index + '.png');
    await sharp(Buffer.from(svg), { density: 144 }).resize(Math.ceil(width * 2), Math.ceil(height * 2)).png({ compressionLevel: 9 }).toFile(file);
    assets.push([id, file]); texts[JSON.stringify(spec)] = { id, width, height, glyphWidth: glyph.width, baseline: glyph.baseline };
  }
  const rays = Array.from({ length: 18 }, (_, i) => {
    const a = i * Math.PI * 2 / 18, b = a + Math.PI / 18;
    return `M900 900L${900 + 1500 * Math.cos(a)} ${900 + 1500 * Math.sin(a)}L${900 + 1500 * Math.cos(b)} ${900 + 1500 * Math.sin(b)}Z`;
  }).join('');
  for (const [mood, palette] of Object.entries(BG_PALETTES)) {
    const id = 'stage/rays-' + mood, file = resolve(folder, 'rays-' + mood + '.png');
    const center = palette.ray.map((v, i) => v * .4 + palette.glow[i] * .6), rgb = color => `rgb(${color.join(',')})`;
    // The glow is radial about the ray pivot, so baking it preserves its position
    // while the rays rotate. The opaque floor clips the moving sky at runtime.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1800"><defs><radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="900" cy="900" r="700"><stop offset="0" stop-color="${rgb(center)}"/><stop offset="${40 / 700}" stop-color="${rgb(center)}"/><stop offset="${403 / 700}" stop-color="${rgb(palette.ray)}"/><stop offset="1" stop-color="${rgb(palette.ray)}"/></radialGradient></defs><path d="${rays}" fill="url(#glow)"/></svg>`;
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(file);
    assets.push([id, file]);
    const baseFile = resolve(folder, 'base-' + mood + '.png');
    await sharp({ create: { width: 1280, height: 720, channels: 4, background: { r: palette.base[0], g: palette.base[1], b: palette.base[2], alpha: 1 } } })
      .composite([{ input: resolve(folder, 'overlay-' + mood + '.png') }]).removeAlpha().png({ compressionLevel: 9 }).toFile(baseFile);
    assets.push(['stage/base-' + mood, baseFile]);
  }
  const random = seededRng(1397637447);
  for (let index = 0; index < 16; index++) {
    random(); random(); const s = 14 + random() * 20; random(); random(); random();
    const kind = index % 5, color = ['#FFD43B', '#FF4FA0', '#3FE0D0', '#B8F23B', '#FFF8EC'][index % 5];
    const d = kind === 0 ? starD(40, 40, s, s * .45) : kind === 1 || kind === 4
      ? `M${40 - s * (kind === 1 ? .6 : .3)} 40a${s * (kind === 1 ? .6 : .3)} ${s * (kind === 1 ? .6 : .3)} 0 1 0 ${s * (kind === 1 ? 1.2 : .6)} 0a${s * (kind === 1 ? .6 : .3)} ${s * (kind === 1 ? .6 : .3)} 0 1 0 ${-s * (kind === 1 ? 1.2 : .6)} 0`
      : kind === 2 ? `M${40 - s} 40C${40 - s / 2} ${40 - s * .6} 40 ${40 + s * .6} ${40 + s / 2} 40C${40 + s * .7} ${40 - s * .3} ${40 + s} ${40 - s * .2} ${40 + s} 40`
        : `M${40 - s * .15} ${40 - s * .6}h${s * .3}v${s * .45}h${s * .45}v${s * .3}h${-s * .45}v${s * .45}h${-s * .3}v${-s * .45}h${-s * .45}v${-s * .3}h${s * .45}Z`;
    const outline = kind === 1 || kind === 2, id = 'stage/doodle-' + index, file = resolve(folder, 'doodle-' + index + '.png');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><path d="${d}" fill="${outline ? 'none' : color}" stroke="${outline ? color : kind === 0 ? 'rgba(14,11,43,.35)' : 'none'}" stroke-width="${outline ? 6 : 4}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    await sharp(Buffer.from(svg), { density: 144 }).png({ compressionLevel: 9 }).toFile(file); assets.push([id, file]);
  }
  await writeFile(resolve(root, 'tv/src/stage/generated/text-rasters.json'), JSON.stringify(texts, null, 2) + '\n');
  // Static ticker headlines use the same Rubik 800 outlines and 0.8px spacing.
  // Short textures avoid repainting hundreds of moving text glyphs each frame.
  const font = createRequire(resolve(root, 'tv/package.json'))('opentype.js').loadSync(resolve(root, 'assets/fonts/Rubik-800.ttf'));
  const factor = 16 / font.unitsPerEm, baseline = (28 - (font.ascender - font.descender) * factor) / 2 + font.ascender * factor;
  const pieces = []; let cursor = 0;
  for (const [index, headline] of TICKER.entries()) {
    let x = 1, previous, paths = '';
    for (const [text, color] of [[headline, TOKENS.paper], ['   ●   ', TOKENS.bubble]]) {
      let d = '';
      for (const character of text) {
        // Rubik does not contain U+25CF. Match the native fallback's small
        // filled separator rather than baking the font's missing-glyph box.
        if (character === '●') { paths += `<circle cx="${x + 4}" cy="14.7" r="3.6" fill="${color}"/>`; x += 8.8; previous = undefined; continue; }
        const glyph = font.charToGlyph(character);
        if (previous) x += font.getKerningValue(previous, glyph) * factor;
        d += glyph.getPath(x, baseline, 16).toPathData(3);
        x += glyph.advanceWidth * factor + .8; previous = glyph;
      }
      paths += `<path d="${d}" fill="${color}"/>`;
    }
    const width = Math.ceil(x + 1), id = 'stage/ticker-' + index, file = resolve(folder, 'ticker-' + index + '.png');
    await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="28">${paths}</svg>`), { density: 144 }).png({ compressionLevel: 9 }).toFile(file);
    pieces.push({ id, x: 20 + cursor - 1, width, height: 28, headline }); cursor += x - 1;
    assets.push([id, file]);
  }
  await writeFile(resolve(root, 'tv/src/stage/generated/ticker-rasters.json'), JSON.stringify({ width: 20 + cursor, height: 28, pieces }, null, 2) + '\n');
  // Celebration confetti: two tall sticker-style layers, each moved by one native-driver
  // transform. Rendered at half resolution; the stage draws them at 1280 x 1440.
  for (const [layer, count, scale, seed] of [['near', 64, 1, 7031], ['far', 84, .62, 9127]]) {
    const rng = seededRng(seed), colors = [TOKENS.yolk, TOKENS.bubble, TOKENS.lime, '#3FE0D0', '#FF7A1F', '#8B5CFF', TOKENS.paper];
    let pieces = '';
    for (let i = 0; i < count; i++) {
      const x = 30 + rng() * 1220, y = 30 + rng() * 1380, r = Math.round(rng() * 360), c = colors[Math.floor(rng() * colors.length)], k = rng();
      const s = (18 + rng() * 14) * scale, w = Math.max(3, 4 * scale);
      const body = k < .45 ? `<rect x="${-s / 2}" y="${-s / 4}" width="${s}" height="${s / 2}" rx="${s / 8}"/>`
        : k < .7 ? `<circle r="${s / 2.6}"/>`
        : k < .88 ? `<path d="M${-s / 2} 0q${s / 4} ${-s / 2.4} ${s / 2} 0t${s / 2} 0" fill="none" stroke-width="${w * 2.2}" stroke="${TOKENS.ink}"/><path d="M${-s / 2} 0q${s / 4} ${-s / 2.4} ${s / 2} 0t${s / 2} 0" fill="none" stroke-width="${w}" stroke="${c}"/>`
        : `<path d="${starD(0, 0, s / 1.7, s / 3.6)}"/>`;
      pieces += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${r})" fill="${c}" stroke="${TOKENS.ink}" stroke-width="${w}" stroke-linejoin="round">${body}</g>`;
    }
    const id = 'stage/confetti-' + layer, file = resolve(folder, 'confetti-' + layer + '.png');
    await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1440">${pieces}</svg>`)).resize(640, 720).png({ compressionLevel: 9 }).toFile(file);
    assets.push([id, file]);
  }
  // Dot fields drawn as one raster each: thousands of SVG circles were re-tessellated
  // every frame on the stick (Brag-Off ran at 16 fps).
  for (const [name, width, height, step, radius, fill] of [['brag-dots', 1280, 720, 16, 2.4, 'rgba(14,11,43,.18)'], ['card-dots', 280, 340, 14, 2.4, 'rgba(255,255,255,.22)']]) {
    let d = '';
    for (let y = name === 'brag-dots' ? 8 : 0; y < height; y += step) for (let x = name === 'brag-dots' ? 8 : 0; x < width; x += step) d += `M${x - radius} ${y}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0Z`;
    const id = 'stage/' + name, file = resolve(folder, name + '.png');
    await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><path d="${d}" fill="${fill}"/></svg>`), { density: 144 }).png({ compressionLevel: 9 }).toFile(file);
    assets.push([id, file]);
  }
  return assets;
}
