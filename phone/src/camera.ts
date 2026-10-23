import { JUDGE_SIZE, TIMING, judgePhoto } from '@snag/shared';
import type { PhotoJudgment } from '@snag/shared';
import { centerCrop } from './logic';
import { faceRedactor, type Redaction } from './faceBlur';

export interface SnagPhoto extends PhotoJudgment { bytes: Uint8Array; redaction: Redaction }
export type SnagImage = SnagPhoto;

/** A 96×64 JPEG alone can retain close-up features; send only 12×8 mosaic samples. */
export function drawPrivateThumbnail(source: CanvasImageSource, width: number, height: number, canvas: HTMLCanvasElement, tiny: HTMLCanvasElement): void {
  tiny.width = 12; tiny.height = 8;
  const small = tiny.getContext('2d'), context = canvas.getContext('2d');
  if (!small || !context) throw new Error('This browser couldn’t open the preview.');
  const crop = centerCrop(width, height, TIMING.THUMB_W / TIMING.THUMB_H);
  small.imageSmoothingEnabled = true; small.imageSmoothingQuality = 'high';
  small.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, tiny.width, tiny.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(tiny, 0, 0, canvas.width, canvas.height);
}

export function jpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('That photo couldn’t be opened. Try another one.')), 'image/jpeg', quality));
}

/** Real encoders vary by scene. Cap noisy thumbnails instead of padding simple scenes. */
export async function encodeThumbnail(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  let blob = await jpeg(canvas, 0.35);
  for (const quality of [0.24, 0.15, 0.08]) {
    if (blob.size <= 4096) break;
    blob = await jpeg(canvas, quality);
  }
  if (blob.size > 4096) throw new Error('Thumbnail exceeded its size budget.');
  return new Uint8Array(await blob.arrayBuffer());
}

export function cropCanvas(source: CanvasImageSource, width: number, height: number, size = TIMING.SNAG_PX): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser couldn’t open the photo canvas.');
  const crop = centerCrop(width, height);
  context.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, size, size);
  return canvas;
}

async function finishSnag(square: HTMLCanvasElement, target: string | null): Promise<SnagImage> {
  const judge = document.createElement('canvas'); judge.width = judge.height = JUDGE_SIZE;
  try {
    const redaction = await faceRedactor.redact(square);
    // judgePhoto derives both score and mask from the redacted pixels in one pass.
    const context = judge.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('This browser couldn’t open the Pixel Judge.');
    context.drawImage(square, 0, 0, JUDGE_SIZE, JUDGE_SIZE);
    const pixels = context.getImageData(0, 0, JUDGE_SIZE, JUDGE_SIZE).data;
    const result = judgePhoto(pixels, JUDGE_SIZE, target); pixels.fill(0);
    const blob = await jpeg(square, TIMING.SNAG_JPEG_Q);
    return { bytes: new Uint8Array(await blob.arrayBuffer()), ...result, redaction };
  } finally { square.width = square.height = judge.width = judge.height = 0; }
}

export async function snagImage(source: CanvasImageSource, width: number, height: number, target: string | null): Promise<SnagImage> {
  return finishSnag(cropCanvas(source, width, height), target);
}

export async function snagFile(file: File, target: string | null): Promise<SnagImage> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo, superstar.');
  const url = URL.createObjectURL(file), image = new Image();
  let square: HTMLCanvasElement;
  try {
    image.src = url; await image.decode();
    square = cropCanvas(image, image.naturalWidth, image.naturalHeight);
  } finally { image.src = ''; URL.revokeObjectURL(url); }
  return finishSnag(square, target);
}

export class CameraFeed {
  private stream: MediaStream | null = null;
  private interval: ReturnType<typeof setInterval> | undefined;
  private generation = 0;
  private starting = false;
  private encoding = false;
  private hunting = false;
  readonly thumb = document.createElement('canvas');
  private readonly tinyThumb = document.createElement('canvas');

  constructor(private readonly video: HTMLVideoElement, private readonly events: {
    thumb(bytes: Uint8Array): void;
    state(ready: boolean, fallback: boolean): void;
    hunting(): boolean;
  }) { this.thumb.width = TIMING.THUMB_W; this.thumb.height = TIMING.THUMB_H; }

  get ready(): boolean { return this.video.readyState >= 2 && this.video.videoWidth > 0 && !!this.stream; }
  async start(): Promise<void> {
    if (this.stream || this.starting) return;
    if (!navigator.mediaDevices?.getUserMedia) { this.events.state(false, true); return; }
    const generation = ++this.generation;
    this.starting = true; this.hunting = true; this.events.state(false, false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (generation !== this.generation || !this.events.hunting()) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream; this.video.srcObject = stream; this.video.muted = true; this.video.playsInline = true;
      await this.video.play();
      if (generation !== this.generation) return;
      this.events.state(true, false);
      this.interval = setInterval(() => void this.thumbnail(generation), 1000 / TIMING.THUMB_FPS);
      void this.thumbnail(generation);
    } catch {
      if (generation === this.generation) { this.stop(); this.events.state(false, true); }
    } finally { if (generation === this.generation) this.starting = false; }
  }

  private async thumbnail(generation: number): Promise<void> {
    if (this.encoding || !this.hunting || !this.ready || !this.events.hunting()) return;
    this.encoding = true;
    try {
      drawPrivateThumbnail(this.video, this.video.videoWidth, this.video.videoHeight, this.thumb, this.tinyThumb);
      const bytes = await encodeThumbnail(this.thumb);
      if (generation === this.generation && this.hunting && this.events.hunting()) this.events.thumb(bytes);
    } catch { /* A live preview may drop a frame. The shutter still works. */ }
    finally { this.encoding = false; }
  }

  async capture(target: string | null): Promise<SnagImage> {
    if (!this.ready) throw new Error('The camera is warming up. Give it a moment.');
    this.hunting = false; clearInterval(this.interval);
    const result = snagImage(this.video, this.video.videoWidth, this.video.videoHeight, target);
    this.stop(); return result;
  }
  stop(): void {
    this.generation++; this.hunting = false; this.starting = false;
    clearInterval(this.interval); this.interval = undefined;
    this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null;
    this.video.pause(); this.video.srcObject = null;
    this.thumb.getContext('2d')?.clearRect(0, 0, this.thumb.width, this.thumb.height);
    this.tinyThumb.width = this.tinyThumb.height = 0;
  }
}
