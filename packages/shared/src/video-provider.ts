/**
 * Video generation provider (spec §8, §11). `VideoProvider` abstracts the video
 * vendor behind a swappable boundary — HeyGen today. Generation is ASYNCHRONOUS
 * (submit -> jobId -> poll), and COST is a first-class citizen (spec §3): submit
 * records an estimate, poll records the actual.
 */

import type { AvatarTier } from './jobs.js';

/** HeyGen pay-as-you-go rates in USD per minute, by avatar tier (spec §2). */
export const HEYGEN_USD_PER_MINUTE: Record<AvatarTier, number> = {
  iii: 1, // Avatar III ~ US$1/min (1080p) — default for format testing
  iv: 4, // Avatar IV ~ US$4/min — only for validated formats
};

/** Cost in USD for a clip of `durationSeconds` at the given tier. */
export function heygenCostUsd(durationSeconds: number, tier: AvatarTier): number {
  const usd = (durationSeconds / 60) * HEYGEN_USD_PER_MINUTE[tier];
  // Round to 4 decimals to match the numeric(10,4) cost columns.
  return Math.round(usd * 10000) / 10000;
}

export interface VideoSubmitRequest {
  /** The approved script to voice/animate. */
  readonly script: { readonly hook: string; readonly body: string; readonly cta: string };
  readonly avatarTier: AvatarTier;
  /** Best-effort duration guess used for the cost estimate (seconds). */
  readonly estimatedDurationSeconds: number;
}

export interface VideoSubmitResult {
  /** Provider job id (stored as `videos.heygen_job_id`). */
  readonly jobId: string;
  /** Estimated cost in USD recorded at submission (spec §3, §5). */
  readonly costUsdEstimated: number;
}

export type VideoJobStatus = 'pending' | 'completed' | 'failed';

export interface VideoPollResult {
  readonly status: VideoJobStatus;
  readonly videoUrl?: string;
  readonly durationSeconds?: number;
  /** Actual cost in USD, known once the clip's real duration is available. */
  readonly costUsdActual?: number;
  readonly error?: string;
}

export interface VideoProvider {
  /** Provider name, for logging. */
  readonly name: string;
  /** Submit a generation job; returns the job id and the cost estimate. */
  submit(req: VideoSubmitRequest): Promise<VideoSubmitResult>;
  /** Poll a job's status. */
  poll(jobId: string): Promise<VideoPollResult>;
}
