import { afterEach, expect, it, vi } from 'vitest';
import type { RelayCallbacks } from '../src/runtime/relay';

const transport = vi.hoisted(() => ({ callbacks: undefined as RelayCallbacks | undefined }));
const images = vi.hoisted(() => ({ clear: vi.fn(), loadMasked: vi.fn(async () => 'data:image/png;base64,synthetic') }));
vi.mock('../src/config', () => ({ config: { debug: false, showcase: false, offline: false, relayUrl: 'wss://example.test/ws' } }));
vi.mock('../src/stage', () => ({ batchStage: (fn: () => void) => fn(), acceptThumbnail() {} }));
vi.mock('../src/stage/memory-images', () => ({ memoryPhotos: images, feedSlots: { clear() {} } }));
vi.mock('../src/runtime/relay', () => ({ RelayClient: class {
  constructor(_url: string, callbacks: RelayCallbacks) { transport.callbacks = callbacks; }
  connect() {} send() { return true; } close() {}
  photoUrl(id: string) { return 'https://example.test/p/BCDF/' + id; }
} }));
import { TvSession } from '../src/runtime/session';

let session: TvSession | undefined;
afterEach(() => { session?.dispose(); session = undefined; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function welcome() {
  transport.callbacks!.message({ t: 'welcome', role: 'tv', code: 'BCDF', tvKey: 'a'.repeat(32), roomKey: 'b'.repeat(32), joinUrl: 'https://example.test/?r=BCDF', serverNow: Date.now() });
}
function start() { session = new TvSession(); session.start(); welcome(); return session; }

it('resumes its own disconnect pause after more than one failed connection', () => {
  const tv = start();
  expect(tv.getView().paused).toBe(false);
  transport.callbacks!.disconnected(1006);
  transport.callbacks!.disconnected(1006);
  expect(tv.getView().paused).toBe(true);
  welcome();
  expect(tv.getView().paused).toBe(false);
  expect(tv.getView().menu).toBeNull();
});

it('preserves a deliberate pause through relay reconnection', () => {
  const tv = start(); tv.game!.pause();
  transport.callbacks!.disconnected(1006); welcome();
  expect(tv.getView().paused).toBe(true);
});

it('prefetches a native find before its reveal and clears previous photos for a rematch', () => {
  vi.stubGlobal('HermesInternal', {});
  const tv = start();
  transport.callbacks!.message({ t: 'from', cid: 'c'.repeat(32), at: Date.now(), m: { t: 'snag', round: 0, photoId: 'synthetic', hex: '#F23B2E', match: 99 } });
  expect(images.loadMasked).toHaveBeenCalledWith('https://example.test/p/BCDF/synthetic');
  images.clear.mockClear();
  tv.game!.setBots(true); tv.game!.remote('select'); tv.game!.remote('down'); tv.game!.remote('select');
  expect(tv.getView().round).toBe(0);
  expect(images.clear).toHaveBeenCalled();
});

it('pauses in the background and waits for an explicit foreground resume', () => {
  const tv = start(); tv.audioReady = true;
  transport.callbacks!.disconnected(1006);
  tv.foreground(false); welcome();
  expect(tv.getView().paused).toBe(true); expect(tv.audioReady).toBe(false);
  tv.remote('select'); expect(tv.getView().paused).toBe(true);
  tv.foreground(true); expect(tv.getView().paused).toBe(true);
  tv.remote('select'); expect(tv.getView().paused).toBe(false);
});
