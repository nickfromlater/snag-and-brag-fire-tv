import { describe, expect, it } from 'vitest';
import { crc32, inflateSync } from 'node:zlib';
import jpeg from 'jpeg-js';
import { nearestRgb, pixelatedPng } from '../src/stage/pixel-raster';

const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
describe('native nearest-neighbour thumbnail raster', () => {
  it('keeps each source pixel solid without inventing intermediate colors', () => {
    const rgb = nearestRgb(rgba, 2, 2, 4, 4);
    expect([...rgb.slice(0, 12)]).toEqual([255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0]);
    expect([...rgb.slice(24, 36)]).toEqual([0, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255, 255]);
  });
  it('center-crops with cover geometry and bounds decode/output allocation', () => {
    const row = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    expect([...nearestRgb(row, 4, 1, 2, 2)]).toEqual([0, 255, 0, 0, 0, 255, 0, 255, 0, 0, 0, 255]);
    expect(() => nearestRgb(rgba, 2, 2, 10000, 10000)).toThrow('output');
    expect(() => nearestRgb(rgba, 500, 500, 4, 4)).toThrow('thumbnail');
  });
  it('writes a valid RGB PNG with multiple DEFLATE blocks, entirely in memory', () => {
    const width = 396, height = 243, png = pixelatedPng(rgba, 2, 2, width, height), view = new DataView(png.buffer);
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(view.getUint32(16)).toBe(width); expect(view.getUint32(20)).toBe(height);
    const length = view.getUint32(33), rows = inflateSync(png.subarray(41, 41 + length));
    expect(rows.length).toBe((width * 3 + 1) * height);
    expect([...rows.slice(1, 4)]).toEqual([255, 0, 0]);
    expect(rows[width * 3 + 1]).toBe(0);
    for (let at = 8; at < png.length;) {
      const payloadLength = view.getUint32(at);
      expect(crc32(png.subarray(at + 4, at + 8 + payloadLength))).toBe(view.getUint32(at + 8 + payloadLength));
      at += payloadLength + 12;
    }
  });
  it('decodes a synthetic low-quality 96 by 64 JPEG within the native memory cap', () => {
    const fixture = new Uint8Array(96 * 64 * 4);
    for (let i = 0; i < fixture.length; i += 4) { fixture[i] = 255; fixture[i + 3] = 255; }
    const encoded = jpeg.encode({ data: fixture, width: 96, height: 64 }, 20).data;
    const decoded = jpeg.decode(encoded, { useTArray: true, maxResolutionInMP: .066, maxMemoryUsageInMB: 4 });
    const png = pixelatedPng(decoded.data, decoded.width, decoded.height, 396, 243);
    expect(png.length).toBeLessThan(300000);
    expect(decoded.data[0]).toBeGreaterThan(240);
  });
});
