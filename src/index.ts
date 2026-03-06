import { run } from './cli.js';
import { log } from './logger.js';

run().catch((err: unknown) => {
  log.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
