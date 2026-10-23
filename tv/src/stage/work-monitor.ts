/** Metadata-only checkpoints for a diagnostic build's native watchdog investigation. */
let observer: ((fields: Record<string, string | number>) => void) | undefined;
export function observeWork(next?: typeof observer): void { observer = next; }
export function beginWork(file: string, target?: string): () => void {
  if (!observer) return () => {};
  const fields: Record<string, string | number> = target ? { file, target } : { file };
  observer({ ...fields, phase: 'start' }); const start = performance.now();
  return () => observer?.({ ...fields, phase: 'end', milliseconds: Math.round(performance.now() - start) });
}
export function monitorWork<T>(file: string, work: () => T, target?: string): T {
  if (!observer) return work();
  const fields: Record<string, string | number> = target ? { file, target } : { file };
  observer({ ...fields, phase: 'start' });
  const start = performance.now();
  try { return work(); }
  finally { observer?.({ ...fields, phase: 'end', milliseconds: Math.round(performance.now() - start) }); }
}

/** Trace native entry/return, never arguments or media URIs. Production is untouched. */
export function traceNativeCalls<T extends object>(instance: T, target: string, methods: readonly string[], properties: readonly string[] = [], getters: readonly string[] = []): T {
  if (!observer) return instance;
  const record = instance as Record<string, unknown>;
  for (const name of methods) {
    const original = record[name];
    if (typeof original !== 'function') continue;
    Object.defineProperty(instance, name, { configurable: true, writable: true,
      value: (...args: unknown[]) => monitorWork('native-' + name, () => original.apply(instance, args), target) });
  }
  for (const name of properties) {
    let prototype: object | null = instance, descriptor: PropertyDescriptor | undefined;
    while (prototype && !descriptor) { descriptor = Object.getOwnPropertyDescriptor(prototype, name); prototype = Object.getPrototypeOf(prototype); }
    if (!descriptor?.set) continue;
    const native = descriptor;
    Object.defineProperty(instance, name, { configurable: true,
      get: () => getters.includes(name) ? monitorWork('native-get-' + name, () => native.get?.call(instance), target) : native.get?.call(instance),
      set: (value: unknown) => monitorWork('native-set-' + name, () => native.set!.call(instance, value), target) });
  }
  return instance;
}
