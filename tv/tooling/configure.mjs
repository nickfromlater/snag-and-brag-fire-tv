import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const url = process.env.TV_RELAY_URL ?? 'ws://127.0.0.1:8787/ws';
const controlUrl = process.env.TV_CONTROL_URL ?? 'ws://127.0.0.1:8790';
const directorUrl = process.env.TV_DIRECTOR_URL ?? 'ws://127.0.0.1:8791/renderer';
if (!/^wss?:\/\//.test(url)) throw new Error('TV_RELAY_URL must be a WebSocket URL');
if (!/^wss?:\/\//.test(controlUrl)) throw new Error('TV_CONTROL_URL must be a WebSocket URL');
if (!/^ws:\/\/(127\.0\.0\.1|localhost):\d+\/renderer$/.test(directorUrl)) throw new Error('TV_DIRECTOR_URL must be a loopback director renderer');
await writeFile(resolve(import.meta.dirname, '../src/config.ts'), '/** Public build configuration; no credentials. */\nexport const config = ' + JSON.stringify({ relayUrl: url, controlUrl, directorUrl, showcase: process.env.SNAG_SHOWCASE === '1', debug: process.env.TV_DEBUG !== 'false', offline: process.env.TV_OFFLINE === 'true', photoProbe: process.env.TV_PHOTO_PROBE === 'true' }) + ' as const;\n');
