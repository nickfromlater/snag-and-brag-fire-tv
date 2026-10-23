import { afterEach, describe, expect, it, vi } from 'vitest';
import { JUDGE_SIZE, TIMING, judgeMask } from '@snag/shared';
import { encodeThumbnail, snagImage } from '../src/camera';
import { faceRedactor } from '../src/faceBlur';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function encoder(sizes: number[]): { canvas: HTMLCanvasElement; qualities: number[] } {
  const qualities: number[] = [];
  return { qualities, canvas: { toBlob: (done: BlobCallback, type: string, quality: number) => { expect(type).toBe('image/jpeg'); qualities.push(quality); done(new Blob([new Uint8Array(sizes.shift() ?? 800)], { type })); } } as unknown as HTMLCanvasElement };
}
describe('thumbnail byte budget (browser JPEG encoding is exercised in smoke)', () => {
  it('keeps a normal 3 KB frame at low JPEG quality', async () => { const e = encoder([3000]); expect((await encodeThumbnail(e.canvas)).length).toBe(3000); expect(e.qualities).toEqual([.35]); });
  it('reduces quality for noisy scenes until the payload fits 4 KB', async () => { const e = encoder([7000, 5000, 3900]); expect((await encodeThumbnail(e.canvas)).length).toBe(3900); expect(e.qualities).toEqual([.35, .24, .15]); });
  it('does not pad a simple scene with useless bytes', async () => { const e = encoder([800]); expect((await encodeThumbnail(e.canvas)).length).toBe(800); });
  it('drops an oversized preview rather than shipping an unbounded frame', async () => { const e = encoder([9000, 8000, 7000, 6000]); await expect(encodeThumbnail(e.canvas)).rejects.toThrow('size budget'); });
});

describe('shutter judging and evidence', () => {
  it.each(['#F23B2E', null])('judges and masks the redacted 480px downscale before encoding (%s)', async target => {
    const rgba = new Uint8ClampedArray(JUDGE_SIZE * JUDGE_SIZE * 4);
    const redacted = new Uint8ClampedArray(rgba.length);
    for (let i = 0; i < rgba.length; i += 4) {
      const left = (i / 4) % JUDGE_SIZE < JUDGE_SIZE / 2;
      rgba.set(left ? [242, 59, 46, 255] : [46, 91, 255, 255], i);
      redacted.set(left ? [46, 91, 255, 255] : [242, 59, 46, 255], i);
    }
    const originalMask = target ? judgeMask(rgba, JUDGE_SIZE, target) : undefined;
    const expectedMask = target ? judgeMask(redacted, JUDGE_SIZE, target) : undefined;
    if (target) expect(expectedMask).not.toBe(originalMask);
    const order: string[] = [];
    const makeCanvas = () => {
      const context = { drawImage: vi.fn(), getImageData: vi.fn(() => { order.push('judge'); return { data: rgba }; }) };
      const encoded = encoder([800]);
      const canvas = { ...encoded.canvas, width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
      return { canvas, context, qualities: encoded.qualities };
    };
    const square = makeCanvas(), judge = makeCanvas(), pending = [square, judge];
    vi.spyOn(faceRedactor, 'redact').mockImplementation(async canvas => {
      expect(canvas).toBe(square.canvas); expect(canvas.width).toBe(TIMING.SNAG_PX); expect(canvas.height).toBe(TIMING.SNAG_PX);
      order.push('redact'); rgba.set(redacted); return 'mediapipe';
    });
    const encode = square.canvas.toBlob;
    square.canvas.toBlob = (done, type, quality) => {
      order.push('encode'); expect(square.canvas.width).toBe(TIMING.SNAG_PX); expect(judge.canvas.width).toBe(JUDGE_SIZE);
      encode.call(square.canvas, done, type, quality);
    };
    vi.stubGlobal('document', { createElement: () => pending.shift()!.canvas });
    const result = await snagImage({} as CanvasImageSource, 1280, 720, target);
    expect(order).toEqual(['redact', 'judge', 'encode']); expect(result.redaction).toBe('mediapipe');
    expect(square.canvas.width).toBe(0); expect(square.canvas.height).toBe(0);
    expect(judge.canvas.width).toBe(0); expect(judge.canvas.height).toBe(0); expect(rgba.every(value => value === 0)).toBe(true);
    expect(judge.context.drawImage).toHaveBeenCalledWith(square.canvas, 0, 0, JUDGE_SIZE, JUDGE_SIZE);
    expect(judge.context.getImageData).toHaveBeenCalledWith(0, 0, JUDGE_SIZE, JUDGE_SIZE);
    expect(square.qualities).toEqual([TIMING.SNAG_JPEG_Q]); expect(result.bytes).toHaveLength(800);
    if (target) { expect(result.mask).toBe(expectedMask); expect(result.match).toBe(99); }
    else { expect(result).not.toHaveProperty('mask'); expect(result.match).toBe(0); }
  });
});
