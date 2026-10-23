import outlines from './generated/glyphs.json';
import rubik from './generated/rubik-glyphs.json';

type Command = { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };
interface Glyph { advance: number; commands: Command[] }
interface Bank { units: number; ascender: number; descender: number; glyphs: Record<string, Glyph>; kerning: Record<string, number> }
const bank = outlines as unknown as Bank;
export interface GlyphPath { d: string; width: number; height: number; baseline: number }
/** A bounded LRU of actual Lilita outlines, including runtime strings. No SVG Text fallback. */
export class GlyphCache {
  private readonly entries = new Map<string, GlyphPath>();
  hits = 0; misses = 0;
  constructor(readonly limit = 256, private readonly font = bank) {}
  get size(): number { return this.entries.size; }
  /** Layout measures font advances without constructing or evicting SVG paths. */
  measure(text: string, size: number, spacing = 0): number {
    const factor = size / this.font.units; let x = 0, previous = '';
    for (const character of text) {
      x += (this.font.kerning[previous + character] ?? 0) * factor;
      x += (this.font.glyphs[character] ?? this.font.glyphs['?']!).advance * factor + spacing;
      previous = character;
    }
    return Math.max(0, x - spacing);
  }
  get(text: string, size: number, spacing = 0): GlyphPath {
    const bank = this.font;
    const key = text + '\u0000' + size + '\u0000' + spacing, found = this.entries.get(key);
    if (found) { this.entries.delete(key); this.entries.set(key, found); this.hits++; return found; }
    this.misses++;
    const factor = size / bank.units, baseline = bank.ascender * factor;
    let x = 0, d = '', previous = '';
    for (const character of text) {
      const glyph = bank.glyphs[character] ?? bank.glyphs['?']!;
      x += (bank.kerning[previous + character] ?? 0) * factor;
      for (const c of glyph.commands) {
        const p = (a: number | undefined, b: number | undefined) => (x + (a ?? 0) * factor).toFixed(2) + ' ' + (baseline - (b ?? 0) * factor).toFixed(2);
        d += c.type;
        if (c.type === 'M' || c.type === 'L') d += p(c.x, c.y);
        else if (c.type === 'Q') d += p(c.x1, c.y1) + ' ' + p(c.x, c.y);
        else if (c.type === 'C') d += p(c.x1, c.y1) + ' ' + p(c.x2, c.y2) + ' ' + p(c.x, c.y);
      }
      x += glyph.advance * factor + spacing; previous = character;
    }
    const result = { d, width: Math.max(0, x - spacing), height: (bank.ascender - bank.descender) * factor, baseline };
    this.entries.set(key, result);
    if (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
    return result;
  }
}
export const glyphCache = new GlyphCache();
export const teamGlyphCache = new GlyphCache(256, rubik as unknown as Bank);
