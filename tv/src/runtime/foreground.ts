/** Vega emits app strings and, on some builds, per-module lifecycle records. */
export function foregroundUpdate(value: unknown): boolean | undefined {
  if (typeof value === 'string') {
    const state = value.toLowerCase();
    if (['active', 'foreground', 'visible'].includes(state)) return true;
    if (['background', 'inactive', 'not_visible'].includes(state)) return false;
    return;
  }
  if (Array.isArray(value)) {
    const states = value.map(foregroundUpdate).filter((state): state is boolean => state !== undefined);
    return states.length ? states.some(Boolean) : undefined;
  }
  if (value && typeof value === 'object' && 'module_state' in value) return foregroundUpdate(value.module_state);
}
