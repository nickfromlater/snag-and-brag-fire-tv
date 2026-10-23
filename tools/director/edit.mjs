import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beatNames, coverageCuts, encode, h264, probe, safePreview, segmentName } from './lib.mjs';

const concatPath = file => `file '${file.replaceAll("'", "'\\''")}'\n`;
export async function finishEdit(output, capture, { previewDir } = {}) {
  const cuts = coverageCuts(capture.segments, capture.durationMs), normalized = [];
  const temporary = join(output, '.edit'); await mkdir(temporary, { recursive: true });
  try {
    for (const [i, cut] of cuts.entries()) {
      const named = join(output, 'segments', segmentName(cut, capture.scenes, i));
      await rename(cut.file, named); capture.segments[i].file = named;
      const file = join(temporary, `${i}.mp4`);
      await encode(['-i', named, '-t', ((cut.cutEndMs - cut.startMs) / 1000).toFixed(6), ...h264(capture.fps), file]); normalized.push(file);
    }
    const list = join(temporary, 'concat.txt'); await writeFile(list, normalized.map(concatPath).join(''));
    capture.master = join(output, 'showcase-master.mp4');
    await encode(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', capture.master]);
    const info = await probe(capture.master), video = info.streams.find(s => s.width);
    if (video.codec_name !== 'h264' || video.width !== 1920 || video.height !== 1080 || Math.abs(Number(info.format.duration) * 1000 - capture.durationMs) > 1000 / capture.fps + 3) throw new Error('Stitched master failed codec, size or timeline verification');
    capture.masterProbe = info;
    const scenesDir = join(output, 'scenes'); await mkdir(scenesDir, { recursive: true });
    for (const s of capture.scenes) {
      s.file = join(scenesDir, `${s.name}.mp4`);
      await encode(['-ss', (s.startMs / 1000).toFixed(6), '-i', capture.master, '-t', ((s.endMs - s.startMs) / 1000).toFixed(6), ...h264(capture.fps), s.file]);
    }
    if (previewDir) {
      await mkdir(previewDir, { recursive: true });
      const filters = beatNames.map((name, i) => `[0:v]trim=start=${Math.max(0, capture.beats[name] / 1000 - .8).toFixed(6)}:duration=2.8,setpts=PTS-STARTPTS,scale=1280:720,fps=30[v${i}]`).join(';')
        + ';' + beatNames.map((_, i) => `[v${i}]`).join('') + 'concat=n=6:v=1:a=0[preview]';
      capture.preview = join(previewDir, 'showcase-preview.mp4');
      await encode(['-i', capture.master, '-filter_complex', filters, '-map', '[preview]', '-an', '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-threads', '2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', capture.preview]);
      await safePreview(capture.preview); capture.previewProbe = await probe(capture.preview);
    }
    return capture;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
