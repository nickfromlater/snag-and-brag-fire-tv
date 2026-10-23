/** Native Motion tables: one sample per 30 fps frame (the stick's ceiling), 12 to 120
 * intervals, cached by relative timing so repeated beats (every round, every team)
 * skip the JS build at scene entrances. Fewer samples also shrink the worklet copy. */
export function motionTableSteps(durationMs: number): number { return Math.max(12, Math.min(120, Math.ceil(durationMs / (1000 / 30)))); }
const LIMIT = 256;
const tables = new Map<string, unknown[]>();
export function cachedMotionTable<T>(key: string, build: () => T[]): T[] {
  const hit = tables.get(key) as T[] | undefined;
  if (hit) { tables.delete(key); tables.set(key, hit); return hit; }
  const table = build(); tables.set(key, table);
  if (tables.size > LIMIT) tables.delete(tables.keys().next().value!);
  return table;
}
export function motionTableCacheSize(): number { return tables.size; }
