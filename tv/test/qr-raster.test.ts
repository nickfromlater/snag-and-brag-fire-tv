import { createRequire } from 'node:module';
import qrcode from 'qrcode-generator';
import { expect, it } from 'vitest';
import { qrRaster } from '../src/stage/qr-raster';
const sharp = createRequire(new URL('../../relay/package.json', import.meta.url))('sharp');

it.each(['https://d2q0olvpmfmvjn.cloudfront.net/?r=BCDF', 'https://example.com/?r=TEST'])('preserves every QR module, ink color and quiet zone: %s', async url => {
  const uri = qrRaster(url), png = Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');
  expect(qrRaster(url)).toBe(uri);
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const code = qrcode(0, 'M'); code.addData(url, 'Byte'); code.make();
  const count = code.getModuleCount() + 8;
  expect(info.width).toBe(count * 6); expect(info.height).toBe(count * 6); expect(info.channels).toBe(3);
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const mx = Math.floor(x / 6) - 4, my = Math.floor(y / 6) - 4;
    const dark = mx >= 0 && my >= 0 && mx < count - 8 && my < count - 8 && code.isDark(my, mx);
    const at = (y * info.width + x) * 3;
    if (data[at] !== (dark ? 14 : 255) || data[at + 1] !== (dark ? 11 : 255) || data[at + 2] !== (dark ? 43 : 255)) throw new Error('QR pixel mismatch');
  }
});
