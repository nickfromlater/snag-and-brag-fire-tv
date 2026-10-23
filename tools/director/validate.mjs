import { ffmpeg, run } from './lib.mjs';
import { createShowcase, OBJI, showcaseJudgeMask } from './shared.mjs';

/** Check the actual PNG, rather than just a DOM canvas/opacity claim. The crop
 * is a synthetic showcase frame; RGBA remains in memory and is never logged. */
export async function validateMaskStill(file, box, seed = 20261022) {
  const s = createShowcase(seed).script, mask = Buffer.from(showcaseJudgeMask(OBJI[s.rounds[0].finds[0].obj].col, s.rounds[0].prompt.hex), 'base64');
  if (!box || ![box.x, box.y, box.width, box.height].every(Number.isInteger)) throw new Error('Missing mask capture geometry');
  const { stdout } = await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', `crop=${box.width}:${box.height}:${box.x}:${box.y}`, '-frames:v', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', 'pipe:1'], { encoding: 'buffer', maxBuffer: box.width * box.height * 4 + 4096 });
  let expectedCells = 0, greenCells = 0;
  for (let i = 0; i < 576; i++) if (mask[i >> 3] & (1 << (i & 7))) {
    expectedCells++;
    const x = Math.min(box.width - 1, Math.floor(((i % 24) * 4 + 1.5) / 96 * box.width));
    const y = Math.min(box.height - 1, Math.floor((Math.floor(i / 24) * 4 + 1.5) / 96 * box.height));
    const at = (y * box.width + x) * 4, r = stdout[at], g = stdout[at + 1], b = stdout[at + 2];
    if (g > r + 20 && g > b + 60) greenCells++;
  }
  const result = { expectedCells, greenCells, visibleFraction: greenCells / expectedCells, okay: expectedCells > 0 && greenCells / expectedCells >= .85 };
  if (!result.okay) throw new Error(`Saved Pixel Judge mask is not lit: ${JSON.stringify(result)}`);
  return result;
}
