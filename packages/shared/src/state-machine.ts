/**
 * The pipeline state machine (spec §4).
 *
 * Single source of truth for the allowed-transition graph, mirrored in the DB
 * `pipeline_status` enum. Each stage is read by one step which writes the next.
 * Two transitions require a human (HITL): product approval and script approval
 * (the latter gates the expensive HeyGen call). 'rejected'/'archived' are
 * terminal.
 *
 * Keep this list in sync with supabase/migrations/*_enums.sql.
 */
export const PIPELINE_STATUSES = [
  'product_candidate',
  'product_approved',
  'script_generating',
  'script_ready',
  'script_approved',
  'video_generating',
  'video_ready',
  'compliance_review',
  'ready_to_publish',
  'published',
  'tracking',
  'archived',
  'rejected',
] as const;

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

/**
 * Affiliate source platforms (mirrors the DB `affiliate_platform` enum). TikTok
 * Shop today; Amazon/Shopee are typed for the future adapter (spec §11).
 */
export const AFFILIATE_PLATFORMS = ['tiktok_shop', 'amazon', 'shopee'] as const;
export type AffiliatePlatform = (typeof AFFILIATE_PLATFORMS)[number];

/** Who is allowed to trigger a transition. */
export type TransitionActor = 'system' | 'user';

export interface Transition {
  readonly to: PipelineStatus;
  /** 'user' = manual HITL action in the dashboard; 'system' = worker. */
  readonly by: TransitionActor;
  /** Human-readable note for audit/UI. */
  readonly note?: string;
}

/**
 * Allowed transitions out of each status. A status not present as a key, or an
 * empty array, means terminal (no outgoing transitions).
 *
 * Note (§4): a HeyGen failure does NOT change status — the video stays in
 * `video_generating` with `error` set and `retry_count` incremented — so there
 * is no transition modelling failure here.
 */
export const PIPELINE_TRANSITIONS: Readonly<Record<PipelineStatus, readonly Transition[]>> = {
  product_candidate: [
    { to: 'product_approved', by: 'user', note: 'Operador aprova o produto na fila de seleção.' },
    { to: 'rejected', by: 'user' },
  ],
  product_approved: [
    { to: 'script_generating', by: 'system', note: 'Enfileira generate_script.' },
  ],
  script_generating: [
    { to: 'script_ready', by: 'system' },
  ],
  script_ready: [
    { to: 'script_approved', by: 'user', note: 'HITL: bloqueia a chamada ao HeyGen até aprovação.' },
    { to: 'script_generating', by: 'user', note: 'Regerar variações de ângulo.' },
    { to: 'rejected', by: 'user' },
  ],
  script_approved: [
    { to: 'video_generating', by: 'system', note: 'Enfileira generate_video (custo!).' },
  ],
  video_generating: [
    { to: 'video_ready', by: 'system' },
  ],
  video_ready: [
    { to: 'compliance_review', by: 'system' },
  ],
  compliance_review: [
    { to: 'ready_to_publish', by: 'user', note: 'Exige checklist de compliance completo (§9).' },
    { to: 'rejected', by: 'user' },
  ],
  ready_to_publish: [
    { to: 'published', by: 'user', note: 'Publicação manual; operador cola a URL do post.' },
  ],
  published: [
    { to: 'tracking', by: 'system' },
  ],
  tracking: [
    { to: 'archived', by: 'user' },
  ],
  archived: [],
  rejected: [],
};

export const TERMINAL_STATUSES = ['archived', 'rejected'] as const satisfies readonly PipelineStatus[];

/** Is `to` a valid next status from `from`? */
export function canTransition(from: PipelineStatus, to: PipelineStatus): boolean {
  return PIPELINE_TRANSITIONS[from].some((t) => t.to === to);
}

/** All transitions available out of `from`. */
export function nextTransitions(from: PipelineStatus): readonly Transition[] {
  return PIPELINE_TRANSITIONS[from];
}

/** Does this transition require a human action (HITL)? */
export function isManualTransition(from: PipelineStatus, to: PipelineStatus): boolean {
  return PIPELINE_TRANSITIONS[from].some((t) => t.to === to && t.by === 'user');
}

/** Has the pipeline reached a terminal state? */
export function isTerminal(status: PipelineStatus): boolean {
  return (TERMINAL_STATUSES as readonly PipelineStatus[]).includes(status);
}

/**
 * Linear rank of a status along the happy-path pipeline (its index in
 * PIPELINE_STATUSES, which is authored in pipeline order). Used by workers for
 * idempotency guards ("has this entity already advanced past stage X?"). The
 * terminal off-ramps (`archived`, `rejected`) rank last; comparisons between a
 * terminal and a mid-pipeline status aren't meaningful — guard with isTerminal.
 */
export function pipelineRank(status: PipelineStatus): number {
  return PIPELINE_STATUSES.indexOf(status);
}

/** True if `status` is at or beyond `target` on the happy path (terminals excluded). */
export function isAtOrBeyond(status: PipelineStatus, target: PipelineStatus): boolean {
  if (isTerminal(status)) return false;
  return pipelineRank(status) >= pipelineRank(target);
}
