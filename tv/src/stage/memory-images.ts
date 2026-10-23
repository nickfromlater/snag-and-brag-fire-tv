import { imageBytes, maskedPhotoPng } from './photo-raster';
import { monitorWork } from './work-monitor';
export const isPng = (bytes: Uint8Array): boolean => bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
/** Four decode slots, latest pending frame only. No filesystem API, disk cache or logger. */
export function base64(bytes: Uint8Array): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', chunks: string[] = [];
  // Joining bounded chunks avoids repeatedly copying a growing multi-megabyte
  // string on the stick's Hermes runtime. Chunk sizes stay divisible by three.
  for (let start = 0; start < bytes.length; start += 12288) {
    const end = Math.min(bytes.length, start + 12288), parts: string[] = [];
    for (let i = start; i < end; i += 3) {
      const a = bytes[i]!, b = bytes[i + 1], c = bytes[i + 2], n = a << 16 | (b ?? 0) << 8 | (c ?? 0);
      parts.push(abc[n >>> 18 & 63]! + abc[n >>> 12 & 63]! + (b === undefined ? '=' : abc[n >>> 6 & 63]!) + (c === undefined ? '=' : abc[n & 63]!));
    }
    chunks.push(parts.join(''));
  }
  return chunks.join('');
}
export interface ImageSlot { current?: Uint8Array; pending?: Uint8Array; decoding: boolean; generation: number }
export class FeedSlots {
  readonly slots: ImageSlot[] = Array.from({ length: 4 }, () => ({ decoding: false, generation: 0 }));
  received = 0; drawn = 0; dropped = 0;
  submit(index: number, bytes: Uint8Array): Uint8Array | undefined {
    const slot = this.slots[index]; if (!slot || bytes.length > (isPng(bytes) ? 128 * 1024 : 32768)) return;
    this.received++;
    if (slot.decoding) { if (slot.pending) this.dropped++; slot.pending = bytes; return; }
    slot.decoding = true; slot.current = bytes; slot.generation++; return bytes;
  }
  loaded(index: number): Uint8Array | undefined {
    const slot = this.slots[index]; if (!slot) return;
    slot.decoding = false; this.drawn++; const pending = slot.pending; slot.pending = undefined;
    return pending ? this.submit(index, pending) : undefined;
  }
  clear(index?: number): void { for (const slot of index === undefined ? this.slots : [this.slots[index]!]) { slot.current = slot.pending = undefined; slot.decoding = false; } }
  get bytes(): number { return this.slots.reduce((n, s) => n + (s.current?.length ?? 0) + (s.pending?.length ?? 0), 0); }
}
export const feedSlots = new FeedSlots();
export class MemoryPhotos {
  private readonly images = new Map<string, Promise<string>>();
  private readonly masked = new Map<string, Promise<string>>();
  private readonly ready = new Map<string, string>();
  private readonly maskedReady = new Map<string, string>();
  private generation = 0;
  peek(url: string, masked = false): string | undefined { return (masked ? this.maskedReady : this.ready).get(url); }
  load(url: string): Promise<string> {
    if(url.startsWith('data:image/'))return Promise.resolve(url);
    const old = this.images.get(url); if (old) return old;
    // The cache mode preserves memory-only loading without a custom header that
    // would require an OPTIONS preflight on the web iteration target.
    const generation = this.generation;
    const promise = fetch(url, { cache: 'no-store' }).then(async response => { if (!response.ok) throw new Error('Memory photo unavailable'); const uri = 'data:image/jpeg;base64,' + base64(new Uint8Array(await response.arrayBuffer())); if (generation === this.generation) this.ready.set(url, uri); return uri; });
    this.images.set(url, promise);
    return promise;
  }
  loadMasked(url: string): Promise<string> {
    const old = this.masked.get(url); if (old) return old;
    const generation = this.generation;
    const promise = (url.startsWith('data:image/')
      // Only the explicitly synthetic director fixture uses the JS compositor.
      ? this.load(url).then(uri => base64(monitorWork('photo-mask', () => maskedPhotoPng(imageBytes(uri.slice(uri.indexOf(',') + 1))))))
      : fetch(url + (url.includes('?') ? '&' : '?') + 'format=sticker&encoding=base64', { cache: 'no-store' }).then(async response => {
        if (!response.ok) throw new Error('Memory sticker unavailable');
        const encoded = await response.text();
        if (!encoded.startsWith('iVBORw0KGgo') || encoded.length > Math.ceil(1024 * 1024 / 3) * 4 || encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Invalid memory sticker');
        return encoded;
      })).then(encoded => {
        const value = 'data:image/png;base64,' + encoded;
        if (generation === this.generation) this.maskedReady.set(url, value);
        return value;
      });
    this.masked.set(url, promise); return promise;
  }
  clear(): void { this.generation++; this.images.clear(); this.masked.clear(); this.ready.clear(); this.maskedReady.clear(); }
}
export const memoryPhotos = new MemoryPhotos();
