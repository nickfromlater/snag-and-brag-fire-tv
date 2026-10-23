import { execFile } from 'node:child_process';
import { mkdir, readFile, realpath, stat, statfs, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

export const repo = resolve(import.meta.dirname, '../..');
export const homeFootage = join(homedir(), 'builds/snag-and-brag/footage');
export const chrome = process.env.DIRECTOR_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const ffmpeg = process.env.DIRECTOR_FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
export const ffprobe = process.env.DIRECTOR_FFPROBE ?? join(dirname(ffmpeg), 'ffprobe');
export const run = promisify(execFile);
export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export const beatNames = ['lobby', 'hunt-feeds', 'pixel-judge-mask', 'brag-final-mash', 'showstopper-win', 'finale'];
export const galleryFiles = beatNames.map((n, i) => `${String(i + 1).padStart(2, '0')}-${n}.png`);
export const json = value => JSON.stringify(value, null, 2) + '\n';

export async function outsideGit(output) {
  output = resolve(output);
  const rel = relative(repo, output);
  if (!(rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))) throw new Error('Masters must be outside the repository; use ~/builds/snag-and-brag/footage/');
  await mkdir(output, { recursive: true });
  const physical = await realpath(output), physicalRepo = await realpath(repo);
  const physicalRel = relative(physicalRepo, physical);
  if (!(physicalRel === '..' || physicalRel.startsWith('..' + sep) || isAbsolute(physicalRel))) throw new Error('Master output resolves into the repository through a symlink');
  const space = await statfs(output);
  if (space.bavail * space.bsize < 2_000_000_000) throw new Error('Less than 2 GB free; capture refused without deleting anyone else’s files');
  return output;
}
export async function encode(args) {
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { maxBuffer: 200_000 });
}
export async function probe(file) {
  const { stdout } = await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height,r_frame_rate,nb_frames', '-of', 'json', file]);
  return JSON.parse(stdout);
}
export const h264 = fps => ['-an', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-threads', '2', '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart'];
export async function safePreview(file) {
  if ((await stat(file)).size > 10_000_000) throw new Error(`Preview exceeds the 10 MB commit limit: ${file}`);
}
export function sceneRanges(events, durationMs) {
  const scenes = events.filter(e => e.kind === 'scene');
  const counts = new Map();
  return scenes.map((e, i) => {
    let name;
    if (e.scene === 'lobby') name = 'lobby';
    else if (e.scene === 'intro') name = ['color-rush-intro', 'brag-off-intro', 'showstopper-intro'][e.round];
    else if (e.scene === 'hunt') name = ['color-rush-hunt', 'brag-off-hunt', 'showstopper-hunt'][e.round];
    else if (e.scene === 'stand') name = `standings-round-${e.round + 1}`;
    else if (e.scene === 'brag') { const n = (counts.get('brag') ?? 0) + 1; counts.set('brag', n); name = n === 3 ? 'brag-final' : `brag-semifinal-${n}`; }
    else name = { judge: 'pixel-judge', show: 'showstopper-vote-win', champ: 'finale' }[e.scene];
    if (!name) throw new Error('Unknown scene in cue log');
    return { name, startMs: e.atMs, endMs: scenes[i + 1]?.atMs ?? durationMs };
  });
}
export function segmentsFor(durationMs, limitMs = 170_000, overlapMs = 2000) {
  if (!(limitMs > 0 && limitMs <= 170_000 && overlapMs > 0 && overlapMs < limitMs) || !Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Segments need a positive ≤170s limit and a smaller positive overlap');
  const out = [];
  for (let startMs = 0; startMs < durationMs; startMs += limitMs - overlapMs) {
    const endMs = Math.min(durationMs, startMs + limitMs); out.push({ startMs, endMs }); if (endMs === durationMs) break;
  }
  return out;
}
export function coverageCuts(segments, durationMs) {
  if (!segments.length || segments[0].startMs > 0) throw new Error('Missing beginning of capture');
  return segments.map((s, i) => {
    const next = segments[i + 1];
    if (next && (next.startMs > s.endMs || next.startMs <= s.startMs)) throw new Error('Gap or unordered segments');
    const endMs = next?.startMs ?? durationMs;
    if (endMs > s.endMs + 1) throw new Error('Missing end of capture');
    return { ...s, cutEndMs: endMs };
  });
}
export function segmentName(segment, scenes, index) {
  const names = scenes.filter(s => s.endMs > segment.startMs && s.startMs < segment.endMs).map(s => s.name);
  return `${String(index + 1).padStart(2, '0')}-${names[0] ?? 'lobby'}-to-${names.at(-1) ?? 'lobby'}.mp4`;
}
export async function readManifest(file) {
  const m = JSON.parse(await readFile(file, 'utf8'));
  if (m.version !== 1 || m.syntheticOnly !== true || !m.master || beatNames.some(n => !Number.isFinite(m.beats[n]))) throw new Error('A director synthetic-only capture manifest with all six beats is required');
  return m;
}
export async function saveManifest(file, value) { await writeFile(file, json(value)); }
