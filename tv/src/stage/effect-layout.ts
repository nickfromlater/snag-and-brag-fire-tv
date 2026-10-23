import { clamp, STAGE_W } from '@snag/shared';
import type { TvCue } from '@snag/shared';

/** Shared paint order on web and native. A scene's opaque backdrop stays at 0. */
export const layers = { backdrop: 0, effects: 1, content: 2, hud: 3, host: 4, menu: 30 } as const;
// Reference HUD is 96 high; Host's reference bubble is x=226, width=720.
export const HUD_BOTTOM = 96;
export const HOST_BUBBLE_RIGHT = 946;

/** Leave room for the original ±30 px/s drift, icon rotation/pop and 16px wobble. */
export function reactionLane(x: number): number { return 1110 + clamp((x - 260) / 960, 0, 1) * 24; }

/** Fade out before the icon's bounds reach the chips, retaining velocity/gravity. */
export function reactionLifetime(y: number, vy: number, gravity: number, radius: number, life: number): number {
  const distance = y - HUD_BOTTOM - radius;
  if (distance <= 0) return 0;
  const time = gravity === 0 ? -distance / vy : (-vy - Math.sqrt(Math.max(0, vy * vy - 2 * gravity * distance))) / gravity;
  return time > 0 ? Math.min(life, time) : life;
}

/** Move only the origin; the reference rocket offset, burst and timing survive. */
export function fireworkBesideName(c: Extract<TvCue, { k: 'firework' }>, name: { x: number; width: number }): Extract<TvCue, { k: 'firework' }> {
  const x = clamp(c.x < STAGE_W / 2 ? name.x - 96 : name.x + name.width + 96, 46, STAGE_W - 46);
  return { ...c, x, rocket: { ...c.rocket, fromX: clamp(x + c.rocket.fromX - c.x, 8, STAGE_W - 8) } };
}
