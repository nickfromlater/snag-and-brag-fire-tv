import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import sharp from 'sharp';
import { PROTO, decodeBinary, encodeBinary, type ClientToRelay, type RelayToClient } from '@snag/shared';
import { createRelay } from '../src/server.js';
import { configFromEnv } from '../src/config.js';

// Not part of CI. Without LOAD_URL, exercise an isolated mock relay in this process
// so its memory (not just the load generator's memory) can be measured.
const local = process.env.LOAD_URL ? undefined : createRelay({ config: configFromEnv({ AI_MODE: 'mock', POLLY_MODE: 'mock' }), logger: () => {} });
const url = process.env.LOAD_URL ?? `ws://127.0.0.1:${await local!.listen(0, '127.0.0.1')}/ws`;
const sockets: WebSocket[] = [];
const phones: { ws: WebSocket; cid: string }[] = [];
const pending = new Map<string, number[]>();
const latency: number[] = [];
let sent = 0, errors = 0, unexpectedDisconnects = 0, finishing = false;
let interval: NodeJS.Timeout | undefined;
let sampler: NodeJS.Timeout | undefined;
const startMemory = process.memoryUsage();
let peakRss = startMemory.rss;

async function connect(hello: ClientToRelay): Promise<{ ws: WebSocket; welcome: Extract<RelayToClient, { t: 'welcome' }> }> {
  const ws = new WebSocket(url); sockets.push(ws);
  ws.on('error', () => { errors++; });
  ws.on('close', () => { if (!finishing) unexpectedDisconnects++; });
  await once(ws, 'open');
  const welcome = new Promise<Extract<RelayToClient, { t: 'welcome' }>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Load handshake timeout')), 10000);
    const receive = (data: Buffer, binary: boolean) => {
      if (binary) return;
      const m = JSON.parse(data.toString()) as RelayToClient;
      if (m.t === 'error') { errors++; clearTimeout(timer); ws.off('message', receive); reject(new Error('Load handshake rejected')); }
      if (m.t === 'welcome') { clearTimeout(timer); ws.off('message', receive); resolve(m); }
    };
    ws.on('message', receive);
  });
  ws.send(JSON.stringify(hello));
  return { ws, welcome: await welcome };
}

try {
  for (let room = 0; room < 50; room++) {
    const tv = await connect({ t: 'hello', proto: PROTO, role: 'tv' });
    tv.ws.on('message', (data: Buffer, binary: boolean) => {
      if (!binary) { if ((JSON.parse(data.toString()) as RelayToClient).t === 'error') errors++; return; }
      const frame = decodeBinary(data);
      if (frame?.header.t !== 'thumb' || !frame.header.cid) { errors++; return; }
      const at = pending.get(frame.header.cid)?.shift();
      if (at !== undefined) latency.push(performance.now() - at);
    });
    await Promise.all(Array.from({ length: 4 }, async () => {
      const cid = randomBytes(16).toString('hex');
      pending.set(cid, []);
      const { ws } = await connect({ t: 'hello', proto: PROTO, role: 'phone', code: tv.welcome.code, cid });
      ws.on('message', (data: Buffer, binary: boolean) => { if (!binary && (JSON.parse(data.toString()) as RelayToClient).t === 'error') errors++; });
      phones.push({ ws, cid });
    }));
  }
  const thumb = await sharp({ create: { width: 96, height: 64, channels: 3, background: '#F23B2E' } }).jpeg({ quality: 30 }).toBuffer();
  const frame = encodeBinary({ t: 'thumb' }, thumb);
  const started = performance.now();
  const send = () => {
    for (const { ws, cid } of phones) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      pending.get(cid)!.push(performance.now()); ws.send(frame); sent++;
    }
  };
  send();
  interval = setInterval(send, 1000 / 3);
  sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 1000);
  process.stdout.write('Load running: 50 rooms, 200 phones, 3 thumbs/s each, 60 seconds.\n');
  await delay(60000);
  clearInterval(interval); clearInterval(sampler);
  await delay(500);
  latency.sort((a, b) => a - b);
  const percentile = (p: number) => Number((latency[Math.min(latency.length - 1, Math.floor(latency.length * p))] ?? 0).toFixed(2));
  const current = process.memoryUsage();
  peakRss = Math.max(peakRss, current.rss);
  process.stdout.write(`${JSON.stringify({ rooms: 50, phones: 200, thumbsPerSecond: 3, elapsedMs: Math.round(performance.now() - started), sent, received: latency.length, errors, unexpectedDisconnects, p50Ms: percentile(0.5), p95Ms: percentile(0.95), memory: { scope: local ? 'relay-and-generator' : 'generator-only', startRssMiB: Math.round(startMemory.rss / 1048576), endRssMiB: Math.round(current.rss / 1048576), peakRssMiB: Math.round(peakRss / 1048576), heapMiB: Math.round(current.heapUsed / 1048576), externalMiB: Math.round(current.external / 1048576) }, relay: local?.stats() })}\n`);
  if (errors || unexpectedDisconnects || sent !== latency.length) process.exitCode = 1;
} catch {
  process.stdout.write('Load failed; request bodies and socket details suppressed.\n');
  process.exitCode = 1;
} finally {
  finishing = true;
  clearInterval(interval); clearInterval(sampler);
  for (const ws of sockets) ws.terminate();
  await local?.stop();
}
