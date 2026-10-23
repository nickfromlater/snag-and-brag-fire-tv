import type { BinaryHeader } from '@snag/shared';

export type Redaction = NonNullable<Extract<BinaryHeader, { t: 'snag' }>['redaction']>;
export interface FaceBox { x: number; y: number; width: number; height: number; confidence?: number }
export interface SnapDetector { detect(image: HTMLCanvasElement): FaceBox[]; detectRetry?(image: HTMLCanvasElement): FaceBox[]; close?(): void }
export interface ShapeDetector { detect(image: HTMLCanvasElement): Promise<{ boundingBox: FaceBox }[]> }

export interface FaceSettings {
  confidence: number; retry: boolean; retryConfidence: number;
  minRelativeSize: number; minAspectRatio: number; maxAspectRatio: number; minArea: number;
}
export const FACE_REDACTION: Readonly<FaceSettings> = Object.freeze({
  // Frozen 12-face / 64-object sweep: 12/12 faces, 0/64 object false positives.
  confidence: .7, retry: false, retryConfidence: .7,
  minRelativeSize: .05, minAspectRatio: .5, maxAspectRatio: 2, minArea: .005,
});
export const FACE_PADDING = Object.freeze({ sides: .25, top: .45, bottom: .25 });

/** Sanity checks use the unpadded visible box, measured against the capture frame. */
export function selectFaceBoxes(boxes: readonly FaceBox[], width: number, height: number, confidence: number, settings: Readonly<FaceSettings> = FACE_REDACTION): FaceBox[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  return boxes.filter(box => {
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) return false;
    if (box.confidence !== undefined && (!Number.isFinite(box.confidence) || box.confidence < confidence)) return false;
    const visibleWidth = Math.max(0, Math.min(width, box.x + box.width) - Math.max(0, box.x));
    const visibleHeight = Math.max(0, Math.min(height, box.y + box.height) - Math.max(0, box.y));
    const aspect = box.width / box.height;
    return visibleWidth > 0 && visibleHeight > 0
      && Math.min(visibleWidth / width, visibleHeight / height) >= settings.minRelativeSize
      && aspect >= settings.minAspectRatio && aspect <= settings.maxAspectRatio
      && visibleWidth * visibleHeight / (width * height) >= settings.minArea;
  });
}

export const DETECTOR_WAIT_MS = 1500;
const ASSETS = `${import.meta.env.BASE_URL}face-detector`;

/** Round padding outward, then clip to the capture frame. */
export function expandFaceBox(box: FaceBox, width: number, height: number, padding: Readonly<{ sides: number; top: number; bottom: number }> = FACE_PADDING): FaceBox | null {
  if (![box.x, box.y, box.width, box.height, width, height].every(Number.isFinite) || box.width <= 0 || box.height <= 0 || width <= 0 || height <= 0) return null;
  const x = Math.max(0, Math.floor(box.x - box.width * padding.sides));
  const y = Math.max(0, Math.floor(box.y - box.height * padding.top));
  const right = Math.min(width, Math.ceil(box.x + box.width * (1 + padding.sides)));
  const bottom = Math.min(height, Math.ceil(box.y + box.height * (1 + padding.bottom)));
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

/** Roughly twelve square mosaic cells across a face, including partial edge cells. */
export function mosaicLayout(box: FaceBox): { cell: number; columns: number; rows: number } {
  const cell = Math.max(1, Math.ceil(box.width / 12));
  return { cell, columns: Math.ceil(box.width / cell), rows: Math.ceil(box.height / cell) };
}

/** Overwrite the capture in place; the only scratch pixels are already downsampled. */
export function pixelateFaces(canvas: HTMLCanvasElement, boxes: readonly FaceBox[]): void {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser couldn’t blur the photo.');
  const tile = document.createElement('canvas');
  try {
    for (const raw of boxes) {
      const box = expandFaceBox(raw, canvas.width, canvas.height);
      if (!box) continue;
      const { columns, rows } = mosaicLayout(box);
      tile.width = columns; tile.height = rows;
      const small = tile.getContext('2d');
      if (!small) throw new Error('This browser couldn’t blur the photo.');
      small.imageSmoothingEnabled = true;
      small.imageSmoothingQuality = 'high';
      small.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, columns, rows);
      context.save();
      context.imageSmoothingEnabled = false;
      context.drawImage(tile, 0, 0, columns, rows, box.x, box.y, box.width, box.height);
      context.restore();
    }
  } finally { tile.width = tile.height = 0; }
}

export async function loadMediaPipe(settings: Readonly<FaceSettings> = FACE_REDACTION): Promise<SnapDetector> {
  // This chunk, the WASM runtime and the model are all served by our own origin.
  const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const vision = await FilesetResolver.forVisionTasks(`${ASSETS}/wasm`);
  const options = (confidence: number) => ({
    baseOptions: { modelAssetPath: `${ASSETS}/blaze_face_short_range.tflite`, delegate: 'CPU' },
    runningMode: 'IMAGE', minDetectionConfidence: confidence,
  } as const);
  const detector = await FaceDetector.createFromOptions(vision, options(settings.confidence));
  let retryDetector: typeof detector | undefined;
  try {
    // Thresholds affect NMS geometry, so a lower-threshold score filter is not
    // equivalent to a separately configured detector. Default retry is off.
    if (settings.retry && settings.retryConfidence !== settings.confidence) retryDetector = await FaceDetector.createFromOptions(vision, options(settings.retryConfidence));
  } catch (error) { detector.close(); throw error; }
  const detect = (instance: typeof detector, image: HTMLCanvasElement): FaceBox[] => instance.detect(image).detections.flatMap(({ boundingBox: box, categories }) => box ? [{ x: box.originX, y: box.originY, width: box.width, height: box.height, confidence: categories[0]?.score ?? 0 }] : []);
  return {
    detect: image => detect(detector, image),
    ...(retryDetector ? { detectRetry: (image: HTMLCanvasElement) => detect(retryDetector!, image) } : {}),
    close: () => { try { detector.close(); } finally { retryDetector?.close(); } },
  };
}

function browserShapeDetector(): ShapeDetector | null {
  const NativeDetector = (globalThis as typeof globalThis & {
    FaceDetector?: new (options: { fastMode: boolean; maxDetectedFaces: number }) => ShapeDetector;
  }).FaceDetector;
  return NativeDetector ? new NativeDetector({ fastMode: false, maxDetectedFaces: 32 }) : null;
}

function waitFor<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => resolve(null), ms);
    promise.then((result) => { clearTimeout(timeout); resolve(result); }, (error: unknown) => { clearTimeout(timeout); reject(error); });
  });
}

/** The retry shrinks AND pads the image: resizing alone is undone by model preprocessing. */
export function retryFaceBoxes(canvas: HTMLCanvasElement, detector: SnapDetector): FaceBox[] {
  const retry = document.createElement('canvas'); retry.width = retry.height = 360;
  try {
    const context = retry.getContext('2d');
    if (!context) throw new Error('This browser couldn’t blur the photo.');
    context.fillStyle = '#000'; context.fillRect(0, 0, 360, 360);
    context.drawImage(canvas, 90, 90, 180, 180);
    return (detector.detectRetry ? detector.detectRetry(retry) : detector.detect(retry)).map((box) => ({
      x: (box.x - 90) * canvas.width / 180, y: (box.y - 90) * canvas.height / 180,
      width: box.width * canvas.width / 180, height: box.height * canvas.height / 180,
      ...(box.confidence === undefined ? {} : { confidence: box.confidence }),
    }));
  } finally { retry.width = retry.height = 0; }
}

/** One warm detector per phone for the whole game; no images or face positions retained. */
export class FaceRedactor {
  private detector: SnapDetector | null = null;
  private loading: Promise<SnapDetector | null> | null = null;
  constructor(private readonly load: (() => Promise<SnapDetector>) | undefined = undefined, private readonly shape = browserShapeDetector, private readonly settings: Readonly<FaceSettings> = FACE_REDACTION) {}

  warm(): Promise<SnapDetector | null> {
    return this.loading ??= Promise.resolve().then(() => this.load ? this.load() : loadMediaPipe(this.settings)).then((detector) => this.detector = detector).catch(() => null);
  }

  async redact(canvas: HTMLCanvasElement): Promise<Redaction> {
    const detector = this.detector ?? await waitFor(this.warm(), DETECTOR_WAIT_MS);
    if (detector) {
      try {
        let boxes = selectFaceBoxes(detector.detect(canvas), canvas.width, canvas.height, this.settings.confidence, this.settings);
        if (!boxes.length && this.settings.retry) boxes = selectFaceBoxes(retryFaceBoxes(canvas, detector), canvas.width, canvas.height, this.settings.retryConfidence, this.settings);
        pixelateFaces(canvas, boxes);
        return 'mediapipe';
      } catch {
        try { detector.close?.(); } catch { /* A broken runtime may already be closed. */ }
        this.detector = null; this.loading = Promise.resolve(null);
      }
    }
    try {
      const fallback = this.shape();
      if (fallback) {
        const faces = await waitFor(fallback.detect(canvas), DETECTOR_WAIT_MS);
        if (faces) { pixelateFaces(canvas, selectFaceBoxes(faces.map((face) => face.boundingBox), canvas.width, canvas.height, 0, this.settings)); return 'shape'; }
      }
    } catch { /* Unsupported runtimes follow the brief's explicitly metered fallback. */ }
    return 'none';
  }
}

export const faceRedactor = new FaceRedactor();
