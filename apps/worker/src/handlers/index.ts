/**
 * Handler registry + dispatch. Routes a validated PipelineJob to its typed
 * handler. The exhaustive switch makes adding a JobType a compile error until a
 * handler is wired here.
 */

import type { PipelineJob } from '@ai-shop/shared';
import type { HandlerContext } from './context.js';
import { handleGenerateScript } from './generate-script.js';
import { handleGenerateVideo } from './generate-video.js';
import { handlePollVideo } from './poll-video.js';
import { handleCollectPerformance } from './collect-performance.js';

export type { HandlerContext, JobHandler } from './context.js';

/**
 * True for jobs the runner gates on the HeyGen semaphore. Only video generation
 * counts against the 10-concurrent limit (spec §5); poll_video is a cheap status
 * GET and must not be throttled (it would starve in-flight generations).
 */
export function countsAgainstHeygenLimit(job: PipelineJob): boolean {
  return job.type === 'generate_video';
}

export function dispatch(job: PipelineJob, ctx: HandlerContext): Promise<void> {
  switch (job.type) {
    case 'generate_script':
      return handleGenerateScript(job, ctx);
    case 'generate_video':
      return handleGenerateVideo(job, ctx);
    case 'poll_video':
      return handlePollVideo(job, ctx);
    case 'collect_performance':
      return handleCollectPerformance(job, ctx);
    default: {
      // Exhaustiveness guard: unreachable if all JobTypes are handled.
      const _never: never = job;
      return Promise.reject(new Error(`No handler for job: ${JSON.stringify(_never)}`));
    }
  }
}
