/**
 * Worker configuration. Loads `.env` (if present) and reads the runtime knobs.
 * The HeyGen concurrency cap (spec §5: max 10 concurrent jobs) and the queue
 * poll cadence live here so they are tunable without code changes.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Node 20.12+/22 can load a dotenv file without a dependency. Best-effort: in
// production the env is provided by the platform (Railway/Render), so a missing
// .env is not an error. We search upward from cwd so the worker finds the repo
// root .env even when launched from apps/worker (pnpm sets cwd to the package).
function findEnvFile(): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const envPath = findEnvFile();
if (envPath) {
  try {
    process.loadEnvFile?.(envPath);
  } catch {
    // unreadable .env — rely on the ambient environment
  }
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Env ${name} must be a positive integer, got "${raw}"`);
  }
  return n;
}

export interface WorkerConfig {
  readonly queueName: string;
  /** How many jobs the worker processes concurrently overall. */
  readonly maxConcurrency: number;
  /** Hard cap on concurrent HeyGen jobs (spec §5 — provider limit is 10). */
  readonly heygenMaxConcurrency: number;
  /** pgmq visibility timeout (s): how long a read job is hidden before retry. */
  readonly visibilityTimeoutSeconds: number;
  /** Idle backoff between empty polls (ms). */
  readonly pollIntervalMs: number;
  /** Re-poll delay for in-flight HeyGen jobs (s). */
  readonly videoPollDelaySeconds: number;
  /** Max delivery attempts before a job is archived to the dead-letter (read_ct). */
  readonly maxAttempts: number;
  /** Max HeyGen re-submission attempts on job failure before giving up (spec §4). */
  readonly maxVideoRetries: number;
  /** Duration (s) assumed for the cost estimate at submit time. */
  readonly estimatedVideoDurationSeconds: number;
  /** Optional secrets — handlers validate presence when they actually need them. */
  readonly anthropicApiKey: string | undefined;
  readonly heygenApiKey: string | undefined;
  /** HeyGen account-specific avatar/voice ids (required to submit a video). */
  readonly heygenAvatarId: string | undefined;
  readonly heygenVoiceId: string | undefined;
}

export function loadConfig(): WorkerConfig {
  return {
    queueName: process.env['WORKER_QUEUE_NAME'] ?? 'ai_shop_jobs',
    maxConcurrency: int('WORKER_MAX_CONCURRENCY', 8),
    heygenMaxConcurrency: int('HEYGEN_MAX_CONCURRENCY', 10),
    visibilityTimeoutSeconds: int('WORKER_VISIBILITY_TIMEOUT_S', 120),
    pollIntervalMs: int('WORKER_POLL_INTERVAL_MS', 2000),
    videoPollDelaySeconds: int('WORKER_VIDEO_POLL_DELAY_S', 20),
    maxAttempts: int('WORKER_MAX_ATTEMPTS', 25),
    maxVideoRetries: int('WORKER_MAX_VIDEO_RETRIES', 3),
    estimatedVideoDurationSeconds: int('WORKER_EST_VIDEO_DURATION_S', 30),
    anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
    heygenApiKey: process.env['HEYGEN_API_KEY'],
    heygenAvatarId: process.env['HEYGEN_AVATAR_ID'],
    heygenVoiceId: process.env['HEYGEN_VOICE_ID'],
  };
}
