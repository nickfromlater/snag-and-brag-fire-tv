import jpeg from 'jpeg-js';
import { rgbaPng } from './pixel-raster';
import { PHOTO_MASK_RLE, PHOTO_MASK_SIZE } from './generated/photo-mask';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function imageBytes(base64: string): Uint8Array {
  const pad = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array(base64.length / 4 * 3 - pad);
  for (let i = 0, j = 0; i < base64.length; i += 4) {
    const n = alphabet.indexOf(base64[i]!) << 18 | alphabet.indexOf(base64[i + 1]!) << 12 | Math.max(0, alphabet.indexOf(base64[i + 2]!)) << 6 | Math.max(0, alphabet.indexOf(base64[i + 3]!));
    bytes[j++] = n >>> 16; if (j < bytes.length) bytes[j++] = n >>> 8; if (j < bytes.length) bytes[j++] = n;
  }
  return bytes;
}
export const photoCoverage = (() => {
  const runs = imageBytes(PHOTO_MASK_RLE), alpha = new Uint8Array(PHOTO_MASK_SIZE ** 2); let at = 0;
  for (let i = 0; i < runs.length; i += 3) { const count = runs[i]! << 8 | runs[i + 1]!; alpha.fill(runs[i + 2]!, at, at + count); at += count; }
  if (at !== alpha.length) throw new Error('Invalid reference photo coverage');
  return alpha;
})();
/** Center-cover into the asset's exact (10,10,100,100) calibrated alpha mask.
 * This runs once per find; native scenes receive a stable transparent bitmap. */
export function maskedPhotoPng(encoded: Uint8Array): Uint8Array {
  const source = jpeg.decode(encoded, { useTArray: true, maxResolutionInMP: .6, maxMemoryUsageInMB: 32 });
  const size = PHOTO_MASK_SIZE, crop = Math.min(source.width, source.height), left = (source.width - crop) / 2, top = (source.height - crop) / 2;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = y * size + x, alpha = photoCoverage[index]!; if (!alpha) continue;
    const sx = Math.max(0, Math.min(source.width - 1, left + (x + .5) * crop / size - .5)), sy = Math.max(0, Math.min(source.height - 1, top + (y + .5) * crop / size - .5));
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(source.width - 1, x0 + 1), y1 = Math.min(source.height - 1, y0 + 1), fx = sx - x0, fy = sy - y0;
    for (let channel = 0; channel < 3; channel++) {
      const a = source.data[(y0 * source.width + x0) * 4 + channel]!, b = source.data[(y0 * source.width + x1) * 4 + channel]!, c = source.data[(y1 * source.width + x0) * 4 + channel]!, d = source.data[(y1 * source.width + x1) * 4 + channel]!;
      pixels[index * 4 + channel] = Math.round((a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy);
    }
    pixels[index * 4 + 3] = alpha;
  }
  return rgbaPng(pixels, size, size);
}
