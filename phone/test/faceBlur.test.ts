import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DETECTOR_WAIT_MS, FACE_REDACTION, FaceRedactor, expandFaceBox, loadMediaPipe, mosaicLayout, retryFaceBoxes, selectFaceBoxes, type SnapDetector } from '../src/faceBlur';

const sdk = vi.hoisted(() => ({ create: vi.fn(), files: vi.fn(async () => ({})) }));
vi.mock('@mediapipe/tasks-vision', () => ({ FaceDetector: { createFromOptions: sdk.create }, FilesetResolver: { forVisionTasks: sdk.files } }));

const box = { x: 200, y: 160, width: 120, height: 160 };
function canvas(width = 720, height = 720): HTMLCanvasElement {
  const context = { drawImage: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn() };
  return { width, height, getContext: () => context } as unknown as HTMLCanvasElement;
}
beforeEach(() => vi.stubGlobal('document', { createElement: () => canvas(0, 0) }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('face box expansion and mosaic geometry', () => {
  it('uses 25% sides/bottom and 45% top to cover the forehead', () => {
    expect(expandFaceBox(box, 720, 720)).toEqual({ x: 170, y: 88, width: 180, height: 272 });
    const melvin = expandFaceBox({ x: 256, y: 205, width: 99, height: 99 }, 720, 720)!;
    expect(melvin).toEqual({ x: 231, y: 160, width: 149, height: 169 });
    expect(melvin.x).toBeLessThanOrEqual(236); expect(melvin.y).toBeLessThanOrEqual(160);
    expect(melvin.x + melvin.width).toBeGreaterThanOrEqual(370);
    expect(melvin.y + melvin.height).toBeGreaterThanOrEqual(323);
  });
  it('rounds outward and clips faces crossing each canvas edge', () => {
    expect(expandFaceBox({ x: -10, y: -5, width: 80, height: 40 }, 720, 720)).toEqual({ x: 0, y: 0, width: 90, height: 45 });
    expect(expandFaceBox({ x: 690.3, y: 705.2, width: 50, height: 30 }, 720, 720)).toEqual({ x: 677, y: 691, width: 43, height: 29 });
  });
  it('rejects non-finite, empty and wholly off-frame boxes', () => {
    for (const invalid of [{ ...box, x: NaN }, { ...box, width: 0 }, { ...box, height: -1 }, { ...box, x: 1000 }, { ...box, y: -1000 }]) expect(expandFaceBox(invalid, 720, 720)).toBeNull();
  });
  it('keeps square cells and includes partial cells at the right/bottom edges', () => {
    expect(mosaicLayout({ x: 0, y: 0, width: 180, height: 240 })).toEqual({ cell: 15, columns: 12, rows: 16 });
    expect(mosaicLayout({ x: 0, y: 0, width: 181, height: 241 })).toEqual({ cell: 16, columns: 12, rows: 16 });
    expect(mosaicLayout({ x: 0, y: 0, width: 1, height: 2 })).toEqual({ cell: 1, columns: 1, rows: 2 });
  });
  it('maps padded, downscaled retry boxes back onto the original and wipes scratch', () => {
    let scratch: HTMLCanvasElement | undefined;
    const detector: SnapDetector = { detect: (image) => { scratch = image; expect(image.width).toBe(360); return [{ x: 100, y: 110, width: 20, height: 30 }]; } };
    expect(retryFaceBoxes(canvas(), detector)).toEqual([{ x: 40, y: 80, width: 80, height: 120 }]);
    expect(scratch?.width).toBe(0); expect(scratch?.height).toBe(0);
  });
});

describe('confidence and unpadded box sanity', () => {
  it('accepts threshold equality and native boxes without confidence; rejects low/invalid confidence', () => {
    const good = { ...box, confidence: .7 };
    expect(selectFaceBoxes([good, box], 720, 720, .7)).toEqual([good, box]);
    expect(selectFaceBoxes([{ ...box, confidence: .699 }, { ...box, confidence: NaN }], 720, 720, .7)).toEqual([]);
  });
  it('checks both relative sides, visible area, and aspect ratio before padding', () => {
    expect(selectFaceBoxes([{ x: 100, y: 100, width: 72, height: 36 }], 720, 720, .7)).toHaveLength(1);
    expect(selectFaceBoxes([{ x: 100, y: 100, width: 35, height: 35 }], 720, 720, .7, { ...FACE_REDACTION, minArea: 0 })).toEqual([]);
    expect(selectFaceBoxes([{ x: 100, y: 100, width: 40, height: 50 }], 720, 720, .7)).toEqual([]);
    for (const [width, height] of [[80, 240], [240, 80]]) expect(selectFaceBoxes([{ x: 0, y: 0, width: width!, height: height! }], 720, 720, .7)).toEqual([]);
    expect(selectFaceBoxes([{ x: 700, y: 0, width: 72, height: 36 }], 720, 720, .7)).toEqual([]);
  });
  it('rejects invalid and completely off-frame detections', () => {
    for (const bad of [{ ...box, x: NaN }, { ...box, width: 0 }, { ...box, y: 800 }, { ...box, x: -1000 }]) expect(selectFaceBoxes([bad], 720, 720, .7)).toEqual([]);
    expect(selectFaceBoxes([box], 0, 720, .7)).toEqual([]);
  });
});

describe('actual SDK thresholds', () => {
  it('uses one warm SDK runtime at the recommended confidence with retry off', async () => {
    sdk.create.mockReset();
    const close = vi.fn(); sdk.create.mockResolvedValue({ detect: () => ({ detections: [{ boundingBox: { originX: 200, originY: 160, width: 120, height: 160 }, categories: [{ score: .9 }] }] }), close });
    const detector = await loadMediaPipe();
    expect(sdk.create).toHaveBeenCalledTimes(1);
    expect(sdk.create.mock.calls[0]![1]).toMatchObject({ minDetectionConfidence: .7, runningMode: 'IMAGE' });
    expect(detector.detect(canvas())).toEqual([{ ...box, confidence: .9 }]);
    expect(detector.detectRetry).toBeUndefined(); detector.close?.(); expect(close).toHaveBeenCalledTimes(1);
  });
  it('configures an independent retry runtime when its threshold differs, and closes both', async () => {
    sdk.create.mockReset();
    const primary = { detect: vi.fn(() => ({ detections: [] })), close: vi.fn() };
    const retry = { detect: vi.fn(() => ({ detections: [] })), close: vi.fn() };
    sdk.create.mockResolvedValueOnce(primary).mockResolvedValueOnce(retry);
    const detector = await loadMediaPipe({ ...FACE_REDACTION, retry: true, retryConfidence: .8 });
    expect(sdk.create.mock.calls.map(call => call[1].minDetectionConfidence)).toEqual([.7, .8]);
    retryFaceBoxes(canvas(), detector);
    expect(primary.detect).not.toHaveBeenCalled(); expect(retry.detect).toHaveBeenCalledTimes(1);
    detector.close?.(); expect(primary.close).toHaveBeenCalledTimes(1); expect(retry.close).toHaveBeenCalledTimes(1);
  });
});

describe('detector readiness and explicitly metered fallbacks', () => {
  it('loads once, retains a warm detector and avoids the retry when faces are found', async () => {
    const detect = vi.fn(() => [box]), load = vi.fn(async () => ({ detect }));
    const shape = vi.fn(() => null), redactor = new FaceRedactor(load, shape);
    await Promise.all([redactor.warm(), redactor.warm()]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await redactor.redact(canvas())).toBe('mediapipe');
    expect(await redactor.redact(canvas())).toBe('mediapipe');
    expect(detect).toHaveBeenCalledTimes(2); expect(shape).not.toHaveBeenCalled();
  });
  it('does not retry empty captures with the recommended settings', async () => {
    const detect = vi.fn(() => []), redactor = new FaceRedactor(async () => ({ detect }), () => null);
    expect(await redactor.redact(canvas())).toBe('mediapipe'); expect(detect).toHaveBeenCalledTimes(1);
  });
  it('runs an enabled close-up retry only on an empty first pass', async () => {
    const detect = vi.fn().mockReturnValueOnce([]).mockReturnValueOnce([{ x: 100, y: 110, width: 20, height: 30 }]);
    const redactor = new FaceRedactor(async () => ({ detect }), () => null, { ...FACE_REDACTION, retry: true });
    expect(await redactor.redact(canvas())).toBe('mediapipe'); expect(detect).toHaveBeenCalledTimes(2);
  });
  it.each([.79, .8])('filters the first pass before retry and applies the retry threshold (%s)', async confidence => {
    const detect = vi.fn(() => [{ ...box, confidence: .69 }]);
    const detectRetry = vi.fn(() => [{ x: 100, y: 110, width: 20, height: 30, confidence }]);
    const redactor = new FaceRedactor(async () => ({ detect, detectRetry }), () => null, { ...FACE_REDACTION, retry: true, retryConfidence: .8 });
    const image = canvas(), context = image.getContext('2d')!;
    expect(await redactor.redact(image)).toBe('mediapipe');
    expect(detect).toHaveBeenCalledTimes(1); expect(detectRetry).toHaveBeenCalledTimes(1);
    expect(context.drawImage).toHaveBeenCalledTimes(confidence >= .8 ? 1 : 0);
  });
  it('waits at most 1.5 s at the shutter, then uses Shape Detection; late loading can still warm the next snap', async () => {
    vi.useFakeTimers();
    let ready!: (detector: SnapDetector) => void;
    const load = () => new Promise<SnapDetector>((resolve) => { ready = resolve; });
    const shape = { detect: vi.fn(async () => [{ boundingBox: box }]) };
    const redactor = new FaceRedactor(load, () => shape);
    let completed = false;
    const snap = redactor.redact(canvas()).then((method) => { completed = true; return method; });
    await vi.advanceTimersByTimeAsync(DETECTOR_WAIT_MS - 1); expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1); expect(await snap).toBe('shape');
    ready({ detect: () => [box] }); await redactor.warm();
    expect(await redactor.redact(canvas())).toBe('mediapipe'); expect(shape.detect).toHaveBeenCalledTimes(1);
  });
  it('marks unavailable runtimes none without retaining/retrying a rejected load', async () => {
    const load = vi.fn(async () => { throw new Error('Unsupported WASM'); });
    const redactor = new FaceRedactor(load, () => null);
    expect(await redactor.redact(canvas())).toBe('none');
    expect(await redactor.redact(canvas())).toBe('none'); expect(load).toHaveBeenCalledTimes(1);
  });
  it('closes a failing MediaPipe runtime and attempts the native detector', async () => {
    const close = vi.fn(), shape = { detect: vi.fn(async () => [{ boundingBox: box }]) };
    const redactor = new FaceRedactor(async () => ({ detect: () => { throw new Error('Lost context'); }, close }), () => shape);
    expect(await redactor.redact(canvas())).toBe('shape'); expect(close).toHaveBeenCalledTimes(1);
    expect(await redactor.redact(canvas())).toBe('shape'); expect(close).toHaveBeenCalledTimes(1);
  });
  it('marks a failing native API none', async () => {
    const redactor = new FaceRedactor(async () => { throw new Error('Unsupported WASM'); }, () => ({ detect: async () => { throw new Error('Unsupported shape'); } }));
    expect(await redactor.redact(canvas())).toBe('none');
  });
  it('bounds a hung native API too', async () => {
    vi.useFakeTimers();
    const redactor = new FaceRedactor(async () => { throw new Error('Unsupported WASM'); }, () => ({ detect: () => new Promise(() => {}) }));
    const snap = redactor.redact(canvas()); await vi.advanceTimersByTimeAsync(DETECTOR_WAIT_MS);
    expect(await snap).toBe('none');
  });
});
