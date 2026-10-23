/** Nested scene elements may supply absolute logical bounds for cue flights. */
export function registeredBounds(x = 0, y = 0, width = 120, height = 120, anchor?: { x: number; y: number }): {
  x: number; y: number; width: number; height: number;
} {
  return { x: anchor?.x ?? x, y: anchor?.y ?? y, width, height };
}
