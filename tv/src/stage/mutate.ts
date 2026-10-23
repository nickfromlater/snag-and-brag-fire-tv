/** RN native mutation, with an equivalent DOM path for the iteration target. */
export function mutate(node: unknown, props: Record<string, unknown>): void {
  if (!node) return;
  const target = node as { setNativeProps?: (p: Record<string, unknown>) => void; style?: Record<string, string>; elementRef?: {current?: {setAttribute(k: string, v: string): void}}; setAttribute?: (k: string, v: string) => void };
  if (target.elementRef?.current) { for (const [k,v] of Object.entries(props)) target.elementRef.current.setAttribute(k === 'matrix' ? 'transform' : k === 'strokeWidth' ? 'stroke-width' : k, k === 'matrix' ? 'matrix(' + (v as number[]).join(' ') + ')' : String(v)); return; }
  if (typeof target.setNativeProps === 'function') { target.setNativeProps(props); return; }
  if (props.style && target.style) {
    for (const [key, value] of Object.entries(props.style as Record<string, unknown>)) {
      if (key === 'transform' && Array.isArray(value)) target.style.transform = value.map(part => Object.entries(part as Record<string, string | number>).map(([k, v]) => k + '(' + (typeof v === 'number' && k.startsWith('translate') ? v + 'px' : v) + ')').join(' ')).join(' ');
      else target.style[key] = typeof value === 'number' && key !== 'opacity' && key !== 'zIndex' ? value + 'px' : String(value);
    }
  }
  for (const [key, value] of Object.entries(props)) if (key !== 'style') target.setAttribute?.(key === 'strokeWidth' ? 'stroke-width' : key, String(value));
}
