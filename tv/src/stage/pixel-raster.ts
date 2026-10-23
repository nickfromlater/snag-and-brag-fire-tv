/** Memory-only nearest-neighbour cover scaling. Native image APIs expose no sampling mode. */
export function nearestRgb(rgba: Uint8Array, sourceWidth: number, sourceHeight: number, width: number, height: number): Uint8Array {
  if (sourceWidth < 1 || sourceHeight < 1 || sourceWidth > 256 || sourceHeight > 256 || rgba.length !== sourceWidth * sourceHeight * 4)
    throw new Error('Invalid thumbnail dimensions');
  if (width < 1 || height < 1 || width > 768 || height > 512 || !Number.isInteger(width) || !Number.isInteger(height))
    throw new Error('Invalid pixelated output dimensions');
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropX = (sourceWidth - width / scale) / 2, cropY = (sourceHeight - height / scale) / 2;
  const rgb = new Uint8Array(width * height * 3);
  const columns = new Uint16Array(width);
  for (let x = 0; x < width; x++) columns[x] = Math.min(sourceWidth - 1, Math.floor(cropX + (x + .5) / scale)) * 4;
  for (let y = 0; y < height; y++) {
    const sy = Math.min(sourceHeight - 1, Math.floor(cropY + (y + .5) / scale));
    for (let x = 0; x < width; x++) {
      const source = sy * sourceWidth * 4 + columns[x]!, dest = (y * width + x) * 3;
      rgb[dest] = rgba[source]!; rgb[dest + 1] = rgba[source + 1]!; rgb[dest + 2] = rgba[source + 2]!;
    }
  }
  return rgb;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i; for (let b = 0; b < 8; b++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1;
  return c >>> 0;
});
function u32(bytes: Uint8Array, at: number, n: number): void {
  bytes[at] = n >>> 24; bytes[at + 1] = n >>> 16; bytes[at + 2] = n >>> 8; bytes[at + 3] = n;
}
function chunk(type: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(payload.length + 12); u32(bytes, 0, payload.length);
  for (let i = 0; i < 4; i++) bytes[i + 4] = type.charCodeAt(i);
  bytes.set(payload, 8); let crc = 0xffffffff;
  for (let i = 4; i < bytes.length - 4; i++) crc = crcTable[(crc ^ bytes[i]!) & 255]! ^ crc >>> 8;
  u32(bytes, bytes.length - 4, (crc ^ 0xffffffff) >>> 0); return bytes;
}

/** Uncompressed PNG is deliberately small in code and never touches a filesystem or cache. */
export function pixelatedPng(rgba: Uint8Array, sourceWidth: number, sourceHeight: number, width: number, height: number): Uint8Array {
  return encodePng(nearestRgb(rgba, sourceWidth, sourceHeight, width, height), width, height, 3);
}
/** Alpha-preserving art composition; bounded, memory-only PNG output. */
export function rgbaPng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 720 || height > 720 || rgba.length !== width * height * 4) throw new Error('Invalid photo raster dimensions');
  return encodePng(rgba, width, height, 4);
}
/** Small exact-color graphics such as a QR code; one palette index per pixel. */
export function palettePng(indices: Uint8Array, width: number, height: number, palette: Uint8Array): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 720 || height > 720 || indices.length !== width * height || palette.length < 3 || palette.length > 768 || palette.length % 3) throw new Error('Invalid palette raster dimensions');
  return encodePng(indices, width, height, 1, palette);
}
function encodePng(rgb: Uint8Array, width: number, height: number, channels: 1 | 3 | 4, palette?: Uint8Array): Uint8Array {
  const stride = width * channels;
  const rows = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) rows.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const blocks = Math.ceil(rows.length / 65535), zlib = new Uint8Array(rows.length + blocks * 5 + 6);
  zlib[0] = 0x78; zlib[1] = 0x01; let cursor = 2, a = 1, b = 0;
  for (let start = 0; start < rows.length; start += 65535) {
    const length = Math.min(65535, rows.length - start), final = start + length === rows.length;
    zlib[cursor++] = final ? 1 : 0; zlib[cursor++] = length & 255; zlib[cursor++] = length >>> 8;
    zlib[cursor++] = ~length & 255; zlib[cursor++] = ~length >>> 8 & 255;
    zlib.set(rows.subarray(start, start + length), cursor); cursor += length;
  }
  // Adler-32's standard 5552-byte blocks keep sums within 32 bits. A numeric
  // loop avoids millions of iterator calls and divisions on 32-bit Hermes.
  for (let start = 0; start < rows.length; start += 5552) {
    const end = Math.min(rows.length, start + 5552);
    for (let i = start; i < end; i++) { a += rows[i]!; b += a; }
    a %= 65521; b %= 65521;
  }
  u32(zlib, cursor, (b << 16 | a) >>> 0);
  const header = new Uint8Array(13); u32(header, 0, width); u32(header, 4, height); header[8] = 8; header[9] = palette ? 3 : channels === 4 ? 6 : 2;
  const chunks = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), ...(palette ? [chunk('PLTE', palette)] : []), chunk('IDAT', zlib), chunk('IEND', new Uint8Array())];
  const result = new Uint8Array(chunks.reduce((n, part) => n + part.length, 0)); cursor = 0;
  for (const part of chunks) { result.set(part, cursor); cursor += part.length; }
  return result;
}
