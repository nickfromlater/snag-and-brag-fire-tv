import { teamGlyphCache } from './glyphs';

/** Keep whole words and apostrophes. Tighten tracking before shrinking to 16px. */
export function fitTeamName(name: string, width: number, size = 16, spacing = .6, reserveWidth = 0, minSize = 16, maxLines = 2) {
  const minimum = Math.max(16, minSize);
  const text = name.toUpperCase().trim(), words = text.split(/\s+/);
  const choices = maxLines < 2 ? [text] : [text, ...words.slice(1).map((_, i) => words.slice(0, i + 1).join(' ') + '\n' + words.slice(i + 1).join(' '))];
  let best = { lines: [text], size: Math.max(minimum, size), spacing: -.6, measured: Infinity, scaleX: 1, scoreLine: 0 };
  for (let fontSize = Math.max(minimum, size); fontSize >= minimum; fontSize--) for (const tracking of [...new Set([spacing, 0, -.3, -.6])]) {
    const candidates = choices.map(choice => {
      const lines = choice.split('\n'), widths = lines.map(line => teamGlyphCache.measure(line, fontSize, tracking)), measured = Math.max(...widths);
      const scoreLine = lines.length > 1 && widths[1]! <= width - reserveWidth - 2 ? 1 : 0;
      return { lines, size: fontSize, spacing: tracking, measured, scaleX: 1, scoreLine, scoreFits: widths[scoreLine]! <= width - reserveWidth - 2 };
    }).sort((a, b) => a.lines.length - b.lines.length || a.measured - b.measured);
    const fit = candidates.find(c => c.measured <= width - 2 && c.scoreFits); if (fit) return fit;
    best = candidates.reduce((a, b) => a.measured < b.measured ? a : b);
  }
  // A single 20-character custom word has no legal break point. Preserve its
  // height and all its letters by compressing only horizontally as a last resort.
  return { ...best, scaleX: Math.min(1, (width - reserveWidth - 2) / best.measured) };
}
