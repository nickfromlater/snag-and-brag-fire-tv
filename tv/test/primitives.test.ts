import { describe, expect, it } from 'vitest';
import { SPRING_CURVES, SPRINGS, seededRng } from '@snag/shared';
import { createEye, kickEye, stepEye } from '../src/stage/eyes';
import { GlyphCache } from '../src/stage/glyphs';
import { animationPose, easingAt, parseFrame, reducedPose, springAt } from '../src/stage/motion';
import { AudioPool } from '../src/stage/audio-pool';
import { base64, FeedSlots } from '../src/stage/memory-images';
describe('ported googly pendulum', () => {
  it('stays on the eye disk after a large kick and settles with the original downward bias', () => {
    const e = createEye(seededRng(2)); kickEye(e, 50, seededRng(1));
    for (let i = 0; i < 900; i++) { stepEye(e, 1 / 30, { x: 100, y: 200, width: 78 }); expect(Math.hypot(e.x, e.y)).toBeLessThanOrEqual(1.000001); }
    expect(e.x).toBeCloseTo(0, 4); expect(e.y).toBeCloseTo(.45 + 2 / 14, 4);
  });
  it('reacts to parent movement without a layout measurement', () => {
    const e = createEye(() => .5); stepEye(e, 1 / 30, { x: 0, y: 0, width: 120 }); const before = e.vx, baseline = {...e};
    stepEye(e, 1 / 30, { x: 60, y: -20, width: 120 }); expect(e.vx).toBeLessThan(before); stepEye(baseline, 1 / 30, {x: 0, y: 0, width: 120}); expect(e.vy).toBeGreaterThan(baseline.vy);
  });
});
describe('reference spring and keyframe curves', () => {
  it('preserves score-bar proportions and readable faces with reduced motion', () => {
    const pose = reducedPose(parseFrame({ width: '40%', transform: 'rotateY(180deg) scale(1.8)' }, 100, 20), 100);
    expect(pose).toMatchObject({ sx: .4, sy: 1, x: -30, rotationY: 0 });
  });
  it.each(Object.keys(SPRINGS) as (keyof typeof SPRINGS)[])('%s starts at zero, overshoots and settles at one', name => {
    expect(springAt(name, 0)).toBe(0); expect(springAt(name, 1)).toBe(1);
    expect(SPRING_CURVES[name].samples).toHaveLength(72); expect(Math.max(...SPRING_CURVES[name].samples)).toBeGreaterThan(1);
  });
  it('inverts cubic-bezier and resolves percent transforms on logical dimensions', () => {
    expect(easingAt('cubic-bezier(.42,0,.58,1)', .5)).toBeCloseTo(.5, 4);
    expect(parseFrame({ transform: 'translate(-50%, -10px) rotate(-14deg) scale(.92,1.08)' }, 200, 100)).toMatchObject({ x: -100, y: -10, rotation: -14, sx: .92, sy: 1.08 });
  });
  it('renders a late animation at its current elapsed state without replay', () => {
    const a = { target: 'lobby.snag', frames: [{ transform: 'scale(2.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], durationMs: 520, delayMs: 0, fill: 'both' as const, iterations: 1, easing: 'linear' };
    expect(animationPose(a, 260)).toMatchObject({ sx: 1.8, sy: 1.8, opacity: .5 }); expect(animationPose(a, 600)).toMatchObject({ sx: 1, opacity: 1 });
  });
});
describe('runtime glyph outline cache', () => {
  it('caches real paths for runtime team names and evicts the least recently used string', () => {
    const cache = new GlyphCache(2), a = cache.get('Sock Goblins', 88);
    expect(a.d).toContain('M'); expect(a.width).toBeGreaterThan(200); expect(cache.get('Sock Goblins', 88)).toBe(a);
    cache.get('Junk Drawer', 88); cache.get('Sock Goblins', 88); cache.get('Grandma’s Revenge', 88); expect(cache.size).toBe(2);
    const before = cache.misses; cache.get('Junk Drawer', 88); expect(cache.misses).toBe(before + 1);
  });
  it('measures kerning and tracking without filling the SVG path cache', () => {
    const cache = new GlyphCache(2);
    for (const text of ['AVATAR', 'Grandma’s Revenge', 'A 🚀', '']) for (const size of [16, 88, 188]) {
      const width = cache.measure(text, size, .6); expect(width).toBe(cache.get(text, size, .6).width);
    }
    const size = cache.size, misses = cache.misses;
    for (let i = 0; i < 200; i++) cache.measure('A long team name', i, -.1);
    expect(cache.size).toBe(size); expect(cache.misses).toBe(misses);
  });
});
describe('audio start policy', () => {
  it('guards each effect at 40 ms while permitting a different effect', () => {
    const pool = new AudioPool(); expect(pool.start('mash', 0, 600)).toBeDefined(); expect(pool.start('mash', 39, 600)).toBeUndefined(); expect(pool.start('tick', 39, 100)).toBeDefined(); expect(pool.start('mash', 40, 600)).toBeDefined();
  });
  it('steals the oldest of eight voices and releases completed voices', () => {
    const pool = new AudioPool(); for (let i = 0; i < 8; i++) pool.start('sfx-' + i, i, 1000);
    expect(pool.start('ninth', 9, 1000)?.stolen?.effect).toBe('sfx-0'); expect(pool.active.size).toBe(8);
    pool.expire(2000); expect(pool.active.size).toBe(0);
  });
});
describe('four bounded memory feed slots', () => {
  it('retains one decode and only the newest pending frame per slot', () => {
    const slots = new FeedSlots(), first = new Uint8Array(100), newest = new Uint8Array(200);
    expect(slots.submit(0, first)).toBe(first);
    for (let i = 0; i < 1000; i++) slots.submit(0, newest);
    expect(slots.bytes).toBe(300); expect(slots.slots).toHaveLength(4); expect(slots.loaded(0)).toBe(newest); slots.clear(); expect(slots.bytes).toBe(0);
  });
  it('uses pure JS base64, including zero and non-ASCII bytes', () => { expect(base64(new Uint8Array([0, 127, 128, 254, 255]))).toBe(Buffer.from([0, 127, 128, 254, 255]).toString('base64')); });
});
