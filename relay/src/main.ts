import { createRelay } from './server.js';
import { log } from './log.js';

try {
  const relay = createRelay();
  await relay.listen();
  const shutdown = () => { void relay.stop().then(() => { process.exitCode = 0; }); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch {
  // Configuration / SDK errors can contain secrets. Log only a fixed reason.
  log('error', 'startup');
  process.exitCode = 1;
}
