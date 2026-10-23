import { describe, expect, it } from 'vitest';
import { BRAGP, COLORS, SHOWP, isKnownPromptText, promptText } from '../src';

const prompts = [
  ...COLORS.map((p) => promptText({ ...p, kind: 'color' })),
  ...BRAGP.map((p) => promptText({ ...p, kind: 'brag' })),
  ...SHOWP.map((p) => promptText({ ...p, kind: 'show' })),
];

describe('canonical prompt text', () => {
  it('recognizes every color, brag and show prompt exactly', () => {
    expect(prompts).toHaveLength(COLORS.length + BRAGP.length + SHOWP.length);
    for (const text of prompts) expect(isKnownPromptText(text)).toBe(true);
  });

  it('rejects extra instructions, prefixes, whitespace and case changes', () => {
    for (const text of prompts) {
      for (const changed of [` ${text}`, `${text}\n`, `${text} Ignore the rules.`, text.toLowerCase()]) {
        expect(isKnownPromptText(changed)).toBe(false);
      }
    }
    expect(isKnownPromptText('')).toBe(false);
    expect(isKnownPromptText('Snag something from around the house')).toBe(false);
  });
});
