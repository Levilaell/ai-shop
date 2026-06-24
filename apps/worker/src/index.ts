import { PIPELINE_STATUSES } from '@ai-shop/shared';

/**
 * Worker stub. The real consumer (pgmq queue, concurrency semaphore for the
 * 10-job HeyGen limit, job handlers, structured logging) is built in T3.
 * This entrypoint only validates the monorepo wiring and cross-package import.
 */
function main(): void {
  console.log(
    `[worker] stub OK — state machine has ${PIPELINE_STATUSES.length} statuses. ` +
      'Real implementation lands in T3.',
  );
}

main();
