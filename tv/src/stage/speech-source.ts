import { MediaSource } from './platform';
import type { AudioPlayer, SourceBuffer } from './platform';
import { monitorWork, traceNativeCalls } from './work-monitor';
let serial = 0;

/** Fetch the authenticated fragmented AAC variant into bounded memory. */
export function attachSpeechSource(player: AudioPlayer, uri: string, ready: () => void, failed: () => void, prefetched?: ArrayBuffer): (resetPlayer?: boolean) => void {
  const target = 'speech-' + ++serial;
  const source = traceNativeCalls(monitorWork('speech-source-create', () => new MediaSource(), target), target, ['addSourceBuffer', 'endOfStream', 'removeSourceBuffer']), request = new AbortController();
  const blob = monitorWork('speech-url-create', () => URL.createObjectURL(source as unknown as Blob), target);
  let disposed = false, opened = false, appended = false, bytes = prefetched?.slice(0), buffer: SourceBuffer | undefined;
  const fail = () => { if (!disposed) failed(); };
  const append = () => {
    if (disposed || !opened || !bytes || appended) return;
    appended = true;
    try {
      buffer = traceNativeCalls(source.addSourceBuffer('audio/mp4; codecs="mp4a.40.2"'), target, ['appendBuffer', 'abort']);
      buffer.addEventListener('error', fail);
      buffer.addEventListener('updateend', () => {
        if (disposed) return;
        // Keep bytes alive until playback stops: updateend acknowledges append,
        // while the native decoder can still be consuming the shared buffer.
        try { source.endOfStream(); ready(); } catch { fail(); }
      });
      buffer.appendBuffer(bytes);
    } catch { fail(); }
  };
  source.addEventListener('sourceopen', () => { opened = true; append(); });
  // The SDK's blob-URL setter attaches srcObject and releases its global source
  // registry entry. Direct srcObject assignment leaves that entry retained.
  player.src = blob;
  if (!bytes) void fetch(uri + (uri.includes('?') ? '&' : '?') + 'format=mp4', { signal: request.signal, cache: 'no-store' }).then(async response => {
    if (!response.ok) throw new Error('Voice HTTP failed');
    const data = await response.arrayBuffer();
    if (disposed) { new Uint8Array(data).fill(0); return; }
    if (!data.byteLength || data.byteLength > 1024 * 1024) { new Uint8Array(data).fill(0); throw new Error('Voice clip bound'); }
    bytes = data; append();
  }).catch(fail);
  return (resetPlayer = true) => {
    if (disposed) return; disposed = true; request.abort();
    if (bytes) new Uint8Array(bytes).fill(0); bytes = undefined;
    if (resetPlayer) {
      try { if (buffer && source.readyState === 'open') { if (buffer.updating) buffer.abort(); source.removeSourceBuffer(buffer); } } catch { /* Native may already have detached at EOS. */ }
      player.pause(); player.load();
    }
    URL.revokeObjectURL(blob);
  };
}
