import { writeFile } from 'node:fs/promises';

/** Temporary fake-camera input only: deterministic, synthetic, never player media. */
export async function writeFakeCamera(filename) {
  const width = 640, height = 480;
  const y = Buffer.alloc(width * height), u = Buffer.alloc(width * height / 4), v = Buffer.alloc(width * height / 4);
  const rgb = (x, yy) => {
    const noise = ((x * 17 + yy * 11) % 31) - 15;
    const base = x < 48 ? [63, 224, 208] : x > 590 ? [255, 212, 59] : [242, 59, 46];
    return base.map((n) => Math.max(0, Math.min(255, n + noise)));
  };
  const byte = (n) => Math.max(0, Math.min(255, Math.round(n)));
  for (let yy = 0; yy < height; yy++) for (let x = 0; x < width; x++) {
    const [r, g, b] = rgb(x, yy); y[yy * width + x] = byte(16 + .257 * r + .504 * g + .098 * b);
    if (x % 2 === 0 && yy % 2 === 0) { const i = yy / 2 * (width / 2) + x / 2; u[i] = byte(128 - .148 * r - .291 * g + .439 * b); v[i] = byte(128 + .439 * r - .368 * g - .071 * b); }
  }
  await writeFile(filename, Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\nFRAME\n`), y, u, v]));
}
