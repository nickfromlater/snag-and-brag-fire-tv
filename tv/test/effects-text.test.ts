import { describe, expect, it } from 'vitest';
import type { TvCue } from '@snag/shared';
import { fireworkBesideName, HOST_BUBBLE_RIGHT, HUD_BOTTOM, reactionLane, reactionLifetime } from '../src/stage/effect-layout';

describe('effects stay clear of the show copy', () => {
  it('keeps every reaction extent outside the host bubble and below the chips, including the fastest drift and largest pop', () => {
    const radius = 60 / 2 * Math.SQRT2 * 1.2 + 16;
    for (const start of [260, 300, 640, 1180, 1220]) for (const vx of [-30, 30]) for (const vy of [-260, -190]) {
      const x = reactionLane(start), life = reactionLifetime(700, vy, -40, radius, 2.6);
      for (let t = 0; t < life; t += 1 / 60) {
        expect(x + vx * t - radius).toBeGreaterThan(HOST_BUBBLE_RIGHT);
        expect(x + vx * t + radius).toBeLessThan(1280);
        expect(700 + vy * t - 20 * t * t - radius).toBeGreaterThan(HUD_BOTTOM);
      }
    }
  });
  it('places both burst origins beside short and long champion names while retaining the burst recipe and rocket timing', () => {
    for (const width of [300, 740, 1040]) for (const x of [320, 960]) {
      const name = { x: (1280 - width) / 2, width };
      const c = { k: 'firework', x, y: 180, color: '#FFD43B', rocket: { fromX: x + (x < 640 ? 50 : -50), fromY: 720, durationMs: 600, gravity: 500 },
        burst: { count: 46, speed: [240, 430], gravity: 300, drag: .955, life: [.9, 1.4], sound: 'boom', recipe: { angleJitter: [-.06, .06], width: [3, 6], colors: 'alternating-color-paper', ringRadius: 70, stars: 5 } } } as Extract<TvCue, { k: 'firework' }>;
      const safe = fireworkBesideName(c, name);
      expect(safe.x < name.x || safe.x > name.x + name.width).toBe(true);
      expect(safe.y).toBe(c.y); expect(safe.burst).toBe(c.burst);
      expect(safe.rocket.durationMs).toBe(600); expect(safe.rocket.fromX - safe.x).toBe(x < 640 ? 50 : -50);
    }
  });
});
