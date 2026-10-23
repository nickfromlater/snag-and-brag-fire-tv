import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { createGzip } from 'node:zlib';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { PROTO, decodeBinary, encodeBinary, type ClientToRelay, type RelayToClient, type BinaryHeader } from '@snag/shared';
import { AiReader, bedrockProvider, fallbackRead, mockAiProvider, type AiProvider } from './ai.js';
import { LIMITS, configFromEnv, type RelayConfig } from './config.js';
import { log, type Logger, type LogReason } from './log.js';
import { VoiceReader, mockVoiceProvider, pollyProvider, type VoiceClip, type VoiceProvider } from './polly.js';
import { byteRange } from './range.js';
import { fragmentVoice } from './voice-media.js';
import { RateWindow, binaryHeader, clientMessage, key } from './validate.js';
import { nativePhoto, nativeThumbnail } from './native-images.js';

const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXYZ';
export const ROOM_GRACE_MS = 120000;
export const ROOM_LIFE_MS = 3 * 60 * 60 * 1000;
export const PING_TIMEOUT_MS = 30000;
const EMPTY = Buffer.alloc(0);
const randomKey = () => randomBytes(16).toString('hex');

interface Photo { bytes: Buffer; job: AbortController; native?: Buffer; nativeJob?: Promise<Buffer | undefined>; disposed?: boolean }
interface Room {
  code: string; tvKey: string; roomKey: string; tv: Connection | null;
  phones: Map<string, Connection>; photos: Map<string, Photo>; clips: Map<string, VoiceClip>;
  voiceJobs: Map<string, AbortController>; grace?: NodeJS.Timeout; expiry: NodeJS.Timeout;
  pendingTv: Map<string, RelayToClient[]>;
  pendingPeers: Map<string, boolean>;
  lastFallbackQuip?: string;
  closed: boolean;
}
interface Connection {
  ws: WebSocket; room: Room | null; role?: 'tv' | 'phone'; cid?: string;
  lastPong: number; opened: number; rate: RateWindow; thumbs: RateWindow;
  nativeImages: boolean; thumbBusy?: boolean; pendingThumb?: Buffer;
}
export interface RelayOptions {
  config?: RelayConfig;
  logger?: Logger;
  aiProvider?: AiProvider;
  voiceProvider?: VoiceProvider;
  // Inject short deadlines in tests without manipulating WebSocket timers.
  roomGraceMs?: number;
  roomLifeMs?: number;
  pingTimeoutMs?: number;
  heartbeatMs?: number;
  maxRooms?: number;
  messagesPerSecond?: number;
}

function bytes(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}
function sameKey(a: string | null, b: string): boolean {
  return a !== null && a.length === 32 && key.test(a) && timingSafeEqual(Buffer.from(a.toLowerCase()), Buffer.from(b));
}

/** Room transport + service broker only; screens and game authority stay on the TV. */
export function createRelay(options: RelayOptions = {}) {
  const config = options.config ?? configFromEnv();
  const logger = options.logger ?? log;
  const rooms = new Map<string, Room>();
  const connections = new Set<Connection>();
  const ai = new AiReader(options.aiProvider ?? (config.aiMode === 'mock' ? mockAiProvider(config.aiMockDelayMs) : bedrockProvider(config, logger)), logger);
  const voice = new VoiceReader(options.voiceProvider ?? (config.pollyMode === 'mock' ? mockVoiceProvider(config.pollyMockDelayMs) : pollyProvider(config, logger)), logger);
  const started = Date.now();
  let stopping = false;
  let thumbnailJobs = 0;

  function counts() {
    let phones = 0, photos = 0, photoBytes = 0, clips = 0, ttsBytes = 0, pendingAi = 0, pendingTts = 0;
    for (const room of rooms.values()) {
      phones += room.phones.size; photos += room.photos.size; clips += room.clips.size;
      pendingTts += room.voiceJobs.size;
      for (const photo of room.photos.values()) { photoBytes += photo.bytes.length + (photo.native?.length ?? 0); if (!photo.job.signal.aborted) pendingAi++; }
      for (const clip of room.clips.values()) ttsBytes += clip.audio.length + (clip.nativeAudio?.length ?? 0);
    }
    return { rooms: rooms.size, phones, photos, photoBytes, clips, ttsBytes, pendingAi, pendingTts, sockets: connections.size };
  }

  function error(c: Connection, code: Extract<RelayToClient, { t: 'error' }>['code']) {
    logger('error', code, { rooms: rooms.size, phones: c.room?.phones.size ?? 0 });
    send(c, { t: 'error', code });
  }
  function send(c: Connection | null | undefined, message: RelayToClient) {
    if (!c || c.ws.readyState !== WebSocket.OPEN) return false;
    if (c.ws.bufferedAmount > LIMITS.reliableBackpressureBytes) {
      // Snag JPEGs remain in room memory; a slow TV can reconnect and fetch them.
      c.ws.terminate();
      return false;
    }
    // ASCII-only JSON: the Fire TV stick's WebSocket mangles non-ASCII text frames.
    c.ws.send(JSON.stringify(message).replace(/[\u0080-\uffff]/g, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')), (err) => { if (err) logger('error', 'socket'); });
    return true;
  }
  function photoToTv(room: Room, photoId: string, message: RelayToClient) {
    if (!send(room.tv, message)) {
      const pending = room.pendingTv.get(photoId) ?? [];
      pending.push(message);
      room.pendingTv.set(photoId, pending);
    }
  }
  function peerToTv(room: Room, cid: string, up: boolean) {
    if (send(room.tv, { t: 'peer', cid, up })) room.pendingPeers.delete(cid);
    else room.pendingPeers.set(cid, up);
  }
  function closeSocket(c: Connection, code = 1000) {
    c.pendingThumb?.fill(0); c.pendingThumb = undefined;
    c.room = null;
    c.ws.close(code);
    // Close handshakes must not keep a room's sockets alive indefinitely.
    const timer = setTimeout(() => c.ws.terminate(), 1000);
    timer.unref();
    c.ws.once('close', () => clearTimeout(timer));
  }
  function dropPhoto(photo: Photo) {
    photo.disposed = true; photo.native?.fill(0); photo.native = undefined;
    photo.job.abort();
    photo.bytes.fill(0);
    photo.bytes = EMPTY;
  }
  function queueThumbnail(c: Connection, room: Room, payload: Uint8Array) {
    c.pendingThumb?.fill(0); c.pendingThumb = Buffer.from(payload);
    if (c.thumbBusy) return;
    const flush = async () => {
      if (!c.pendingThumb) return;
      const input = c.pendingThumb; c.pendingThumb = undefined;
      if (thumbnailJobs >= 4 || room.closed || c.room !== room) { input.fill(0); return; }
      c.thumbBusy = true; thumbnailJobs++;
      try {
        const png = await nativeThumbnail(input), tv = room.tv?.ws;
        if (!room.closed && c.room === room && room.tv?.nativeImages && tv?.readyState === WebSocket.OPEN && tv.bufferedAmount <= LIMITS.thumbBackpressureBytes && png.length <= 128 * 1024) {
          const frame = encodeBinary({ t: 'thumb', cid: c.cid! }, png);
          tv.send(frame, { binary: true }, err => { frame.fill(0); if (err) logger('error', 'socket'); });
        }
        png.fill(0);
      } catch { /* A malformed/obsolete preview never delays reliable game messages. */ }
      finally { input.fill(0); c.thumbBusy = false; thumbnailJobs--; if (c.pendingThumb) void flush(); }
    };
    void flush();
  }
  function dropClip(clip: VoiceClip) {
    clip.nativeAbort?.abort(); clip.nativeAudio?.fill(0); clip.nativeAudio = undefined;
    clip.audio.fill(0);
    clip.audio = EMPTY;
    clip.text = undefined;
    clip.marks.length = 0;
  }
  function closeRoom(room: Room, reason: LogReason) {
    if (room.closed) return;
    room.closed = true;
    rooms.delete(room.code);
    clearTimeout(room.grace);
    clearTimeout(room.expiry);
    const photos = room.photos.size, clips = room.clips.size, phones = room.phones.size;
    for (const photo of room.photos.values()) dropPhoto(photo);
    room.photos.clear();
    room.pendingTv.clear();
    room.pendingPeers.clear();
    for (const clip of room.clips.values()) dropClip(clip);
    room.clips.clear();
    for (const job of room.voiceJobs.values()) job.abort();
    room.voiceJobs.clear();
    if (room.tv) closeSocket(room.tv);
    for (const c of room.phones.values()) closeSocket(c);
    room.tv = null;
    room.phones.clear();
    room.tvKey = ''; room.roomKey = '';
    room.lastFallbackQuip = undefined;
    logger('room_close', reason, { rooms: rooms.size, phones, photos, clips });
  }
  function newRoom(): Room {
    let code: string;
    do { code = Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]!).join(''); }
    while (rooms.has(code));
    const room: Room = {
      code, tvKey: randomKey(), roomKey: randomKey(), tv: null,
      phones: new Map(), photos: new Map(), clips: new Map(), voiceJobs: new Map(), pendingTv: new Map(), pendingPeers: new Map(), closed: false,
      expiry: setTimeout(() => closeRoom(room, 'expired'), options.roomLifeMs ?? ROOM_LIFE_MS),
    };
    room.expiry.unref();
    rooms.set(code, room);
    logger('room_open', 'none', { rooms: rooms.size, phones: 0 });
    return room;
  }
  function welcome(c: Connection, room: Room) {
    send(c, { t: 'welcome', role: c.role!, code: room.code, ...(c.role === 'tv' ? { tvKey: room.tvKey } : {}), roomKey: room.roomKey, joinUrl: `${config.publicUrl}/?r=${room.code}`, serverNow: Date.now() });
  }
  function hello(c: Connection, message: Extract<ClientToRelay, { t: 'hello' }>) {
    if (c.room) { error(c, 'BAD_MSG'); return; }
    if (message.proto !== PROTO) { error(c, 'BAD_PROTO'); return; }
    if (message.role === 'tv') {
      let room: Room;
      if (message.resume) {
        const found = rooms.get(message.resume.code);
        if (!found) { error(c, 'NO_ROOM'); return; }
        if (!sameKey(message.resume.tvKey, found.tvKey)) { error(c, 'BAD_KEY'); return; }
        room = found;
        if (room.tv) closeSocket(room.tv, 4001);
        clearTimeout(room.grace); room.grace = undefined;
      } else {
        if (rooms.size >= (options.maxRooms ?? LIMITS.rooms)) { error(c, 'ROOM_FULL'); return; }
        room = newRoom();
      }
      c.room = room; c.role = 'tv'; room.tv = c;
      welcome(c, room);
      // Replay transport presence after resume; the TV still owns all screen state.
      for (const [cid, up] of room.pendingPeers) if (!room.phones.has(cid)) peerToTv(room, cid, up);
      for (const cid of room.phones.keys()) peerToTv(room, cid, true);
      for (const [photoId, messages] of room.pendingTv) {
        while (messages.length && send(c, messages[0]!)) messages.shift();
        if (!messages.length) room.pendingTv.delete(photoId);
      }
      return;
    }
    const room = rooms.get(message.code);
    if (!room) { error(c, 'NO_ROOM'); return; }
    const previous = room.phones.get(message.cid);
    if (!previous && room.phones.size >= LIMITS.phonesPerRoom) { error(c, 'ROOM_FULL'); return; }
    if (previous) closeSocket(previous, 4001);
    if (previous) c.thumbs = previous.thumbs;
    c.room = room; c.role = 'phone'; c.cid = message.cid;
    room.phones.set(message.cid, c);
    welcome(c, room);
    peerToTv(room, message.cid, true);
  }
  function textMessage(c: Connection, message: ClientToRelay, at: number) {
    if (message.t === 'hello') { hello(c, message); return; }
    const room = c.room;
    if (!room || room.closed) { error(c, 'BAD_MSG'); return; }
    if (message.t === 'msg' && c.role === 'phone') {
      if (!room.tv) { error(c, 'NO_ROOM'); return; }
      send(room.tv, { t: 'from', cid: c.cid!, at, m: message.m });
    } else if (message.t === 'to' && c.role === 'tv') {
      const targets = message.to === 'all' ? room.phones.values() : [...new Set(message.to)].flatMap((cid) => room.phones.has(cid) ? [room.phones.get(cid)!] : []);
      for (const phone of targets) send(phone, { t: 'msg', m: message.m });
    } else if (message.t === 'close' && c.role === 'tv') closeRoom(room, 'tv_close');
    else if (message.t === 'tts' && c.role === 'tv') synthesize(room, message.id, message.text, at);
    else error(c, 'BAD_MSG');
  }
  function synthesize(room: Room, id: string, text: string, at: number) {
    // A duplicate id is idempotent. The TV must use a new id for a new line.
    const existing = room.clips.get(id);
    if (existing) { room.clips.delete(id); room.clips.set(id, existing); send(room.tv, { t: 'tts', id, ok: true, marks: existing.marks, durationMs: existing.durationMs }); return; }
    if (room.voiceJobs.has(id)) return;
    // A new id for text this room already voiced (the TV lost or evicted its copy, or
    // re-asks after a failed native fetch) is answered from a copy: no Polly round trip.
    const key = text.trim();
    for (const clip of room.clips.values()) {
      if (clip.text !== key || !clip.audio.length) continue;
      storeClip(room, id, { audio: Buffer.from(clip.audio), marks: clip.marks.map(m => ({ ...m })), durationMs: clip.durationMs,
        nativeAudio: clip.nativeAudio && Buffer.from(clip.nativeAudio), text: key });
      return;
    }
    if (room.voiceJobs.size >= LIMITS.pendingTtsPerRoom) {
      if (room.tv) error(room.tv, 'RATE_LIMIT');
      send(room.tv, { t: 'tts', id, ok: false });
      return;
    }
    const job = new AbortController();
    room.voiceJobs.set(id, job);
    void voice.read(text, at, job.signal).then((clip) => {
      room.voiceJobs.delete(id);
      if (room.closed || job.signal.aborted) { if (clip) dropClip(clip); return; }
      if (!clip) { send(room.tv, { t: 'tts', id, ok: false }); return; }
      clip.text = key;
      storeClip(room, id, clip);
    });
  }
  function storeClip(room: Room, id: string, clip: VoiceClip) {
    if (room.clips.size >= LIMITS.ttsPerRoom) {
      const oldest = room.clips.keys().next().value!;
      dropClip(room.clips.get(oldest)!); room.clips.delete(oldest);
    }
    room.clips.set(id, clip);
    send(room.tv, { t: 'tts', id, ok: true, marks: clip.marks, durationMs: clip.durationMs });
    // The native TV fetches fragmented AAC as soon as it hears this reply; start the
    // conversion now so the fetch finds it running (or done) instead of starting it.
    if (room.tv?.nativeImages) void nativeVoice(clip);
  }
  /** One bounded ffmpeg job per clip; a failed job is cleared so a later fetch can retry. */
  function nativeVoice(clip: VoiceClip): Promise<Buffer | undefined> {
    if (clip.nativeAudio) return Promise.resolve(clip.nativeAudio);
    clip.nativeAbort ??= new AbortController();
    const abort = clip.nativeAbort;
    clip.nativeJob ??= fragmentVoice(clip.audio, abort.signal).then(bytes => {
      if (abort.signal.aborted) { bytes?.fill(0); return; }
      clip.nativeAudio = bytes; if (!bytes) clip.nativeJob = undefined; return bytes;
    });
    return clip.nativeJob;
  }
  function binaryMessage(c: Connection, data: Buffer, at: number) {
    const room = c.room;
    if (!room || room.closed || c.role !== 'phone') { error(c, 'BAD_MSG'); return; }
    const frame = decodeBinary(data);
    const result = binaryHeader.safeParse(frame?.header);
    if (!frame || !result.success) { error(c, 'BAD_MSG'); return; }
    const h = result.data;
    if (h.t === 'thumb') {
      if (!frame.payload.length || frame.payload.length > LIMITS.thumbBytes) { error(c, 'BAD_MSG'); return; }
      if (!c.thumbs.take(at)) { error(c, 'RATE_LIMIT'); return; }
      const tv = room.tv?.ws;
      if (tv?.readyState === WebSocket.OPEN && tv.bufferedAmount <= LIMITS.thumbBackpressureBytes) {
        if (room.tv!.nativeImages) queueThumbnail(c, room, frame.payload);
        else tv.send(encodeBinary({ t: 'thumb', cid: c.cid! }, frame.payload), { binary: true }, (err) => { if (err) logger('error', 'socket'); });
      }
    } else acceptSnag(c, room, h, frame.payload, at);
  }
  function acceptSnag(c: Connection, room: Room, h: Extract<BinaryHeader, { t: 'snag' }>, payload: Uint8Array, at: number) {
    if (payload.length < 4 || payload.length > LIMITS.snagBytes || payload[0] !== 0xff || payload[1] !== 0xd8 || payload[2] !== 0xff) { error(c, 'BAD_MSG'); return; }
    if (room.photos.size >= LIMITS.photosPerRoom) {
      const oldest = room.photos.keys().next().value!;
      dropPhoto(room.photos.get(oldest)!); room.photos.delete(oldest); room.pendingTv.delete(oldest);
    }
    const photoId = randomKey();
    const photo: Photo = { bytes: Buffer.from(payload), job: new AbortController() };
    room.photos.set(photoId, photo);
    // A snag is always retained even when the TV has disconnected / is slow.
    photoToTv(room, photoId, { t: 'from', cid: c.cid!, at, m: { t: 'snag', photoId, round: h.round, hex: h.hex, match: h.match, ...(h.roundKind === 'color' && h.mask ? { mask: h.mask } : {}) } });
    const cid = c.cid!;
    void ai.read({ jpeg: photo.bytes, prompt: h.prompt }, at, photo.job.signal, () => {
      const r = fallbackRead(room.lastFallbackQuip);
      // Choose and remember synchronously when the read fails, so simultaneous
      // fallback completions share the room's latest selection, including resume.
      if (!room.closed) room.lastFallbackQuip = r.quip;
      return r;
    }).then((r) => {
      if (room.closed) return;
      const retained = room.photos.get(photoId) === photo;
      // Mark the job as finished without retaining additional photo data.
      photo.job.abort();
      const message = { t: 'ai', cid, photoId, r } as const;
      if (retained) photoToTv(room, photoId, message);
      else send(room.tv, message); // eviction aborts the read, but a live phone still gets its fallback
      send(room.phones.get(cid), message);
    });
  }

  function detached(c: Connection) {
    c.pendingThumb?.fill(0); c.pendingThumb = undefined;
    connections.delete(c);
    const room = c.room;
    c.room = null;
    if (!room || room.closed) return;
    if (c.role === 'tv' && room.tv === c) {
      room.tv = null;
      room.grace = setTimeout(() => closeRoom(room, 'tv_absent'), options.roomGraceMs ?? ROOM_GRACE_MS);
      room.grace.unref();
    } else if (c.cid && room.phones.get(c.cid) === c) {
      room.phones.delete(c.cid);
      peerToTv(room, c.cid, false);
    }
  }

  const server = createServer((req, res) => {
    // The outer catch deliberately discards request/provider error text.
    void http(req, res).catch(() => {
      logger('error', 'http');
      if (!res.headersSent) { res.writeHead(500, { 'Cache-Control': 'no-store' }); res.end(); }
      else res.destroy();
    });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.maxConnections = LIMITS.connections;
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.snagBytes + LIMITS.binaryHeaderBytes + 4, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    if (stopping || !authorizedOrigin(req) || req.method !== 'GET' || req.url?.split('?')[0] !== '/ws' || connections.size >= LIMITS.connections) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws, request: IncomingMessage) => {
    const c: Connection = { ws, room: null, opened: Date.now(), lastPong: Date.now(), nativeImages: new URL(request.url ?? '/ws', 'http://relay.local').searchParams.get('images') === 'native', rate: new RateWindow(options.messagesPerSecond ?? LIMITS.messagesPerSecond), thumbs: new RateWindow(LIMITS.thumbsPerSecond) };
    connections.add(c);
    ws.on('pong', () => { c.lastPong = Date.now(); });
    ws.on('close', () => detached(c));
    ws.on('error', () => { logger('error', 'socket'); ws.terminate(); });
    ws.on('message', (raw, binary) => {
      const at = Date.now();
      if (!c.rate.take(at)) { error(c, 'RATE_LIMIT'); return; }
      if (binary) { binaryMessage(c, bytes(raw), at); return; }
      const data = bytes(raw);
      if (data.length > LIMITS.jsonBytes) { error(c, 'BAD_MSG'); return; }
      let value: unknown;
      try { value = JSON.parse(data.toString('utf8')); }
      catch { error(c, 'BAD_MSG'); return; }
      // Fast clock path is synchronous, before schema or service work. There is no
      // per-socket async queue to let a photo/AI/TTS call hold up a pong.
      if (typeof value === 'object' && value !== null && 't' in value && value.t === 'ping') {
        const p = value as Record<string, unknown>;
        if (typeof p.c === 'number' && Number.isFinite(p.c) && Object.keys(p).length === 2) {
          // Native WebSocket implementations can answer at the application
          // layer. A valid clock ping also proves this connection is alive.
          c.lastPong = at;
          send(c, { t: 'pong', c: p.c, s: at });
        }
        else error(c, 'BAD_MSG');
        return;
      }
      const parsed = clientMessage.safeParse(value);
      if (!parsed.success) { error(c, 'BAD_MSG'); return; }
      textMessage(c, parsed.data, at);
    });
  });
  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const c of connections) {
      if (now - c.lastPong >= (options.pingTimeoutMs ?? PING_TIMEOUT_MS) || (!c.room && now - c.opened >= 10000)) c.ws.terminate();
      else if (c.ws.readyState === WebSocket.OPEN) c.ws.ping();
    }
  }, options.heartbeatMs ?? 5000);
  heartbeat.unref();

  function authorizedOrigin(req: IncomingMessage): boolean {
    if (!config.originSecret) return true;
    const token = req.headers['x-relay-origin'];
    return typeof token === 'string' && token.length === 64 && /^[a-f0-9]{64}$/.test(token) && timingSafeEqual(Buffer.from(token), Buffer.from(config.originSecret));
  }

  async function http(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!authorizedOrigin(req)) { res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end(); return; }
    const url = new URL(req.url ?? '/', 'http://relay.local');
    if (!['GET', 'HEAD'].includes(req.method ?? '')) { res.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' }); res.end(); return; }
    if (url.pathname === '/healthz') {
      const { rooms, phones } = counts();
      res.writeHead(stopping ? 503 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: !stopping, uptimeS: Math.floor((Date.now() - started) / 1000), rooms, phones, aiMode: config.aiMode, pollyMode: config.pollyMode, version: '0.1.0' }));
      return;
    }
    if (/^\/(p|tts)(\/|$)/.test(url.pathname)) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      const match = /^\/(p|tts)\/([BCDFGHJKLMNPQRSTVWXYZ]{4})\/([a-zA-Z0-9_-]{1,64})$/.exec(url.pathname);
      const room = match ? rooms.get(match[2]!) : undefined;
      let data = match && room && url.searchParams.getAll('k').length === 1 && sameKey(url.searchParams.get('k'), room.roomKey)
        ? (match[1] === 'p' ? room.photos.get(match[3]!)?.bytes : room.clips.get(match[3]!)?.audio) : undefined;
      if (!data) { res.writeHead(404); res.end(); return; }
      const native = match![1] === 'tts' && url.searchParams.get('format') === 'mp4';
      const sticker = match![1] === 'p' && url.searchParams.get('format') === 'sticker';
      if (sticker) {
        const photo = room!.photos.get(match![3]!)!;
        if (!photo.native) {
          photo.nativeJob ??= nativePhoto(photo.bytes).then(bytes => {
            if (photo.disposed) { bytes.fill(0); return; }
            photo.native = bytes; return bytes;
          }).catch(() => undefined);
          data = await photo.nativeJob;
        } else data = photo.native;
        if (res.destroyed || res.writableEnded) return;
        if (!data || room!.closed || photo.disposed) { res.writeHead(503); res.end(); return; }
      }
      if (native) {
        const clip = room!.clips.get(match![3]!)!;
        // One retry: a 503 here makes the TV drop a prefetched line until it is spoken.
        data = await nativeVoice(clip);
        if (!data && !room!.closed && !res.destroyed) data = await nativeVoice(clip);
        if (res.destroyed || res.writableEnded) return;
        if (!data || room!.closed) { res.writeHead(503); res.end(); return; }
      }
      if (sticker && url.searchParams.get('encoding') === 'base64') {
        // The native image component needs a RAM data URI. Encode on the relay
        // instead of running a byte-by-byte JS conversion during the reveal.
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=us-ascii', 'Content-Length': Math.ceil(data.length / 3) * 4 });
        res.end(req.method === 'HEAD' ? undefined : data.toString('base64'));
        return;
      }
      const contentType = match![1] === 'p' ? sticker ? 'image/png' : 'image/jpeg' : native ? 'audio/mp4' : 'audio/wav';
      if (match![1] === 'tts') {
        res.setHeader('Accept-Ranges', 'bytes');
        const range = req.method === 'GET' ? byteRange(req.headers.range, data.length) : undefined;
        if (range === false) { res.writeHead(416, { 'Content-Range': `bytes */${data.length}`, 'Content-Length': 0 }); res.end(); return; }
        if (range) {
          res.writeHead(206, { 'Content-Type': contentType, 'Content-Range': `bytes ${range.start}-${range.end}/${data.length}`, 'Content-Length': range.end - range.start + 1 });
          res.end(data.subarray(range.start, range.end + 1)); return;
        }
      }
      res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': data.length });
      res.end(req.method === 'HEAD' ? undefined : data);
      return;
    }
    // No invented placeholder UI. When built, the phone worker's dist is the page.
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { res.writeHead(404); res.end(); return; }
    if (pathname.includes('\0') || pathname.includes('\\')) { res.writeHead(404); res.end(); return; }
    try {
      const root = await realpath(config.phoneDist);
      const target = resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
      const path = await realpath(target);
      if (!path.startsWith(`${root}${sep}`)) { res.writeHead(404); res.end(); return; }
      const info = await stat(path);
      if (!info.isFile()) { res.writeHead(404); res.end(); return; }
      const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };
      const cache = extname(path) === '.html' ? 'no-cache' : /[.-][a-zA-Z0-9_-]{8,}\.[a-z0-9]+$/.test(path) && pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
      // Compress only public detector assets / JS. The memory-only photo route above
      // is unchanged; WASM otherwise adds >9 MB to each phone's lobby download.
      const compressible = ['.wasm', '.tflite', '.js'].includes(extname(path));
      const gzip = compressible && (req.headers['accept-encoding'] ?? '').split(',').some((part) => {
        const [encoding, ...parameters] = part.trim().split(';');
        const quality = parameters.find((p) => p.trim().startsWith('q='))?.trim().slice(2);
        return encoding?.toLowerCase() === 'gzip' && (quality === undefined || Number(quality) > 0);
      });
      res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': cache,
        ...(compressible ? { Vary: 'Accept-Encoding' } : {}), ...(gzip ? { 'Content-Encoding': 'gzip' } : { 'Content-Length': info.size }) });
      if (req.method === 'HEAD') res.end();
      else {
        const stream = createReadStream(path).on('error', () => { logger('error', 'http'); res.destroy(); });
        const body = gzip ? stream.pipe(createGzip({ level: 9 })).on('error', () => { logger('error', 'http'); res.destroy(); }) : stream;
        body.pipe(res);
      }
    } catch { res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end(); }
  }

  return {
    server,
    /** Numeric diagnostics for lifecycle tests / load script. No user data exposed. */
    stats: counts,
    async listen(port = config.port, host = config.host): Promise<number> {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => { server.removeListener('error', reject); resolve(); });
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Relay failed to listen');
      logger('started', 'none', { port: address.port });
      return address.port;
    },
    async stop(): Promise<void> {
      if (stopping) return;
      stopping = true;
      clearInterval(heartbeat);
      for (const room of [...rooms.values()]) closeRoom(room, 'shutdown');
      for (const c of connections) c.ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      if (server.listening) await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeIdleConnections(); });
      logger('stopped', 'none', { rooms: rooms.size, phones: 0 });
    },
  };
}

export type Relay = ReturnType<typeof createRelay>;
