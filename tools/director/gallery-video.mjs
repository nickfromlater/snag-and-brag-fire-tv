import { copyFile, stat } from 'node:fs/promises';
import { encode, probe } from './lib.mjs';

/** Keep the played native round, then hold its separately captured native win.
 * Both inputs are ScreenCaptureKit pixels from the same showcase session. */
export async function finishGalleryClip(source, endStill, master, preview) {
  await encode(['-i', source, '-loop', '1', '-framerate', '30', '-t', '2', '-i', endStill,
    '-filter_complex', '[0:v]fps=30,setsar=1,setpts=PTS-STARTPTS[live];[1:v]fps=30,setsar=1,setpts=PTS-STARTPTS[held];[live][held]concat=n=2:v=1:a=0[out]',
    '-map', '[out]', '-an', '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-threads', '2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', master]);
  if ((await stat(master)).size <= 10_000_000) await copyFile(master, preview);
  else await encode(['-i', master, '-vf', 'scale=1280:720', '-an', '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-threads', '2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', preview]);
  if ((await stat(preview)).size > 10_000_000) throw new Error('Native review clip exceeds 10 MB');
  return { endStill, endHoldSeconds: 2, encoding: 'libx264 / CRF 28 / preset slow / silent', ...(await probe(preview)) };
}
