import { parseArgs } from 'node:util';
import { emitKeypressEvents } from 'node:readline';
import type { WebSocket } from 'ws';
import type { Clock, RemoteKey } from '@snag/shared';
import { startDemoPhone } from './demo';
import { LoopbackRelay } from './loopback';
import { TvSimulator } from './simulator';
import { connectWebSocket } from './websocket';

const { values } = parseArgs({ args: process.argv.slice(2).filter(a => a !== '--'), options: {
  relay: { type: 'string', default: 'ws://localhost:8787/ws' }, bots: { type: 'boolean', default: false }, fast: { type: 'boolean', default: false },
  loopback: { type: 'boolean', default: false }, demo: { type: 'boolean', default: false }, seed: { type: 'string', default: process.argv.includes('--showcase') || process.env.SNAG_SHOWCASE === '1' ? process.env.SNAG_SHOWCASE_SEED ?? '20261022' : '1' }, help: { type: 'boolean', short: 'h' },
  showcase: { type: 'boolean', default: process.env.SNAG_SHOWCASE === '1' },
} });
if (values.help) {
  console.log('Usage: pnpm --filter tvsim start -- --relay ws://localhost:8787/ws [--bots] [--fast] [--seed 1]');
  console.log('Standalone smoke: pnpm --filter tvsim start -- --loopback --demo --bots --fast');
  console.log('Filming script: pnpm --filter tvsim start -- --loopback --showcase [--fast] [--seed 20261022] (or SNAG_SHOWCASE=1)');
  console.log('Remote keys: Enter=Select, Escape=Back, Space=Play/Pause, f=Fast-forward, arrows=focus, Ctrl-C=close room.');
} else if (values.demo && values.showcase) {
  console.error('--showcase provides its own four synthetic actors; omit --demo.'); process.exitCode = 1;
} else if (values.demo && !values.loopback) {
  console.error('--demo requires --loopback (its photos are synthetic and memory-only).'); process.exitCode = 1;
} else {
  const seed = Number(values.seed);
  if (!Number.isSafeInteger(seed)) throw new Error('--seed must be an integer');
  const wall: Clock = { now: Date.now, setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: h => clearTimeout(h as ReturnType<typeof setTimeout>) };
  let socket: WebSocket | undefined, retry: ReturnType<typeof setTimeout> | undefined, demo: ReturnType<typeof startDemoPhone> | undefined;
  let stopping = false, attempts = 0;
  const relay = values.loopback ? new LoopbackRelay(wall, values.fast ? 400 : 4000) : undefined;
  const stop = () => {
    if (stopping) return; stopping = true; clearTimeout(retry); demo?.stop(); simulator.stop(); relay?.close(); socket?.close();
    if (process.stdin.isTTY) process.stdin.setRawMode(false); process.stdin.pause();
  };
  const simulator = new TvSimulator({ bots: values.bots || values.demo, fast: values.fast, seed, showcase: values.showcase, log: line => console.log(line),
    onReady: () => { attempts = 0; if (values.demo && relay && !demo) demo = startDemoPhone(relay, simulator.clock!); },
    onComplete: () => {
      if (!values.demo && !values.showcase) return;
      const view = simulator.game!.getView();
      console.log('FINAL ' + [...view.teams].sort((a, b) => b.score - a.score).map((t, i) => `${i + 1}. ${t.name}=${t.score}`).join(' | '));
      const best = [...view.history].sort((a, b) => b.pts! - a.pts!)[0]!;
      console.log('OBJECT OF THE NIGHT ' + best.name + ' · +' + best.pts + ' points');
      stop(); console.log('PASS full three-round ' + (values.showcase ? 'showcase' : 'bot game') + '; room closed and memory photos released.');
    },
    onError: code => { if (['NO_ROOM', 'BAD_KEY', 'BAD_PROTO'].includes(code)) { process.exitCode = 1; stop(); } },
  });
  if (values.fast) console.log('FAST 10x simulation; phone deadlines are converted to relay time.');
  if (relay) simulator.attach(relay.connect(m => simulator.receive(m), bytes => simulator.binary(bytes)));
  else {
    const connect = () => {
      if (stopping) return;
      socket = connectWebSocket(simulator, values.relay!, () => {
        if (stopping) return; simulator.disconnected(); retry = setTimeout(connect, Math.min(10_000, 1000 * 2 ** attempts++));
      }, code => console.error('Connection: ' + code));
    };
    connect();
  }
  if (process.stdin.isTTY) {
    emitKeypressEvents(process.stdin); process.stdin.setRawMode(true);
    process.stdin.on('keypress', (_str: string, key: { name: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') { stop(); return; }
      const map: Record<string, RemoteKey> = { return: 'select', escape: 'back', space: 'playpause', f: 'ff', up: 'up', down: 'down', left: 'left', right: 'right' };
      if (map[key.name]) simulator.remote(map[key.name]!);
    });
  }
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
