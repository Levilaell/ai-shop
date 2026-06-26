/**
 * Shared context handed to every job handler. Keeps handlers free of wiring
 * concerns (which client, which logger, how to enqueue a follow-up job).
 */

import type { AiShopClient } from '@ai-shop/db';
import type { PipelineJob, ScriptProvider, VideoProvider } from '@ai-shop/shared';
import type { JobQueue } from '../queue.js';
import type { Logger } from '../logger.js';
import type { WorkerConfig } from '../config.js';
import type { Semaphore } from '../semaphore.js';

export interface HandlerContext {
  readonly db: AiShopClient;
  readonly queue: JobQueue;
  readonly log: Logger;
  readonly config: WorkerConfig;
  /** Gate for the HeyGen 10-concurrent-job limit (spec §5). */
  readonly heygen: Semaphore;
  /** Script LLM provider; null when ANTHROPIC_API_KEY is not configured (T4). */
  readonly scriptProvider: ScriptProvider | null;
  /** Video provider (HeyGen); null when HeyGen env is not configured (T5). */
  readonly videoProvider: VideoProvider | null;
}

export type JobHandler<J extends PipelineJob> = (job: J, ctx: HandlerContext) => Promise<void>;
