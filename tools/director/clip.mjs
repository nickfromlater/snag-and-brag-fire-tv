import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { encode, h264, outsideGit, readManifest } from './lib.mjs';

const { values } = parseArgs({ args: process.argv.slice(2).filter(a => a !== '--'), options: { from: { type: 'string' }, out: { type: 'string' }, scene: { type: 'string' }, beat: { type: 'string' }, seconds: { type: 'string', default: '6' } } });
if (!values.from || !values.out || (!!values.scene === !!values.beat)) throw new Error('Usage: node tools/director/clip.mjs --from capture.json --scene NAME|--beat NAME --seconds 6 --out ~/builds/snag-and-brag/footage/take/shots/name.mp4');
const manifest = await readManifest(resolve(values.from)), seconds = Number(values.seconds);
if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 170) throw new Error('Clip duration must be positive and at most 170 seconds');
const scene = values.scene && manifest.scenes.find(s => s.name === values.scene);
const startMs = scene ? scene.startMs : values.beat ? manifest.beats[values.beat] : undefined;
if (!Number.isFinite(startMs)) throw new Error('Unknown scene or beat');
const available = (scene ? scene.endMs : manifest.durationMs) - startMs;
const output = resolve(values.out); await outsideGit(dirname(output)); await mkdir(dirname(output), { recursive: true });
await encode(['-ss', (startMs / 1000).toFixed(6), '-i', manifest.master, '-t', Math.min(seconds, available / 1000).toFixed(6), ...h264(manifest.fps), output]);
console.log(`Pickup: ${output}`);
