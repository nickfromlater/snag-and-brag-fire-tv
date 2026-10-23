import { setTimeout as delay } from 'node:timers/promises';
import type { LogReason } from './log.js';

export class ServiceFailure extends Error {
  constructor(readonly reason: LogReason) { super(reason); }
}

export function failureReason(error: unknown): LogReason {
  return error instanceof ServiceFailure ? error.reason : 'provider';
}

/** The deadline includes image preparation / response decoding, not just HTTP. */
export async function withBudget<T>(
  arrival: number, budgetMs: number, parent: AbortSignal,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let rejectAbort: (reason: Error) => void = () => {};
  const stopped = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = (reason: 'timeout' | 'aborted') => {
    if (controller.signal.aborted) return;
    controller.abort();
    rejectAbort(new ServiceFailure(reason));
  };
  const onParent = () => abort('aborted');
  parent.addEventListener('abort', onParent, { once: true });
  const remaining = Math.max(0, arrival + budgetMs - Date.now());
  const timer = setTimeout(() => abort('timeout'), remaining);
  timer.unref();
  try {
    if (parent.aborted) onParent();
    else if (!remaining) abort('timeout');
    // Promise.race enforces the budget even if a provider ignores AbortSignal.
    // Defer the operation so an already-cancelled request cannot contact AWS.
    const result = await Promise.race([stopped, Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new ServiceFailure('aborted');
      return run(controller.signal);
    })]);
    if (Date.now() >= arrival + budgetMs) throw new ServiceFailure('timeout');
    return result;
  } finally {
    clearTimeout(timer);
    parent.removeEventListener('abort', onParent);
  }
}

export function mockDelay(ms: number, signal: AbortSignal): Promise<void> {
  return delay(ms, undefined, { signal });
}
