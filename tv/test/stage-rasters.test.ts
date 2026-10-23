import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { TOKENS, BG_PALETTES } from '@snag/shared';
import rasters from '../src/stage/generated/text-rasters.json';
import { glyphCache } from '../src/stage/glyphs';

const sharp = createRequire(new URL('../../relay/package.json', import.meta.url))('sharp');

it('keeps native fixed-title pixels and layout equal to the production glyph renderer', async () => {
  expect(Object.keys(rasters)).toHaveLength(11);
  for (const [key, raster] of Object.entries(rasters)) {
    const [text, size, color, stroke, shadow, spacing] = JSON.parse(key) as [string, number, string, number, number, number];
    const shape = glyphCache.get(text, size, spacing), pad = stroke / 2 + 2;
    expect(raster.glyphWidth).toBe(shape.width); expect(raster.baseline).toBe(shape.baseline);
    expect(raster.width).toBe(shape.width + pad * 2); expect(raster.height).toBe(shape.height + shadow + stroke);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${raster.width}" height="${raster.height}" viewBox="0 0 ${raster.width} ${raster.height}"><g transform="translate(${pad} 0)"><path d="${shape.d}" fill="${TOKENS.ink}" stroke="${TOKENS.ink}" stroke-width="${stroke}" stroke-linejoin="round" transform="translate(0 ${shadow})"/><path d="${shape.d}" fill="${TOKENS.ink}" stroke="${TOKENS.ink}" stroke-width="${stroke}" stroke-linejoin="round"/><path d="${shape.d}" fill="${color}"/></g></svg>`;
    const expected: Buffer = await sharp(Buffer.from(svg), { density: 144 }).resize(Math.ceil(raster.width * 2), Math.ceil(raster.height * 2)).ensureAlpha().raw().toBuffer();
    const actual: Buffer = await sharp(await readFile(new URL('../../assets/' + raster.id + '.png', import.meta.url))).ensureAlpha().raw().toBuffer();
    expect(actual.equals(expected), text).toBe(true);
  }
});

it('precomposes the opaque set without changing its overlay pixels', async () => {
  for (const [mood, palette] of Object.entries(BG_PALETTES)) {
    const { data, info } = await sharp(await readFile(new URL('../../assets/stage/base-' + mood + '.png', import.meta.url))).raw().toBuffer({ resolveWithObject: true });
    const overlay: Buffer = await sharp(await readFile(new URL('../../assets/stage/overlay-' + mood + '.png', import.meta.url))).ensureAlpha().raw().toBuffer();
    expect(info.channels).toBe(3); expect(info.width).toBe(1280); expect(info.height).toBe(720);
    let difference = 0;
    for (let i = 0; i < 1280 * 720; i++) for (let channel = 0; channel < 3; channel++) {
      const alpha = overlay[i * 4 + 3]! / 255;
      const expected = Math.round(palette.base[channel]! * (1 - alpha) + overlay[i * 4 + channel]! * alpha);
      difference = Math.max(difference, Math.abs(data[i * 3 + channel] - expected));
    }
    expect(difference, mood).toBeLessThanOrEqual(1);
  }
});
