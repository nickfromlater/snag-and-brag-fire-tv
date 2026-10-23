import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { ART, artDefs } from '../src/art';

describe('binding reference assets', () => {
  it('generates byte-identical SVG for every approved object', () => {
    const original = readFileSync(new URL('../../reference/src/art.js', import.meta.url), 'utf8');
    const context = { ART: {} as Record<string, string> }; runInNewContext(original, context);
    expect(Object.keys(ART)).toHaveLength(26); expect(ART).toEqual(context.ART);
  });
  it('preserves the exact die-cut filter, shadow and four reaction symbols', () => {
    const original = readFileSync(new URL('../../reference/src/game.js', import.meta.url), 'utf8');
    const filter = original.match(/d\+='(<filter id="diecut"[^\n]+)<\/filter>';/)?.[1];
    expect(filter).toBeDefined(); expect(artDefs()).toContain(`${filter}</filter>`);
    for (const kind of ['star', 'heart', 'flame', 'tomato']) expect(artDefs()).toContain(`id="i-${kind}"`);
  });
});
