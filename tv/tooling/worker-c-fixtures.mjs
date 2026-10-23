import { WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';

/** Synthetic objects only. JPEG buffers are generated, relayed and discarded in memory. */
export async function memoryPhone(page, code, speed = 1, relay = 'ws://127.0.0.1:8787/ws') {
  const health = await fetch(new URL('/healthz', relay.replace(/^ws/, 'http'))).then(r => r.json());
  if (health.aiMode !== 'mock' || health.pollyMode !== 'mock') throw new Error('Synthetic acceptance requires mock AI and Polly');
  const encoded = await page.evaluate(() => [0, 1, 2].map(i => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 720;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#FFF8EC'; ctx.fillRect(0, 0, 720, 720);
    ctx.fillStyle = ['#F23B2E', '#3FE0D0', '#FFD43B'][i]; ctx.strokeStyle = '#0E0B2B'; ctx.lineWidth = 18;
    ctx.beginPath(); ctx.roundRect(190, 190, 290, 350, 40); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(490, 310, 90, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(220, 230, 26, 180);
    return canvas.toDataURL('image/jpeg', .8).split(',')[1];
  }));
  const jpegs = encoded.map(value => Buffer.from(value, 'base64'));
  const ws = new WebSocket(relay), cid = randomBytes(16).toString('hex');
  let screen, stopped = false, photos = 0, votes = 0, taps = 0, closed = false;
  const cameraRounds = [], wireErrors = [];
  ws.on('close', () => { closed = true; });
  const sent = new Set(), glowed = new Set(), voted = new Set(), jobs = new Set();
  const send = message => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'msg', m: message })); };
  await new Promise((done, fail) => {
    ws.on('error', () => fail(new Error('Synthetic phone could not connect')));
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', proto: 1, role: 'phone', code, cid })));
    ws.on('message', bytes => {
      let message; try { message = JSON.parse(String(bytes)); } catch { return; }
      if (message.t === 'error') wireErrors.push(message.code);
      if (message.t === 'welcome') send({ t: 'join', name: 'Sock Goblins', color: '#FF4FA0' });
      if (message.t !== 'msg' || message.m.t !== 'screen') return;
      screen = message.m; if (screen.me) done();
      if (screen.s.k === 'cam' && !sent.has(screen.round)) {
        sent.add(screen.round); const round = screen.round; cameraRounds.push(round);
        const job = setTimeout(() => {
          jobs.delete(job);
          if (stopped || screen.round !== round || screen.s.k !== 'cam') return;
          const header = Buffer.from(JSON.stringify({ t: 'snag', round, hex: ['#F23B2E', '#3FE0D0', '#FFD43B'][round], match: 88, prompt: [screen.prompt.a, screen.prompt.b, screen.prompt.c].join(' '), roundKind: ['color', 'brag', 'show'][round] }));
          const length = Buffer.alloc(4); length.writeUInt32BE(header.length);
          ws.send(Buffer.concat([length, header, jpegs[round]])); photos++;
        }, 0); jobs.add(job);
      }
      if (screen.s.k === 'glow' && !glowed.has(screen.round)) {
        glowed.add(screen.round); send({ t: 'glow', eyes: [[43, 44], [70, 44]], name: 'Captain Cup', brag: 'Handle with care. I was born for this.' });
      }
      if (screen.s.k === 'vote' && !voted.has(screen.round)) {
        const choice = screen.s.options.find(find => find.team !== screen.me.id);
        if (choice) { voted.add(screen.round); send({ t: 'vote', team: choice.team }); votes++; }
      }
    });
  });
  const timer = setInterval(() => {
    if (screen?.s.k !== 'mash' || screen.s.phase !== 'mash') return;
    const side = screen.s.left.team.id === screen.me.id ? -1 : screen.s.right.team.id === screen.me.id ? 1 : -1;
    const n = Math.max(1, Math.round(speed)); send({ t: 'tap', n, side }); taps += n;
  }, 100);
  return { counts: () => ({ photos, votes, taps, cameraRounds, glowRounds: [...glowed], wireErrors, closed }), stop: () => { stopped = true; clearInterval(timer); for (const job of jobs) clearTimeout(job); jpegs.length = 0; ws.close(); } };
}
