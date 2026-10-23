import { clamp } from '@snag/shared';
import { glyphCache } from './glyphs';

/** Same perimeter sampling and integer placement as reference bulbs(). */
export function marqueePoints(x: number, y: number, width: number, height: number): { x: number; y: number }[] {
  const perimeter = 2 * (width + height), count = Math.round(perimeter / 44);
  return Array.from({ length: count }, (_, i) => {
    const d = i / count * perimeter;
    const point = d < width ? [x + d, y] : d < width + height ? [x + width, y + d - width]
      : d < 2 * width + height ? [x + width - (d - width - height), y + height] : [x, y + height - (d - 2 * width - height)];
    return { x: Math.round(point[0]!), y: Math.round(point[1]!) };
  });
}
export function reelOffset(count: number, elapsedMs: number, durationMs = 2400, cardHeight = 320): number {
  if (elapsedMs <= 0 || count <= 1) return 0;
  return -Math.max(0, count - 1) * cardHeight * (1 - Math.pow(1 - clamp(elapsedMs / durationMs, 0, 1), 4));
}
export function rollValue(from: number, to: number, progress: number): number {
  return Math.round(from + (to - from) * (1 - Math.pow(1 - clamp(progress, 0, 1), 3)));
}
export const displayWidth = (text: string, size: number, spacing = 0): number => glyphCache.measure(text, size, spacing);
export function fittedDisplaySize(text: string, maximum: number, width: number, spacing = 1): number {
  let size = maximum;
  while (size > 16 && displayWidth(text, size, spacing) > width) size--;
  return size;
}
/** Wrap actual Lilita glyph widths, keeping the reference's two-line team-name treatment. */
export function displayLines(text: string, width: number, size: number, maxLines = 2, spacing = 0): string[] {
  const lines: string[] = []; let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? line + ' ' + word : word;
    if (line && glyphCache.measure(next, size, spacing) > width && lines.length < maxLines - 1) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
