// Read-only metadata polling for independently recorded native frame traces.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../relay/package.json', import.meta.url));
const WebSocket = require('ws');
const socket = new WebSocket('ws://127.0.0.1:8790/observe?runtime=native');
const timer = setInterval(() => { if (socket.readyState === 1) socket.send(JSON.stringify({ command: 'snapshot' })); }, 400);
socket.on('error', () => { clearInterval(timer); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { clearInterval(timer); socket.close(); });
