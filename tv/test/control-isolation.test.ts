import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

it('isolates native commands and evidence from a simultaneous web app', async () => {
  const output = await mkdtemp(resolve(tmpdir(), 'snag-control-'));
  const child = spawn(process.execPath, [resolve(import.meta.dirname, '../tooling/control.mjs')], {
    env: { ...process.env, TV_CONTROL_PORT: '0', TV_CONTROL_OUTPUT_DIR: output }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const sockets: WebSocket[] = [];
  try {
    const port = await new Promise<string>((ok, bad) => {
      let text = ''; child.stdout.on('data', bytes => { text += String(bytes); const match = text.match(/127\.0\.0\.1:(\d+)/); if (match) ok(match[1]!); });
      child.once('error', bad); child.once('exit', code => bad(new Error('Control exited before listening: ' + code)));
    });
    const open = async (path: string) => {
      const socket = new WebSocket('ws://127.0.0.1:' + port + path); sockets.push(socket);
      await new Promise<void>((ok, bad) => { socket.addEventListener('open', () => ok(), { once: true }); socket.addEventListener('error', () => bad(new Error('Control connection failed')), { once: true }); });
      return socket;
    };
    const native = await open('/native'), web = await open('/web'), observer = await open('/observe?runtime=native');
    const nativeCommands: unknown[] = [], webCommands: unknown[] = [], evidence: { kind: string; runtime: string }[] = [];
    native.addEventListener('message', e => nativeCommands.push(JSON.parse(String(e.data))));
    web.addEventListener('message', e => webCommands.push(JSON.parse(String(e.data))));
    observer.addEventListener('message', e => evidence.push(JSON.parse(String(e.data))));
    observer.send(JSON.stringify({ command: 'snapshot' }));
    native.send(JSON.stringify({ kind: 'engine', hermes: true, source: 'data:image/jpeg;base64,synthetic', photo: 'synthetic-private-field' }));
    web.send(JSON.stringify({ kind: 'complete', exceptions: 0 }));
    await new Promise(ok => setTimeout(ok, 120));
    expect(nativeCommands).toEqual([{ command: 'snapshot' }]); expect(webCommands).toEqual([]);
    expect(evidence).toEqual([{ kind: 'engine', hermes: true, runtime: 'native' }]);
    const log = await readFile(resolve(output, 'runtime.jsonl'), 'utf8');
    expect(log).not.toContain('synthetic-private-field'); expect(log).not.toContain('data:image');
  } finally {
    sockets.forEach(socket => socket.close());
    const stopped = once(child, 'exit'); child.kill('SIGTERM'); await stopped;
    await rm(output, { recursive: true, force: true });
  }
}, 10000);
