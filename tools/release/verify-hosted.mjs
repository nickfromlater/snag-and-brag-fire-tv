// Billable live smoke: one synthetic Bedrock read and one short Polly line.
// Run: node tools/release/verify-hosted.mjs https://<cloudfront-domain>
// Images, audio, room keys and provider responses stay in memory. No playback.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../relay/package.json', import.meta.url));
const WebSocket = require('ws');
const sharp = require('sharp');
let step = 'configuration';

async function connect(url) {
  const socket = new WebSocket(url, { handshakeTimeout: 10000 });
  const queue = [], pending = [];
  socket.on('message', (bytes, binary) => {
    if (binary) return;
    let message;
    try { message = JSON.parse(bytes.toString()); } catch { return; }
    const index = pending.findIndex(waiter => waiter.match(message));
    if (index < 0) queue.push(message);
    else { const waiter = pending.splice(index, 1)[0]; clearTimeout(waiter.timer); waiter.resolve(message); }
  });
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.on('error', () => reject(new Error('WSS connection failed')));
  });
  return {
    socket,
    send: value => socket.send(JSON.stringify(value)),
    wait: (match, timeout = 10000) => {
      const index = queue.findIndex(match);
      if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { match, resolve, timer: setTimeout(() => {
          pending.splice(pending.indexOf(waiter), 1); reject(new Error('Relay reply timed out'));
        }, timeout) };
        pending.push(waiter);
      });
    },
  };
}

async function main() {
  const origin = new URL(process.argv[2]);
  assert(origin.protocol === 'https:' && origin.pathname === '/' && !origin.username && !origin.password && !origin.search && !origin.hash, 'Provide an HTTPS origin');
  const report = { at: new Date().toISOString(), origin: origin.origin, syntheticMediaOnly: true };
  const read = async path => fetch(new URL(path, origin), { signal: AbortSignal.timeout(15000) });
  step = 'HTTPS health';
  const health = await read('/healthz');
  assert(health.ok && health.headers.get('cache-control') === 'no-store', 'Uncached healthy origin required');
  const state = await health.json();
  assert(state.ok && state.aiMode === 'bedrock' && state.pollyMode === 'aws', 'Live service modes required');
  report.health = { status: health.status, ...state };
  step = 'HTTPS phone';
  const phonePage = await read('/');
  const html = await phonePage.text();
  assert(phonePage.ok && html.includes('Snag') && html.includes('type="module"'), 'Built phone page required');
  report.phone = { status: phonePage.status, cacheControl: phonePage.headers.get('cache-control') };
  const ws = new URL('/ws', origin); ws.protocol = 'wss:';
  let tv, phone, jpeg, frame, wav, mp4;
  try {
    step = 'WSS TV and phone pairing';
    tv = await connect(ws);
    tv.send({ t: 'hello', proto: 1, role: 'tv' });
    const welcome = await tv.wait(m => m.t === 'welcome' && m.role === 'tv');
    assert(welcome.joinUrl.startsWith(origin.origin + '/?r='), 'Hosted join URL required');
    phone = await connect(ws);
    phone.send({ t: 'hello', proto: 1, role: 'phone', code: welcome.code, cid: randomBytes(16).toString('hex') });
    await phone.wait(m => m.t === 'welcome' && m.role === 'phone');
    const pingAt = Date.now(); tv.send({ t: 'ping', c: pingAt });
    await tv.wait(m => m.t === 'pong' && m.c === pingAt);
    report.wss = { paired: true, pingMs: Date.now() - pingAt };
    step = 'live Polly and visemes';
    const ttsAt = Date.now();
    tv.send({ t: 'tts', id: 'live-smoke', text: 'A splendid red square. I shall alert the museum.' });
    const voice = await tv.wait(m => m.t === 'tts' && m.id === 'live-smoke');
    assert(voice.ok && voice.marks.some(m => m.type === 'viseme') && voice.marks.some(m => m.type === 'word'), 'Live audio and marks required');
    const clip = `/tts/${welcome.code}/live-smoke?k=${welcome.roomKey}`;
    const webAudio = await read(clip);
    assert(webAudio.ok && webAudio.headers.get('cache-control') === 'no-store' && webAudio.headers.get('content-type') === 'audio/wav', 'Private WAV required');
    wav = Buffer.from(await webAudio.arrayBuffer());
    assert(wav.subarray(0, 4).toString() === 'RIFF' && wav.length > 44, 'WAV payload required');
    const nativeAudio = await read(clip + '&format=mp4');
    assert(nativeAudio.ok && nativeAudio.headers.get('content-type') === 'audio/mp4' && nativeAudio.headers.get('cache-control') === 'no-store', 'Private native audio required');
    mp4 = Buffer.from(await nativeAudio.arrayBuffer());
    assert(mp4.includes(Buffer.from('ftyp')) && mp4.includes(Buffer.from('moof')), 'Fragmented native MP4 required');
    const range = await fetch(new URL(clip + '&format=mp4', origin), { headers: { Range: 'bytes=0-15' }, signal: AbortSignal.timeout(15000) });
    assert(range.status === 206 && (await range.arrayBuffer()).byteLength === 16, 'Native byte ranges required');
    report.polly = { ok: true, latencyMs: Date.now() - ttsAt, durationMs: voice.durationMs, marks: voice.marks.length, wavBytes: wav.length, nativeBytes: mp4.length, rangeStatus: range.status };
    step = 'synthetic photo and bounded Bedrock fallback';
    jpeg = await sharp({ create: { width: 720, height: 720, channels: 3, background: '#F23B2E' } }).jpeg().toBuffer();
    const header = Buffer.from(JSON.stringify({ t: 'snag', round: 0, hex: '#F23B2E', match: 99, prompt: 'Snag the most RED thing in the house', roundKind: 'color' }));
    frame = Buffer.alloc(4 + header.length + jpeg.length); frame.writeUInt32BE(header.length); header.copy(frame, 4); jpeg.copy(frame, 4 + header.length);
    const aiAt = Date.now(); phone.socket.send(frame);
    const snag = await tv.wait(m => m.t === 'from' && m.m.t === 'snag');
    const ai = await tv.wait(m => m.t === 'ai' && m.photoId === snag.m.photoId, 5000);
    const aiMs = Date.now() - aiAt;
    // Includes CloudFront/network time; the server enforces its own 4000 ms budget.
    assert(aiMs < 4500 && typeof ai.r.fallback === 'boolean', 'AI must return within its network-adjusted deadline');
    report.ai = { latencyMs: aiMs, fallback: ai.r.fallback };
    const photoPath = `/p/${welcome.code}/${snag.m.photoId}?k=${welcome.roomKey}`;
    const photo = await read(photoPath);
    assert(photo.ok && photo.headers.get('cache-control') === 'no-store', 'Private photo relay required');
    const photoBytes = Buffer.from(await photo.arrayBuffer());
    assert(photoBytes.equals(jpeg), 'In-memory photo must round trip exactly'); photoBytes.fill(0);
    step = 'room cleanup';
    tv.send({ t: 'close' });
    for (let n = 0; n < 20; n++) {
      const response = await read(photoPath);
      if (response.status === 404) break;
      await response.body?.cancel();
      assert(n < 19, 'Photo must disappear after room close');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert((await read(clip)).status === 404, 'Voice must disappear after room close');
    report.cleanup = { photoStatus: 404, voiceStatus: 404 };
    report.outcome = 'PASS';
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (tv?.socket.readyState === WebSocket.OPEN) tv.send({ t: 'close' });
    tv?.socket.close(); phone?.socket.close();
    for (const bytes of [jpeg, frame, wav, mp4]) bytes?.fill(0);
  }
}
await main().catch(() => { console.error(`FAIL hosted smoke at ${step}; provider bodies, URLs with keys and media suppressed.`); process.exitCode = 1; });
