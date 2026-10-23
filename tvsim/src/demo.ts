import jpeg from 'jpeg-js';
import { JUDGE_SIZE, PHONE_COLORS, PROTO, TIMING, encodeBinary, hex2rgb, judgePhoto } from '@snag/shared';
import type { Clock, RelayToClient } from '@snag/shared';
import type { LoopbackRelay, Transport } from './loopback';

/** One scripted phone uses the actual protocol, including a synthetic JPEG generated
 * in memory. No photos, thumbnails, raw frames or image strings enter the transcript. */
export function startDemoPhone(relay: LoopbackRelay, clock: Clock): { stop(): void } {
  const cid = '00000000000000000000000000000001';
  let phone: Transport, starting = false, closed = false;
  const snagged = new Set<number>(), sent = new Set<number>(), voted = new Set<number>(), matches = new Set<string>();
  const tasks = new Set<unknown>();
  const after = (delay: number, fn: () => void) => {
    let task: unknown; task = clock.setTimeout(() => { tasks.delete(task); if (!closed) fn(); }, delay); tasks.add(task);
  };
  const receive = (message: RelayToClient) => {
    if (message.t !== 'msg' || message.m.t !== 'screen') return;
    const screen = message.m, s = screen.s;
    if (s.k === 'lobby' && s.isHost && s.canStart && !starting) { starting = true; after(20_000, () => phone.send({ t: 'msg', m: { t: 'start' } })); }
    if (s.k === 'cam' && !snagged.has(screen.round)) {
      snagged.add(screen.round);
      after(1200, () => {
        const size = TIMING.SNAG_PX, data = Buffer.alloc(size * size * 4);
        const hex = screen.prompt?.hex ?? '#F23B2E', rgb = hex2rgb(hex);
        for (let i = 0; i < data.length; i += 4) { data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255; }
        // The synthetic image is solid, so its 480px downscale has identical RGBA.
        const judged = judgePhoto(data.subarray(0, JUDGE_SIZE * JUDGE_SIZE * 4), JUDGE_SIZE, screen.prompt?.hex ?? null);
        const image = jpeg.encode({ data, width: size, height: size }, 80).data;
        const prompt = screen.prompt!;
        phone.sendBinary!(encodeBinary({ t: 'snag', round: screen.round, hex: judged.hex, match: judged.match, prompt: `${prompt.a} ${prompt.b} ${prompt.c}`, roundKind: prompt.kind, ...(judged.mask ? { mask: judged.mask } : {}) }, image));
      });
    }
    if (s.k === 'glow' && !sent.has(screen.round)) {
      sent.add(screen.round); after(700, () => phone.send({ t: 'msg', m: { t: 'glow', eyes: [[42, 46], [78, 46]], name: s.names[0]!, brag: s.brags[0]! } }));
    }
    if (s.k === 'vote' && s.options.length && !voted.has(screen.round)) { voted.add(screen.round); after(1000, () => phone.send({ t: 'msg', m: { t: 'vote', team: s.options[0]!.team } })); }
    if (s.k === 'mash' && s.phase === 'mash') {
      const key = s.left.team.id + ':' + s.right.team.id; if (matches.has(key)) return; matches.add(key);
      const end = clock.now() + TIMING.MASH_MS; let fraction = 0;
      const tap = () => {
        if (clock.now() >= end) return;
        fraction += .7; const n = Math.floor(fraction); fraction -= n;
        if (n) phone.send({ t: 'msg', m: { t: 'tap', n, side: s.right.team.id === screen.me!.id ? 1 : -1 } });
        after(100, tap);
      };
      after(100, tap);
    }
    if (s.k === 'wait') after(100, () => phone.send({ t: 'msg', m: { t: 'react', kind: 'star' } }));
  };
  phone = relay.connect(receive); phone.send({ t: 'hello', proto: PROTO, role: 'phone', code: 'LOOP', cid });
  phone.send({ t: 'msg', m: { t: 'join', name: 'Sock Goblins', color: PHONE_COLORS[0]! } });
  return { stop() { closed = true; for (const task of tasks) clock.clearTimeout(task); tasks.clear(); phone.close(); } };
}
