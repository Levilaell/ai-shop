/**
 * The consume loop (spec §5). Reads jobs from pgmq, dispatches them by type with
 * bounded concurrency, acks on success, and retries via the pgmq visibility
 * timeout — moving a job to the dead-letter archive once it exhausts attempts.
 *
 * Concurrency has two layers:
 *   1. `maxConcurrency` — total jobs in flight at once.
 *   2. `heygen` semaphore — at most N concurrent HeyGen video generations
 *      (spec §5: the provider allows 10), independent of layer 1.
 */

import { isPipelineJob, type PipelineJob } from '@ai-shop/shared';
import type { JobQueue, QueueMessage } from './queue.js';
import type { Logger } from './logger.js';
import type { WorkerConfig } from './config.js';
import { Semaphore } from './semaphore.js';
import { dispatch, countsAgainstHeygenLimit, type HandlerContext } from './handlers/index.js';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class Runner {
  private running = false;
  private readonly inFlight = new Set<Promise<void>>();
  private readonly heygen: Semaphore;

  constructor(
    private readonly queue: JobQueue,
    private readonly log: Logger,
    private readonly config: WorkerConfig,
    /** Everything a handler needs except the per-job logger (injected per job). */
    private readonly baseCtx: Omit<HandlerContext, 'log' | 'heygen'>,
  ) {
    this.heygen = new Semaphore(config.heygenMaxConcurrency);
  }

  /** Run until `stop()` is called. Resolves after the queue is drained on stop. */
  async start(): Promise<void> {
    this.running = true;
    this.log.info('worker started', {
      queue: this.config.queueName,
      maxConcurrency: this.config.maxConcurrency,
      heygenMaxConcurrency: this.config.heygenMaxConcurrency,
    });

    while (this.running) {
      const capacity = this.config.maxConcurrency - this.inFlight.size;
      if (capacity <= 0) {
        // Saturated — wait for any in-flight job to finish before reading more.
        await Promise.race(this.inFlight);
        continue;
      }

      let messages: QueueMessage[];
      try {
        messages = await this.queue.read(this.config.visibilityTimeoutSeconds, capacity);
      } catch (err) {
        this.log.error('queue read failed; backing off', { err });
        await sleep(this.config.pollIntervalMs);
        continue;
      }

      if (messages.length === 0) {
        // Nothing to do: wait for in-flight work or idle-poll.
        if (this.inFlight.size > 0) await Promise.race(this.inFlight);
        else await sleep(this.config.pollIntervalMs);
        continue;
      }

      for (const msg of messages) {
        const p = this.process(msg);
        this.inFlight.add(p);
        void p.finally(() => this.inFlight.delete(p));
      }
    }

    // Drain: let in-flight jobs finish so we don't ack/lose them mid-flight.
    this.log.info('draining in-flight jobs', { inFlight: this.inFlight.size });
    await Promise.allSettled(this.inFlight);
    this.log.info('worker stopped');
  }

  stop(): void {
    if (this.running) this.log.info('stop requested');
    this.running = false;
  }

  private async process(msg: QueueMessage): Promise<void> {
    const log = this.log.child({ msgId: msg.msgId, readCt: msg.readCt });

    if (!isPipelineJob(msg.message)) {
      log.warn('malformed job — archiving to dead-letter', { message: msg.message });
      await this.safeArchive(msg.msgId, log);
      return;
    }

    const job: PipelineJob = msg.message;
    const jobLog = log.child({ jobType: job.type, account_id: job.account_id });
    const ctx: HandlerContext = { ...this.baseCtx, log: jobLog, heygen: this.heygen };

    try {
      const run = (): Promise<void> => dispatch(job, ctx);
      if (countsAgainstHeygenLimit(job)) {
        await this.heygen.withPermit(run);
      } else {
        await run();
      }
      await this.queue.delete(msg.msgId);
      jobLog.info('job completed');
    } catch (err) {
      if (msg.readCt >= this.config.maxAttempts) {
        jobLog.error('job failed permanently — archiving to dead-letter', {
          err,
          attempts: msg.readCt,
        });
        await this.safeArchive(msg.msgId, jobLog);
      } else {
        // Leave the message: pgmq makes it visible again after the timeout.
        jobLog.warn('job failed — will retry after visibility timeout', {
          err,
          attempts: msg.readCt,
        });
      }
    }
  }

  private async safeArchive(msgId: number, log: Logger): Promise<void> {
    try {
      await this.queue.archive(msgId);
    } catch (err) {
      // Don't let a failed archive crash the loop; it will be retried after vt.
      log.error('archive failed', { err });
    }
  }
}
