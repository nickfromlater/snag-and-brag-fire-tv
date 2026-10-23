import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ffmpeg, wait } from './lib.mjs';

/** CDP JPEGs stay in memory. Independent H.264 encoders share overlapping frames;
 * timestamps, rather than received-frame counts, define the edit timeline. */
export async function recordWeb(web, output, { segmentSeconds = 170, overlapSeconds = 2, fps = 30, onProgress = () => {}, signal } = {}) {
  const dir = join(output, 'segments'); await mkdir(dir, { recursive: true });
  const client = await web.page.createCDPSession();
  const limit = segmentSeconds * fps, overlap = overlapSeconds * fps;
  if (!Number.isInteger(limit) || !Number.isInteger(overlap) || limit <= overlap || segmentSeconds > 170) throw new Error('Invalid web segment/overlap frame counts');
  let origin, previous, cursor = 0, nextStart = 0, chain = Promise.resolve(), failure, stopping = false;
  const segments = [], active = new Set(), finishes = [];
  const startSink = startFrame => {
    const index = segments.length, file = join(dir, `part-${String(index + 1).padStart(2, '0')}.mp4`);
    const encoder = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(fps), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-crf', '17', '-preset', 'veryfast', '-threads', '2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    encoder.stderr.on('data', b => { stderr = (stderr + b.toString()).slice(-4000); });
    encoder.stdin.on('error', error => { failure ??= error; });
    const finished = new Promise((resolve, reject) => { encoder.once('error', reject); encoder.once('close', code => code === 0 ? resolve() : reject(new Error(`Frame encoder failed (${code}): ${stderr}`))); });
    finished.catch(error => { failure ??= error; }); finishes.push(finished);
    const segment = { startMs: startFrame / fps * 1000, endMs: (startFrame + limit) / fps * 1000, file, startFrame, encoder };
    segments.push(segment); active.add(segment); onProgress(`Recording overlapping segment ${index + 1}`);
  };
  const writeUntil = async (endFrame, buffer) => {
    for (; cursor < endFrame; cursor++) {
      if (failure) throw failure;
      if (cursor >= nextStart) { startSink(nextStart); nextStart += limit - overlap; }
      for (const s of active) {
        if (cursor >= s.startFrame + limit) { active.delete(s); s.encoder.stdin.end(); continue; }
        if (!s.encoder.stdin.write(buffer)) await once(s.encoder.stdin, 'drain');
      }
    }
  };
  const frame = e => {
    const buffer = Buffer.from(e.data, 'base64');
    chain = chain.then(async () => {
      if (origin !== undefined && !stopping) {
        const elapsed = e.metadata.timestamp * 1000 - origin;
        if (elapsed >= 0) {
          if (previous) await writeUntil(Math.max(0, Math.floor(elapsed / 1000 * fps)), previous);
          previous = buffer;
        }
      }
    }).catch(error => { failure ??= error; }).finally(() => client.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {}));
  };
  client.on('Page.screencastFrame', frame);
  try {
    await client.send('Page.startScreencast', { format: 'jpeg', quality: 96, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    origin = (await web.start()).epochMs;
    let completeAt;
    const wallDeadline = Date.now() + 600_000;
    while (Date.now() < wallDeadline) {
      signal?.throwIfAborted();
      if (failure) throw failure;
      if (web.errors.length) throw new Error(web.errors.join('\n'));
      // Let the scripted host finish and the cue log explicitly end the game.
      completeAt ??= web.completeAt;
      if (completeAt !== undefined && Date.now() - origin >= completeAt + 3000) break;
      await wait(200);
    }
    if (completeAt === undefined) throw new Error('Web showcase did not emit a completion cue');
    const durationMs = Math.ceil((completeAt + 3000) / 1000 * fps) / fps * 1000;
    await client.send('Page.stopScreencast'); stopping = true; await chain;
    if (!previous) throw new Error('Chrome supplied no video frames');
    await writeUntil(Math.round(durationMs / 1000 * fps), previous);
    for (const s of active) s.encoder.stdin.end(); active.clear();
    await Promise.all(finishes); if (failure) throw failure;
    return { fps, durationMs, segments: segments.filter(s => s.startMs < durationMs).map(({ encoder: _encoder, startFrame: _frame, ...s }) => ({ ...s, endMs: Math.min(s.endMs, durationMs) })) };
  } finally {
    stopping = true; await client.send('Page.stopScreencast').catch(() => {}); await chain.catch(() => {});
    for (const s of active) { s.encoder.stdin.destroy(); s.encoder.kill('SIGTERM'); }
    await Promise.allSettled(finishes); await client.detach();
  }
}
