import { MediaSource } from './platform';
import type { AudioPlayer, SourceBuffer } from './platform';
import { monitorWork, traceNativeCalls } from './work-monitor';

export interface SpeechRange { start: number; end: number }
const MIME = 'audio/mp4; codecs="mp4a.40.2"';
/** Spacing between lines on the shared timeline, so a late pause never plays into the next line. */
const LINE_GAP_SECONDS = 1;
/** Played lines older than this are evicted from the buffer (bounded memory). */
const KEEP_SECONDS = 30;

/**
 * One MediaSource and SourceBuffer for the whole session. Attaching a MediaSource (blob src)
 * and adding a SourceBuffer block the JS thread for 130-700 ms on the stick, so that happens
 * once; each Polly line (a complete fragmented AAC file) is appended at the end of a shared
 * timeline with timestampOffset, and plays by seeking to its range. Appends are queued.
 */
export class SpeechStream {
  private readonly source: MediaSource;
  private buffer?: SourceBuffer;
  private readonly blob: string;
  private queue: Promise<unknown>;
  private end = 0;
  private disposed = false;
  failures = 0;
  constructor(readonly player: AudioPlayer) {
    const target = 'speech-stream';
    this.source = traceNativeCalls(monitorWork('speech-source-create', () => new MediaSource(), target), target, ['addSourceBuffer', 'removeSourceBuffer']);
    this.blob = monitorWork('speech-url-create', () => URL.createObjectURL(this.source as unknown as Blob), target);
    const opened = new Promise<void>((resolve, reject) => {
      this.source.addEventListener('sourceopen', () => {
        try {
          this.buffer = traceNativeCalls(this.source.addSourceBuffer(MIME), target, ['appendBuffer', 'remove', 'abort']);
          resolve();
        } catch (error) { reject(error); }
      });
    });
    // The SDK's blob-URL setter attaches srcObject (see speech-source.ts).
    player.src = this.blob;
    this.queue = opened;
  }
  private updated(): Promise<void> {
    const buffer = this.buffer!;
    return new Promise((resolve, reject) => {
      const done = () => { buffer.removeEventListener('updateend', done); buffer.removeEventListener('error', fail); resolve(); };
      const fail = () => { buffer.removeEventListener('updateend', done); buffer.removeEventListener('error', fail); reject(new Error('speech append failed')); };
      buffer.addEventListener('updateend', done); buffer.addEventListener('error', fail);
    });
  }
  /** Append one line; resolves with its range on the shared timeline. */
  append(bytes: ArrayBuffer, durationMs: number, playingFrom = 0): Promise<SpeechRange> {
    const copy = bytes.slice(0);
    const task = this.queue.then(async () => {
      if (this.disposed) throw new Error('speech stream disposed');
      const buffer = this.buffer!;
      const evictBefore = Math.min(playingFrom, this.end) - KEEP_SECONDS;
      if (evictBefore > 0 && buffer.buffered.length && buffer.buffered.start(0) < evictBefore) {
        buffer.remove(0, evictBefore); await this.updated();
      }
      const start = this.end + (this.end ? LINE_GAP_SECONDS : 0);
      buffer.timestampOffset = start;
      const appended = this.updated();
      buffer.appendBuffer(copy); await appended;
      new Uint8Array(copy).fill(0);
      const ranges = buffer.buffered, measured = ranges.length ? ranges.end(ranges.length - 1) : 0;
      const end = measured > start ? measured : start + durationMs / 1000;
      this.end = end;
      return { start, end };
    });
    this.queue = task.catch(() => { this.failures++; });
    return task;
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    try { this.player.pause(); } catch { /* already released */ }
    URL.revokeObjectURL(this.blob);
  }
}
