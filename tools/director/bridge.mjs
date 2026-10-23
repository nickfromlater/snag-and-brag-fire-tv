import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { GameHost, ShowcaseClock, createShowcase, seededRng, SHOWCASE_HOST_CID } from './shared.mjs';
import { makePlan } from './plan.mjs';

/** Optional native-renderer bridge. No relay, AI or live phone can join this cast.
 * A native renderer displays TvView then consumes its cues; see GUIDE.md. */
export async function startBridge({ port = 8790, seed = 20261022 } = {}) {
  const plan = makePlan(seed), renderers = new Set();
  let clock, game, pending = [], held = true, epoch = performance.now(), baseMs = 0, room, pose;
  const reset = () => {
    game?.dispose(); clock = new ShowcaseClock(); pending = []; held = true; pose = undefined;
    game = new GameHost({ clock, rng: seededRng(seed), showcase: createShowcase(seed), room: { code: 'FILM', joinUrl: 'https://example.invalid/showcase' }, send: () => {}, cue: e => pending.push(e) });
    game.playShowcase(); baseMs = 0; epoch = performance.now();
  };
  const tick = () => { if (!held) clock.advanceTo(Math.min(plan.durationMs, baseMs + performance.now() - epoch)); };
  const status = () => ({ showcase: true, syntheticOnly: true, seed, rendererReady: renderers.size > 0, atMs: clock.now(), held, completed: game.getView().completed, ...(room ? { roomCode: room.code, joinUrl: room.joinUrl } : {}) });
  const frame = seeking => {
    const packet = JSON.stringify({ t: 'director-frame', atMs: clock.now(), seeking, held, pose, view: game.getView(), cues: seeking ? [] : pending, phoneScreen: game.getScreen(SHOWCASE_HOST_CID) }); pending = [];
    for (const renderer of renderers) if (renderer.readyState === 1) renderer.send(packet);
  };
  reset();
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.host && !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host)) throw new Error('Local director bridge only');
      tick();
      let value;
      if (req.method === 'GET' && req.url === '/status') value = status();
      else if (req.method === 'GET' && req.url === '/plan') value = plan;
      else if (req.method === 'POST' && ['/seek', '/hold', '/play', '/reset', '/remote'].includes(req.url)) {
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4096) throw new Error('Control payload too large'); }
        const input = body ? JSON.parse(body) : {};
        if (req.url === '/reset') reset();
        else if (req.url === '/seek') {
          if (!Number.isFinite(input.atMs) || input.atMs < 0 || input.atMs > plan.durationMs) throw new Error('Invalid seek');
          if (input.pose !== undefined && !['judge-mask', 'hologram'].includes(input.pose)) throw new Error('Invalid held pose');
          reset(); clock.advanceTo(input.atMs); pose = input.pose; pending = [];
        } else if (req.url === '/hold') held = true;
        else if (req.url === '/remote') {
          if (!['select', 'back', 'playpause', 'ff', 'up', 'down', 'left', 'right'].includes(input.key)) throw new Error('Invalid remote key');
          game.remote(input.key);
        } else { pose = undefined; held = false; baseMs = clock.now(); epoch = performance.now(); }
        frame(req.url === '/reset' || req.url === '/seek'); value = status();
      } else { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value));
    } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error instanceof SyntaxError ? 'Malformed director control JSON' : error.message })); }
  });
  const sockets = new WebSocketServer({ server, path: '/renderer', maxPayload: 4096 });
  sockets.on('connection', socket => {
    socket.on('message', bytes => {
      try {
        const hello = JSON.parse(bytes.toString());
        if (renderers.has(socket)) {
          if (hello.t === 'director-room' && /^[A-Z]{4}$/.test(hello.code) && typeof hello.joinUrl === 'string') room = { code: hello.code, joinUrl: hello.joinUrl };
          else if (hello.t === 'director-key' && ['select', 'back', 'playpause', 'ff', 'up', 'down', 'left', 'right'].includes(hello.key)) { game.remote(hello.key); frame(false); }
          return;
        }
        if (hello.t !== 'director-renderer' || hello.width !== 1920 || hello.height !== 1080 || hello.target !== 'vvd') { socket.close(1008); return; }
        renderers.add(socket); frame(true);
      } catch { socket.close(1008); }
    });
    socket.on('close', () => renderers.delete(socket));
  });
  const interval = setInterval(() => { tick(); if (renderers.size) frame(false); }, 50);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { port: server.address().port, close: async () => { clearInterval(interval); game.dispose(); for (const socket of sockets.clients) socket.terminate(); await new Promise(resolve => sockets.close(resolve)); await new Promise(resolve => server.close(resolve)); } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ args: process.argv.slice(2).filter(a => a !== '--'), options: { port: { type: 'string', default: '8790' }, seed: { type: 'string', default: '20261022' } } });
  const bridge = await startBridge({ port: Number(values.port), seed: Number(values.seed) });
  console.log(`Synthetic showcase bridge: http://127.0.0.1:${bridge.port} · native renderer ws://127.0.0.1:${bridge.port}/renderer`);
  const stop = async () => { await bridge.close(); process.exit(0); }; process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
