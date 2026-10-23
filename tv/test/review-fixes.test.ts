import { describe, expect, it } from 'vitest';
import { JUDGE_MASK_BYTES, JUDGE_MASK_CELLS, TEAM_NAMES, judgeMask } from '@snag/shared';
import { fitTeamName } from '../src/stage/team-name-math';
import { fittedDisplaySize, displayWidth } from '../src/stage/display-math';
import { maskDrawing, maskRowTime, maskClipHeight } from '../src/stage/judge-mask-math';
import { animationPose } from '../src/stage/motion';

describe('readable team names', () => {
  it('keeps all preset names intact in HUD, card, pedestal and plate widths', () => {
    for (const name of [...TEAM_NAMES, "Grandma's Revenge", 'Junk Drawer Gang', 'Couch Potatoes', 'WWWWWWWWWWWWWWWWWWWW']) for (const width of [88, 104, 184, 196, 198, 270]) {
      const plan = fitTeamName(name, width);
      expect(plan.lines.length).toBeLessThanOrEqual(2);
      expect(plan.lines.join(' ')).toBe(name.toUpperCase());
      expect(plan.lines.every(line => !line.includes('…'))).toBe(true);
      expect(plan.size).toBeGreaterThanOrEqual(16);
      expect(plan.measured * plan.scaleX).toBeLessThanOrEqual(width - 2 + .001);
    }
  });
  it('fits every intro word using its real Lilita width before entrance and world punch', () => {
    for (const title of ['COLOR RUSH', 'BRAG-OFF', 'SHOWSTOPPER']) {
      const size = fittedDisplaySize(title, 168, 1022);
      const width = displayWidth(title, size, 1) + 18, height = size * .9;
      const projected = (width * Math.cos(Math.PI / 60) + height * Math.sin(Math.PI / 60)) * 1.08 * 1.05;
      expect(projected).toBeLessThan(1184);
    }
  });
  it('leaves the score clear of every preset HUD name while keeping the 16px outlines uncompressed', () => {
    for (const name of TEAM_NAMES) {
      const plan = fitTeamName(name,149,16,.6,58);
      expect(plan.scaleX).toBe(1); expect(plan.lines.length).toBeLessThanOrEqual(2);
    }
  });
});

describe('photo mask drawing', () => {
  it('merges horizontal neighbors without joining gaps or crossing row boundaries', () => {
    const bytes = Buffer.alloc(JUDGE_MASK_BYTES); bytes[0] = 0b10111; bytes[2] = 128; bytes[3] = 1;
    const drawing = maskDrawing(bytes.toString('base64'))!;
    expect(drawing.cells).toBe(6); expect(drawing.runs).toBe(4);
    expect(drawing.d).toContain('M0.08 0.08h2.84');
    expect(drawing.d).toContain('M4.08 0.08h0.84');
    expect(drawing.d).toContain('M23.08 0.08'); expect(drawing.d).toContain('M0.08 1.08');
    const full = maskDrawing(Buffer.alloc(72,255).toString('base64'))!;
    expect(full.cells).toBe(576); expect(full.runs).toBe(24); expect(full.d.length).toBeLessThan(1400);
  });
  it('uses little-endian bits and the complete 24 by 24 photo coordinate system', () => {
    const bytes = Buffer.alloc(JUDGE_MASK_BYTES); bytes[0] = 1; bytes[71] = 128;
    const drawing = maskDrawing(bytes.toString('base64'))!;
    expect(drawing.cells).toBe(2);
    expect(drawing.rows[0]).toContain('M0.08 0.08');
    expect(drawing.rows[23]).toContain('M23.08 23.08');
    expect(drawing.rows.filter(Boolean)).toHaveLength(2);
    expect(maskDrawing(undefined)).toBeNull(); expect(maskDrawing('invalid')).toBeNull();
  });
  it('draws only selected cells for an in-memory judged photo, inside the center sampling region', () => {
    const size = 480, rgba = new Uint8Array(size * size * 4);
    for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 242; rgba[i + 1] = 59; rgba[i + 2] = 46; rgba[i + 3] = 255; }
    const mask = judgeMask(rgba, size, '#F23B2E'), drawing = maskDrawing(mask)!;
    const bytes = Buffer.from(mask, 'base64'); let count = 0;
    for (let bit = 0; bit < 576; bit++) if (bytes[bit >>> 3]! & (1 << (bit & 7))) { count++; expect(bit % 24).toBeGreaterThanOrEqual(4); expect(bit % 24).toBeLessThanOrEqual(19); expect(Math.floor(bit / 24)).toBeGreaterThanOrEqual(4); expect(Math.floor(bit / 24)).toBeLessThanOrEqual(19); }
    expect(drawing.cells).toBe(count); expect(count).toBeGreaterThan(0);
  });
  it('reveals each row when the actual eased beam reaches it', () => {
    const beam: Parameters<typeof maskRowTime>[0] = { target: 'judge-beam:you', frames: [{ opacity: 0, top: '30px' }, { opacity: 1, top: '40px', offset: .1 }, { opacity: 1, top: '200px', offset: .9 }, { opacity: 0, top: '210px' }], durationMs: 800, easing: 'ease-in-out', delayMs: 0, fill: 'both', iterations: 1 };
    let previous = 0;
    for (let row = 0; row < JUDGE_MASK_CELLS; row++) {
      const ms = maskRowTime(beam, row), threshold = 22 + 170 / 12 + (row + .5) / 24 * (170 * 100 / 120);
      expect(ms).toBeGreaterThanOrEqual(previous); previous = ms;
      expect((animationPose(beam, ms).top ?? 30) + 7).toBeCloseTo(threshold, 3);
      expect(maskClipHeight(beam, ms)).toBeCloseTo(row + .5, 3);
    }
    expect(maskClipHeight(beam, 820)).toBe(24); expect(maskClipHeight(beam, 1620)).toBe(24);
  });
});
