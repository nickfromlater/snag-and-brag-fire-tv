import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { beatNames, encode, galleryFiles, h264, repo, run, segmentsFor, wait } from './lib.mjs';

export async function acquireVvdLock(path = join(homedir(), '.snag-vvd.lock')) {
  const nonce = randomUUID();
  try { await mkdir(path); } catch (error) { if (error.code === 'EEXIST') throw new Error('VVD is locked (~/.snag-vvd.lock); use --target web. The existing lock was not changed.'); throw error; }
  try { await writeFile(join(path, 'director-owner.json'), JSON.stringify({ pid: process.pid, nonce })); }
  catch (error) { await rm(path, { recursive: true }); throw error; }
  return async () => { const owner = JSON.parse(await readFile(join(path, 'director-owner.json'), 'utf8')); if (owner.nonce !== nonce) throw new Error('VVD lock ownership changed; leaving it untouched'); await rm(path, { recursive: true }); };
}
export async function bridgeRequest(url, path, body) {
  const base = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(base.hostname) || base.protocol !== 'http:') throw new Error('Director control bridge must be local HTTP');
  const response = await fetch(new URL(path, base), { method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) });
  const value = await response.json(); if (!response.ok) throw new Error(value.error ?? 'Director bridge rejected control'); return value;
}
async function preflight(url) {
  const status = await bridgeRequest(url, '/status');
  if (!status.showcase || !status.syntheticOnly || !status.rendererReady) throw new Error('VVD capture needs an attached 1920×1080 native showcase renderer (see GUIDE.md)');
  const plan = await bridgeRequest(url, '/plan');
  if (!plan.syntheticOnly || plan.seed !== status.seed) throw new Error('Showcase cue plan does not match the native renderer');
  return plan;
}
const consoleCommand = async command => {
  const { stdout } = await run('python3', [join(repo, 'spike/tooling/capture.py'), command], { maxBuffer: 32_000, timeout: 20_000 });
  if (stdout.includes('KO:')) throw new Error(`VVD console rejected ${command.split(' ').slice(0, 2).join(' ')}: ${stdout.slice(-500)}`);
};
export function vvdSegments(durationMs, segmentSeconds = 170, overlapSeconds = 2) {
  // Leave one second for recorder startup/held preroll, so stop happens before
  // its automatic cap and the recorded source still stays at or below 170s.
  if (segmentSeconds > 170 || segmentSeconds <= overlapSeconds + 1) throw new Error('Native segment limit must be ≤170s and exceed overlap by more than 1s');
  return segmentsFor(durationMs, (segmentSeconds - 1) * 1000, overlapSeconds * 1000);
}
export async function recordVvd(output, url, { segmentSeconds = 170, overlapSeconds = 2, bitRate = 8_000_000, onProgress = () => {}, signal } = {}) {
  // Lock before talking to the emulator; never probe a simulator someone else owns.
  const release = await acquireVvdLock(); let recording = false;
  try {
    const plan = await preflight(url), dir = join(output, 'segments'); await mkdir(dir, { recursive: true });
    if (/\s/.test(dir)) throw new Error('VVD console recorder output path must not contain whitespace');
    if (!Number.isSafeInteger(bitRate) || bitRate < 1) throw new Error('VVD bitrate must be a positive integer');
    const segments = vvdSegments(plan.durationMs, segmentSeconds, overlapSeconds);
    for (const [i, s] of segments.entries()) {
      signal?.throwIfAborted();
      await bridgeRequest(url, '/seek', { atMs: s.startMs }); await wait(250);
      const raw = join(dir, `raw-part-${i + 1}.mp4`), file = join(dir, `part-${String(i + 1).padStart(2, '0')}.mp4`);
      await consoleCommand(`screenrecord start --size 1920x1080 --fps 60 --bit-rate ${bitRate} --time-limit ${Math.ceil((s.endMs - s.startMs + 1000) / 1000)} ${raw}`); recording = true;
      const start = performance.now(); await bridgeRequest(url, '/play', {});
      const leadInMs = performance.now() - start;
      onProgress(`VVD segment ${i + 1}/${segments.length}; replay ${(s.startMs / 1000).toFixed(1)}s to ${(s.endMs / 1000).toFixed(1)}s`);
      const wallDeadline = performance.now() + (s.endMs - s.startMs) + 10_000;
      while (true) {
        signal?.throwIfAborted();
        const status = await bridgeRequest(url, '/status');
        if (!status.rendererReady || status.held) throw new Error('Native renderer disconnected or showcase held during recording');
        if (status.atMs >= s.endMs) break;
        if (performance.now() >= wallDeadline) throw new Error('Native showcase clock did not reach its recording deadline');
        await wait(100);
      }
      await bridgeRequest(url, '/hold', {}); await consoleCommand('screenrecord stop'); recording = false;
      await encode(['-ss', (leadInMs / 1000).toFixed(6), '-i', raw, '-t', ((s.endMs - s.startMs) / 1000).toFixed(6), ...h264(60), file]);
      await rm(raw); s.file = file; s.recordingLeadInMs = leadInMs;
    }
    return { ...plan, target: 'vvd', fps: 60, segments, captureSource: 'macOS ScreenCaptureKit single VVD window', audio: 'silent VVD-window capture' };
  } finally {
    if (recording) await consoleCommand('screenrecord stop').catch(() => {});
    await bridgeRequest(url, '/hold', {}).catch(() => {}); await release();
  }
}
export async function stillsVvd(directory, url) {
  const release = await acquireVvdLock();
  try {
    const plan = await preflight(url); await mkdir(directory, { recursive: true });
    for (const [i, name] of beatNames.entries()) {
      await bridgeRequest(url, '/seek', { atMs: plan.beats[name] }); await wait(250);
      const scratch = join(directory, `.vvd-${i}`); await mkdir(scratch);
      try {
        await consoleCommand(`screenrecord screenshot ${scratch}`);
        const png = (await readdir(scratch)).find(f => f.endsWith('.png')); if (!png) throw new Error('VVD did not produce a PNG screenshot');
        await rename(join(scratch, png), join(directory, galleryFiles[i]));
      } finally { await rm(scratch, { recursive: true, force: true }); }
    }
  } finally { await release(); }
}
