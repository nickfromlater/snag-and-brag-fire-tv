import { spawn } from 'node:child_process';
let active = 0;

/** Native Vega MSE consumes fragmented AAC/MP4. The default response is WAV.
 * Conversion is a bounded pipe: no audio file, shell or extra paid API call. */
export function fragmentVoice(audio: Buffer, signal: AbortSignal): Promise<Buffer | undefined> {
  if (signal.aborted || active >= 4) return Promise.resolve(undefined);
  active++;
  return new Promise(resolve => {
    const process = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', 'pipe:0', '-ac', '1', '-ar', '24000', '-c:a', 'aac', '-b:a', '48k', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks: Buffer[] = []; let size = 0, done = false;
    const finish = (ok: boolean) => {
      if (done) return; done = true; active--; clearTimeout(timeout); signal.removeEventListener('abort', abort);
      const result = ok && size ? Buffer.concat(chunks) : undefined;
      chunks.forEach(chunk => chunk.fill(0)); resolve(result);
    };
    const abort = () => { process.kill('SIGKILL'); finish(false); };
    // A killed conversion loses the TV's prefetched line; a slow one only delays it.
    const timeout = setTimeout(abort, 1500);
    signal.addEventListener('abort', abort, { once: true });
    process.stdout.on('data', (chunk: Buffer) => { if (done) { chunk.fill(0); return; } size += chunk.length; chunks.push(chunk); if (size > 1024 * 1024) abort(); });
    process.on('error', () => finish(false)); process.on('close', code => finish(code === 0 && !signal.aborted));
    process.stdin.on('error', () => {}); process.stdin.end(audio);
  });
}
