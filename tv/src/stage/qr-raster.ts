import qrcode from 'qrcode-generator';
import { TOKENS } from '@snag/shared';
import { palettePng } from './pixel-raster';
import { base64 } from './memory-images';

const cache = new Map<string, string>();
/** Rasterize once per room; keep the exact Byte/M modules and four-module quiet zone. */
export function qrRaster(url: string): string {
  const old = cache.get(url); if (old) return old;
  const code = qrcode(0, 'M'); code.addData(url, 'Byte'); code.make();
  const modules = code.getModuleCount(), scale = 6, side = (modules + 8) * scale;
  const indices = new Uint8Array(side * side); indices.fill(1);
  for (let y = 0; y < modules; y++) for (let x = 0; x < modules; x++) if (code.isDark(y, x)) {
    for (let row = 0; row < scale; row++) { const start = ((y + 4) * scale + row) * side + (x + 4) * scale; indices.fill(0, start, start + scale); }
  }
  const ink = TOKENS.ink.slice(1).match(/../g)!.map(v => parseInt(v, 16));
  const uri = 'data:image/png;base64,' + base64(palettePng(indices, side, side, new Uint8Array([...ink, 255, 255, 255])));
  cache.set(url, uri); if (cache.size > 8) cache.delete(cache.keys().next().value!);
  return uri;
}
