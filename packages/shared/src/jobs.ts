/**
 * Worker job contract (spec §5). These are the message payloads the worker
 * reads from the pgmq queue. Kept in `shared` so the enqueue side (DB triggers
 * document the same shape; the web app could enqueue too) and the consume side
 * (worker) never drift.
 *
 * The DB enqueue triggers (supabase/migrations/*_queue.sql) build these exact
 * JSON shapes — keep them in sync.
 */

/** HeyGen avatar quality/cost tier (mirrors DB enum `avatar_tier`). */
export const AVATAR_TIERS = ['iii', 'iv'] as const;
export type AvatarTier = (typeof AVATAR_TIERS)[number];

export const JOB_TYPES = [
  'generate_script',
  'generate_video',
  'poll_video',
  'collect_performance',
] as const;
export type JobType = (typeof JOB_TYPES)[number];

interface JobBase {
  readonly type: JobType;
  /** Tenant scoping — the worker bypasses RLS and MUST filter on this (spec §2). */
  readonly account_id: string;
}

/** Generate N script angles for an approved product (handled in T4). */
export interface GenerateScriptJob extends JobBase {
  readonly type: 'generate_script';
  readonly product_id: string;
  /** Override the default number of angles; handler falls back to its default. */
  readonly variants?: number;
}

/** Submit a HeyGen video for an approved script (handled in T5). */
export interface GenerateVideoJob extends JobBase {
  readonly type: 'generate_video';
  readonly product_id: string;
  readonly script_id: string;
  readonly avatar_tier?: AvatarTier;
}

/** Poll a submitted HeyGen job until it completes (handled in T5). */
export interface PollVideoJob extends JobBase {
  readonly type: 'poll_video';
  readonly video_id: string;
}

/** Collect performance metrics for a publication (handled in T8). */
export interface CollectPerformanceJob extends JobBase {
  readonly type: 'collect_performance';
  readonly publication_id: string;
}

export type PipelineJob =
  | GenerateScriptJob
  | GenerateVideoJob
  | PollVideoJob
  | CollectPerformanceJob;

/** Runtime guard: is an unknown value a well-formed PipelineJob? */
export function isPipelineJob(value: unknown): value is PipelineJob {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v['account_id'] !== 'string') return false;
  switch (v['type']) {
    case 'generate_script':
      return typeof v['product_id'] === 'string';
    case 'generate_video':
      return typeof v['product_id'] === 'string' && typeof v['script_id'] === 'string';
    case 'poll_video':
      return typeof v['video_id'] === 'string';
    case 'collect_performance':
      return typeof v['publication_id'] === 'string';
    default:
      return false;
  }
}
