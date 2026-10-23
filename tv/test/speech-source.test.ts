import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPlayer } from '../src/stage/platform';

const native = vi.hoisted(() => {
class Events {
  readonly listeners = new Map<string, (() => void)[]>();
  addEventListener(k: string, fn: () => void) { this.listeners.set(k, [...(this.listeners.get(k) ?? []), fn]); }
  emit(k: string) { this.listeners.get(k)?.forEach(fn => fn()); }
}
class FakeSource extends Events {
  readyState = 'closed'; updating = false; appended?: Uint8Array; ended = false;
  abort = vi.fn(); removed = false;
  addSourceBuffer = vi.fn((_type: string) => this);
  appendBuffer(bytes: ArrayBuffer) { this.appended = new Uint8Array(bytes).slice(); }
  removeSourceBuffer() { this.removed = true; }
  endOfStream() { this.ended = true; this.readyState = 'ended'; }
}
return { source: undefined as FakeSource | undefined, FakeSource };
});
vi.mock('../src/stage/platform', () => ({ MediaSource: class extends native.FakeSource { constructor() { super(); native.source = this; } } }));
import { attachSpeechSource } from '../src/stage/speech-source';
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
beforeEach(() => vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:///synthetic?offset=0&size=0'), revokeObjectURL: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
function player() { return { pause: vi.fn(), load: vi.fn(), srcObject: undefined } as unknown as AudioPlayer; }
describe('native speech buffering', () => {
  it('fetches authenticated MP3 into memory, waits for sourceopen/updateend, and retains bytes until detach', async () => {
    const data = Uint8Array.from([1,2,3,4]).buffer, get = vi.fn(async (_uri: string, _options: RequestInit) => ({ ok: true, arrayBuffer: async () => data }));
    vi.stubGlobal('fetch', get); const api = player(), ready = vi.fn(), fail = vi.fn(), detach = attachSpeechSource(api, 'http://synthetic/tts?k=memory-key', ready, fail);
    await flush(); expect(native.source!.appended).toBeUndefined();
    native.source!.readyState = 'open'; native.source!.emit('sourceopen');
    expect(native.source!.addSourceBuffer).toHaveBeenCalledWith('audio/mp4; codecs="mp4a.40.2"');
    expect(native.source!.appended).toEqual(Uint8Array.from([1,2,3,4])); expect(ready).not.toHaveBeenCalled();
    native.source!.emit('updateend'); expect(ready).toHaveBeenCalledTimes(1); expect(native.source!.ended).toBe(true);
    expect(new Uint8Array(data)).toEqual(Uint8Array.from([1,2,3,4])); expect(fail).not.toHaveBeenCalled();
    detach(); detach(); expect(new Uint8Array(data)).toEqual(new Uint8Array(4)); expect(api.load).toHaveBeenCalledTimes(1); expect(get.mock.calls[0]![1]).toMatchObject({ cache: 'no-store' });
  });
  it('bounds clip memory and returns a failure without native append on HTTP/oversize failure', async () => {
    const data = new Uint8Array(1024 * 1024 + 1).fill(7).buffer;
    vi.stubGlobal('fetch', async () => ({ ok: true, arrayBuffer: async () => data }));
    const ready = vi.fn(), fail = vi.fn(), detach = attachSpeechSource(player(), 'http://synthetic/tts', ready, fail);
    native.source!.readyState = 'open'; native.source!.emit('sourceopen'); await flush();
    expect(fail).toHaveBeenCalledTimes(1); expect(ready).not.toHaveBeenCalled(); expect(native.source!.appended).toBeUndefined();
    expect(new Uint8Array(data).some(v => v !== 0)).toBe(false); detach();
  });
  it('aborts disposal and zeroes a late response without playing or reporting an error', async () => {
    let respond!: (response: unknown) => void;
    vi.stubGlobal('fetch', () => new Promise(resolve => { respond = resolve; }));
    const data = Uint8Array.from([9,8,7]).buffer, ready = vi.fn(), fail = vi.fn(), detach = attachSpeechSource(player(), 'http://synthetic/tts', ready, fail);
    detach(); respond({ ok: true, arrayBuffer: async () => data }); await flush();
    expect(new Uint8Array(data)).toEqual(new Uint8Array(3)); expect(ready).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
  });
  it('uses a private playback copy of prefetched bytes and releases the SDK blob URL', () => {
    const data = Uint8Array.from([1,2,3]).buffer, fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const api = player(), detach = attachSpeechSource(api, 'http://synthetic/tts?k=memory', () => {}, () => {}, data);
    expect(api.src).toBe('blob:///synthetic?offset=0&size=0');
    native.source!.readyState = 'open'; native.source!.emit('sourceopen');
    expect(native.source!.appended).toEqual(Uint8Array.from([1,2,3])); expect(fetch).not.toHaveBeenCalled();
    detach(); expect(new Uint8Array(data)).toEqual(Uint8Array.from([1,2,3])); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
