let handler: ((name: string) => void) | undefined;
export function observeExceptions(fn: (name: string) => void): () => void {
  const utils = (globalThis as unknown as { ErrorUtils?: { getGlobalHandler(): (error: Error, fatal?: boolean) => void; setGlobalHandler(fn: (error: Error, fatal?: boolean) => void): void } }).ErrorUtils;
  handler = fn;
  if (!utils) return () => { handler = undefined; };
  const original = utils.getGlobalHandler();
  utils.setGlobalHandler((error, fatal) => { handler?.(error.name || 'Error'); original(error, fatal); });
  return () => { handler = undefined; utils.setGlobalHandler(original); };
}
